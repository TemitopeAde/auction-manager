import { useLoaderData, useSearchParams } from "react-router";
import type { ActionFunctionArgs, LinksFunction, LoaderFunctionArgs, ShouldRevalidateFunction } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createInvoice } from "../shopify/draft-order.server";
import { ensureAuctionCheckoutValidation, syncAuctionCheckoutLock } from "../shopify/auction-metafields.server";
import styles from "../components/dashboard/styles";
import dashboardCss from "../components/dashboard/dashboard.css?url";
import { Sidebar } from "../components/dashboard/Sidebar";
import { OverviewView } from "../components/dashboard/OverviewView";
import { AuctionsView } from "../components/dashboard/AuctionsView";
import { CreateAuctionView } from "../components/dashboard/CreateAuctionView";
import { OffersView } from "../components/dashboard/OffersView";
import { BiddersView } from "../components/dashboard/BiddersView";
import { VIEW_IDS, setFormatLocale, type ViewId } from "../components/dashboard/shared";
import { AnalyticsView } from "../components/dashboard/AnalyticsView";
import { getAuctionAnalytics, parseRange, type AnalyticsRange } from "../analytics.server";
import { createAuctionSchema, getAuctionFormValues, updateAuctionSchema } from "../validation/auction.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: dashboardCss }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [response, auctionsResult, offers, bidders] = await Promise.all([
    admin.graphql(`#graphql
      query AuctionProducts {
        shop { currencyCode }
      }`),
    prisma.auction.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, include: {
      _count: { select: { bids: true, offers: true } },
      bids: { orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 5 },
    } }),
    prisma.offer.findMany({ where: { shop: session.shop }, orderBy: { createdAt: "desc" }, include: { auction: { select: { title: true } } } }),
    prisma.bidder.findMany({ where: { shop: session.shop }, orderBy: { updatedAt: "desc" } }),
  ]);
  const checkoutProtection = await ensureAuctionCheckoutValidation(admin, session.shop);
  const json = await response.json();
  const now = new Date();
  const auctions = auctionsResult.map((auction) => ({
    ...auction,
    status: auction.status === "CANCELED" ? "CANCELED" : auction.status === "CLOSING" ? "CLOSING" : auction.status === "DRAFT" ? "DRAFT" : auction.closedAt || auction.status === "ENDED" || (auction.endsAt && auction.endsAt <= now) ? "ENDED" : auction.startsAt > now ? "SCHEDULED" : "LIVE",
  }));
  const url = new URL(request.url);
  const currencyCode: string = json.data?.shop?.currencyCode ?? "USD";
  const analytics = await getAuctionAnalytics(session.shop, parseRange(url.searchParams.get("range")), currencyCode);
  return { shop: session.shop, locale: url.searchParams.get("locale"), auctions, offers, bidders, currencyCode, checkoutProtection, analytics };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "create");

  if (intent === "bidder-status") {
    const id = String(form.get("id") ?? "");
    const status = String(form.get("status") ?? "");
    if (!["APPROVED", "BLOCKED", "PENDING"].includes(status)) return { error: "Choose a valid bidder status." };
    const update = await prisma.bidder.updateMany({ where: { id, shop: session.shop }, data: { status } });
    if (!update.count) return { error: "Bidder not found for this store." };
    return { ok: true, message: "Bidder access updated." };
  }
  if (intent === "offer-review") {
    const id = String(form.get("id") ?? "");
    const decision = String(form.get("decision") ?? "");
    const offer = await prisma.offer.findFirst({ where: { id, shop: session.shop, status: "PENDING" } });
    if (!offer) return { error: "This offer is no longer pending." };
    if (decision === "decline") {
      const changed = await prisma.offer.updateMany({ where: { id, shop: session.shop, status: "PENDING" }, data: { status: "DECLINED" } });
      if (!changed.count) return { error: "This offer was already reviewed." };
      return { ok: true, message: "Offer declined." };
    }
    if (decision === "counter") {
      const counterAmountCents = Math.round(Number(form.get("counterAmount")) * 100);
      if (!Number.isFinite(counterAmountCents) || counterAmountCents <= offer.amountCents) return { error: "The counter offer must be higher than the customer's offer." };
      const changed = await prisma.offer.updateMany({ where: { id, shop: session.shop, status: "PENDING" }, data: { status: "COUNTERED", counterAmountCents, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } });
      if (!changed.count) return { error: "This offer was already reviewed." };
      return { ok: true, message: "Counter offer sent. It expires in 48 hours." };
    }
    if (decision === "accept") {
      const changed = await prisma.offer.updateMany({ where: { id, shop: session.shop, status: "PENDING" }, data: { status: "ACCEPTED", expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } });
      if (!changed.count) return { error: "This offer was already reviewed." };
      return { ok: true, message: "Offer accepted. The next scheduled job will email the customer a secure invoice." };
    }
    return { error: "Choose accept, counter, or decline." };
  }

  if (intent === "delete") {
    const id = String(form.get("id") ?? "");
    await prisma.auction.deleteMany({ where: { id, shop: session.shop, status: "DRAFT" } });
    return { ok: true };
  }
  if (intent === "cancel-scheduled") {
    const id = String(form.get("id") ?? "");
    const auction = await prisma.auction.findFirst({ where: { id, shop: session.shop, status: "SCHEDULED", startsAt: { gt: new Date() } } });
    if (!auction) return { error: "Only upcoming auctions can be canceled." };
    await prisma.auction.update({ where: { id: auction.id }, data: { status: "CANCELED", closedAt: new Date() } });
    await syncAuctionCheckoutLock(admin, session.shop, auction.productId);
    return { ok: true, message: "Scheduled auction canceled." };
  }
  if (intent === "revoke-winner") {
    const id = String(form.get("id") ?? "");
    const auction = await prisma.auction.findFirst({ where: { id, shop: session.shop } });
    if (!auction?.closedAt || !auction.winnerCustomerId) return { error: "This auction does not have a winner to revoke." };
    if (auction.draftOrderId) {
      const deleted = await admin.graphql(`#graphql
        mutation RevokeAuctionWinnerDraft($input: DraftOrderDeleteInput!) {
          draftOrderDelete(input: $input) { deletedId userErrors { field message } }
        }`, { variables: { input: { id: auction.draftOrderId } } });
      const result = await deleted.json();
      const payload = result.data?.draftOrderDelete;
      if (!payload?.deletedId || payload.userErrors?.length) {
        return { error: payload?.userErrors?.map((error: { message: string }) => error.message).join("; ") || "The Shopify invoice could not be revoked. It may already have been completed." };
      }
    }
    const revoked = await prisma.auction.updateMany({ where: { id, shop: session.shop, closedAt: { not: null }, winnerCustomerId: auction.winnerCustomerId, draftOrderId: auction.draftOrderId }, data: { winnerCustomerId: null, winnerBidId: null, draftOrderId: null } });
    if (!revoked.count) return { error: "This auction changed while the winner was being revoked. Reload and try again." };
    if (auction.draftOrderId) await prisma.offer.updateMany({ where: { auctionId: id, draftOrderId: auction.draftOrderId }, data: { status: "EXPIRED", draftOrderId: null } });
    return { ok: true, message: "Winner revoked. Select and approve a replacement winner." };
  }
  if (intent === "approve-winner") {
    const id = String(form.get("id") ?? "");
    const bidId = String(form.get("bidId") ?? "");
    const auction = await prisma.auction.findFirst({ where: { id, shop: session.shop } });
    if (!auction?.closedAt || auction.winnerCustomerId || auction.draftOrderId) return { error: "Revoke the current winner before selecting a replacement." };
    const bid = await prisma.bid.findFirst({ where: { id: bidId, auctionId: auction.id } });
    if (!bid) return { error: "Choose a valid bidder from this auction." };
    if (auction.reservePriceCents !== null && bid.amountCents < auction.reservePriceCents) return { error: "This bid did not meet the reserve price." };
    const claimed = await prisma.auction.updateMany({ where: { id, shop: session.shop, closedAt: { not: null }, winnerCustomerId: null, draftOrderId: null }, data: { status: "CLOSING" } });
    if (!claimed.count) return { error: "Another admin action has already changed this auction." };
    try {
      const draftOrderId = await createInvoice(admin, {
        customerId: bid.customerId,
        variantId: auction.variantId,
        title: auction.title,
        amountCents: bid.amountCents,
        buyerPremiumBps: auction.buyersPremiumBps,
        currencyCode: auction.currencyCode,
      });
      await prisma.auction.update({ where: { id: auction.id }, data: { status: "ENDED", winnerCustomerId: bid.customerId, winnerBidId: bid.id, draftOrderId } });
      return { ok: true, message: "Replacement winner approved and Shopify invoice emailed." };
    } catch (error) {
      await prisma.auction.updateMany({ where: { id: auction.id, status: "CLOSING", winnerCustomerId: null }, data: { status: "ENDED" } });
      return { error: error instanceof Error ? error.message : "Could not approve this replacement winner." };
    }
  }
  if (intent === "update-scheduled") {
    const id = String(form.get("id") ?? "");
    const now = new Date();
    const auction = await prisma.auction.findFirst({ where: {
      id, shop: session.shop, status: { in: ["SCHEDULED", "LIVE"] }, closedAt: null,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    }, include: { _count: { select: { bids: true } } } });
    if (!auction) return { error: "Only upcoming or live auctions can be edited." };
    if (auction._count.bids > 0) return { error: "An auction can’t be edited after bidding begins." };
    const parsed = updateAuctionSchema.safeParse(getAuctionFormValues(form));
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the auction details and try again." };
    const {
      title, startsAt, endsAt, startingPrice, reservePrice, buyNowPrice, bidIncrement,
      auctionType, buyersPremiumPercent, offerAutoAccept, offerAutoDecline,
      offersEnabled, popcorn, proxyBidding, requireApprovedBidders,
    } = parsed.data;
    await prisma.auction.update({ where: { id }, data: {
      title, startsAt, endsAt, auctionType,
      startingPriceCents: Math.round(startingPrice * 100),
      bidIncrementCents: Math.round(bidIncrement * 100),
      reservePriceCents: reservePrice === null ? null : Math.round(reservePrice * 100),
      buyNowPriceCents: buyNowPrice === null ? null : Math.round(buyNowPrice * 100),
      buyersPremiumBps: Math.round(buyersPremiumPercent * 100),
      offersEnabled,
      offerAutoAcceptCents: offerAutoAccept === null ? null : Math.round(offerAutoAccept * 100),
      offerAutoDeclineCents: offerAutoDecline === null ? null : Math.round(offerAutoDecline * 100),
      popcornSeconds: popcorn ? 120 : 0,
      proxyBiddingEnabled: proxyBidding,
      requireApprovedBidders,
      status: startsAt > now ? "SCHEDULED" : "LIVE",
    } });
    await syncAuctionCheckoutLock(admin, session.shop, auction.productId);
    return { ok: true, message: "Auction updated." };
  }
  if (intent === "close" || intent === "end-auction") {
    const id = String(form.get("id") ?? "");
    const now = new Date();
    const auction = await prisma.auction.findFirst({ where: { id, shop: session.shop }, include: {
      bids: { orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 1 },
      offers: { where: { status: { in: ["BUY_NOW", "ACCEPTED"] }, draftOrderId: null }, orderBy: { createdAt: "asc" } },
    } });
    if (!auction || (intent === "close" && (!auction.endsAt || auction.endsAt > now)) || (intent === "end-auction" && (auction.startsAt > now || (auction.endsAt && auction.endsAt <= now) || auction.closedAt))) return { error: "This auction can’t be closed in its current state." };
    if (auction.closedAt || auction.draftOrderId) return { error: "This auction has already been closed." };
    const claimed = await prisma.auction.updateMany({
      where: { id: auction.id, shop: session.shop, closedAt: null, draftOrderId: null, status: { in: ["LIVE", "SCHEDULED", "ENDED"] } },
      data: { status: "CLOSING" },
    });
    if (!claimed.count) return { error: "This auction is already being closed." };
    const winningOffer = auction.offers.find((offer) => offer.status === "BUY_NOW")
      ?? auction.offers.find((offer) => offer.status === "ACCEPTED" && (!offer.expiresAt || offer.expiresAt > now));
    const winner = winningOffer ? null : auction.bids[0];
    const winnerCustomerId = winningOffer?.customerId ?? winner?.customerId;
    const winnerAmountCents = winningOffer?.amountCents ?? winner?.amountCents;
    if (!winnerCustomerId || winnerAmountCents === undefined || (!winningOffer && auction.reservePriceCents !== null && winnerAmountCents < auction.reservePriceCents)) {
      await prisma.auction.update({ where: { id: auction.id }, data: { status: "ENDED", endsAt: now, closedAt: now } });
      await prisma.offer.updateMany({ where: { auctionId: auction.id, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } }, data: { status: "EXPIRED" } });
      await syncAuctionCheckoutLock(admin, session.shop, auction.productId);
      return { ok: true, message: "Auction closed without a reserve-qualified winner." };
    }
    try {
      const draftOrderId = await createInvoice(admin, {
        customerId: winnerCustomerId,
        variantId: auction.variantId,
        title: auction.title,
        amountCents: winnerAmountCents,
        buyerPremiumBps: auction.buyersPremiumBps,
        currencyCode: auction.currencyCode,
      });
      if (winningOffer) await prisma.offer.update({ where: { id: winningOffer.id }, data: { draftOrderId } });
      await prisma.auction.update({ where: { id: auction.id }, data: {
        status: "ENDED", endsAt: now, closedAt: now, winnerCustomerId,
        winnerBidId: winner?.id ?? null, draftOrderId,
      } });
      await prisma.offer.updateMany({
        where: { auctionId: auction.id, ...(winningOffer ? { id: { not: winningOffer.id } } : {}), status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
        data: { status: "EXPIRED" },
      });
      await syncAuctionCheckoutLock(admin, session.shop, auction.productId);
      return { ok: true, message: "Winner declared and Shopify invoice emailed." };
    } catch (error) {
      await prisma.auction.updateMany({ where: { id: auction.id, status: "CLOSING", closedAt: null }, data: { status: intent === "end-auction" ? "LIVE" : auction.endsAt && auction.endsAt <= now ? "ENDED" : auction.startsAt > now ? "SCHEDULED" : "LIVE" } });
      return { error: error instanceof Error ? error.message : "Could not close this auction." };
    }
  }
  const parsed = createAuctionSchema.safeParse(getAuctionFormValues(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the auction details and try again." };
  const { productId, title, startsAt, endsAt, startingPrice, reservePrice, buyNowPrice, bidIncrement, auctionType, buyersPremiumPercent, offerAutoAccept, offerAutoDecline, offersEnabled, popcorn, proxyBidding, requireApprovedBidders } = parsed.data;
  const existingAuction = await prisma.auction.findFirst({ where: { shop: session.shop, productId }, select: { id: true } });
  if (existingAuction) return { error: "This product already has an auction. Each product can only have one auction." };
  const productResponse = await admin.graphql(`#graphql
    query AuctionProduct($id: ID!) { shop { currencyCode } product(id: $id) { id title status variants(first: 1) { nodes { id } } } }`, { variables: { id: productId } });
  const productJson = await productResponse.json();
  const selectedProduct = productJson.data?.product;
  if (!selectedProduct || selectedProduct.status !== "ACTIVE" || !selectedProduct.variants?.nodes?.[0]?.id) return { error: "Choose an active product from your store." };
  let createdAuction;
  try {
    createdAuction = await prisma.auction.create({ data: {
      shop: session.shop, productId, variantId: selectedProduct.variants.nodes[0].id, productTitle: selectedProduct.title, title,
      currencyCode: productJson.data?.shop?.currencyCode ?? "USD",
      auctionType,
      startsAt, endsAt, startingPriceCents: Math.round(startingPrice * 100),
      reservePriceCents: reservePrice === null ? null : Math.round(reservePrice * 100),
      buyNowPriceCents: buyNowPrice === null ? null : Math.round(buyNowPrice * 100),
      bidIncrementCents: Math.round(bidIncrement * 100),
      status: startsAt > new Date() ? "SCHEDULED" : "LIVE",
      popcornSeconds: popcorn ? 120 : 0,
      proxyBiddingEnabled: proxyBidding,
      buyersPremiumBps: Math.round(buyersPremiumPercent * 100),
      offersEnabled,
      offerAutoAcceptCents: offerAutoAccept === null ? null : Math.round(offerAutoAccept * 100),
      offerAutoDeclineCents: offerAutoDecline === null ? null : Math.round(offerAutoDecline * 100),
      requireApprovedBidders,
    } });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return { error: "This product already has an auction. Each product can only have one auction." };
    }
    throw error;
  }
  try {
    await syncAuctionCheckoutLock(admin, session.shop, createdAuction.productId);
  } catch (error) {
    await prisma.auction.delete({ where: { id: createdAuction.id } });
    return { error: error instanceof Error ? error.message : "Could not enable the checkout lock for this product." };
  }
  return { ok: true, message: "Auction created." };
};

const VIEW_TITLES: Record<ViewId, string> = { overview: "Overview", analytics: "Analytics", auctions: "Auctions", create: "New auction", offers: "Offers", bidders: "Bidders" };

// Switching dashboard views only changes `?view=`; don't refetch products and auctions for that.
export const shouldRevalidate: ShouldRevalidateFunction = ({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }) => {
  if (formMethod || currentUrl.pathname !== nextUrl.pathname) return defaultShouldRevalidate;
  const current = new URLSearchParams(currentUrl.search);
  const next = new URLSearchParams(nextUrl.search);
  current.delete("view");
  next.delete("view");
  return current.toString() === next.toString() ? false : defaultShouldRevalidate;
};

export default function AuctionsPage() {
  const data = useLoaderData<typeof loader>();
  setFormatLocale(data.locale);
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("view") as ViewId | null;
  const view: ViewId = requested && VIEW_IDS.includes(requested) ? requested : "overview";

  const changeRange = (range: AnalyticsRange) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("range", String(range));
      return params;
    }, { replace: true, preventScrollReset: true });
  };

  const navigate = (next: ViewId) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.set("view", next);
      return params;
    }, { replace: true, preventScrollReset: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  const counts = {
    attention: data.offers.filter((o) => o.status === "PENDING").length + data.auctions.filter((a) => a.status === "ENDED" && !a.closedAt).length,
    auctions: data.auctions.length,
    pendingOffers: data.offers.filter((o) => o.status === "PENDING").length,
    bidders: data.bidders.length,
  };

  return (
    <s-page heading={VIEW_TITLES[view]} inlineSize="large">
      {view !== "create" && <s-button slot="primary-action" variant="primary" onClick={() => navigate("create")}>New auction</s-button>}
      <div className={styles.layout}>
        <Sidebar view={view} onNavigate={navigate} shop={data.shop} currencyCode={data.currencyCode} counts={counts} protectionEnabled={Boolean(data.checkoutProtection.enabled)} />
        <main className={styles.main}>
          {view === "overview" && <OverviewView data={data} onNavigate={navigate} />}
          {view === "auctions" && <AuctionsView data={data} onNavigate={navigate} />}
          {view === "create" && <CreateAuctionView data={data} onNavigate={navigate} />}
          {view === "analytics" && <AnalyticsView data={data} onRangeChange={changeRange} />}
          {view === "offers" && <OffersView data={data} />}
          {view === "bidders" && <BiddersView data={data} />}
        </main>
      </div>
    </s-page>
  );
}
