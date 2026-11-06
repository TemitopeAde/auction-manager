import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("product_id");
  if (!shop || !productId) return json({ error: "Missing shop or product." }, 400);

  const now = new Date();
  const customerId = url.searchParams.get("logged_in_customer_id");
  const customerLoggedIn = Boolean(customerId && /^[1-9]\d*$/.test(customerId));
  const auction = await prisma.auction.findFirst({
    where: { shop, productId, startsAt: { lte: now }, endsAt: { gt: now }, status: { in: ["LIVE", "SCHEDULED"] } },
    orderBy: { createdAt: "desc" },
    include: { bids: { orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 1 }, _count: { select: { bids: true } } },
  });
  if (!auction) return json({ auction: null });
  const myOffer = customerLoggedIn && customerId ? await prisma.offer.findFirst({
    where: { auctionId: auction.id, customerId, status: { in: ["PENDING", "COUNTERED", "ACCEPTED", "DECLINED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, counterAmountCents: true, amountCents: true },
  }) : null;
  return json({ auction: {
    id: auction.id, title: auction.title, startsAt: auction.startsAt, endsAt: auction.endsAt,
    currencyCode: auction.currencyCode, startingPriceCents: auction.startingPriceCents,
    bidIncrementCents: auction.bidIncrementCents, buyNowPriceCents: auction.buyNowPriceCents,
    auctionType: auction.auctionType, proxyBiddingEnabled: auction.proxyBiddingEnabled,
    offersEnabled: auction.offersEnabled,
    currentBidCents: auction.bids[0]?.amountCents ?? null, bidCount: auction._count.bids,
  }, myOffer, customerLoggedIn });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("product_id");
  const customerId = url.searchParams.get("logged_in_customer_id");
  if (!shop || !productId) return json({ error: "Missing shop or product." }, 400);
  if (!customerId || !/^[1-9]\d*$/.test(customerId)) return json({ error: "Log in to your customer account to bid." }, 401);

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "bid");
  const auctionId = String(form.get("auctionId") ?? "");
  const auction = await prisma.auction.findFirst({ where: { id: auctionId, shop, productId } });
  const now = new Date();
  if (!auction || auction.startsAt > now || auction.endsAt <= now || auction.closedAt || !["LIVE", "SCHEDULED"].includes(auction.status)) {
    return json({ error: "This auction is not accepting actions." }, 400);
  }

  const bidder = await prisma.bidder.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (bidder?.status === "BLOCKED") return json({ error: "Your bidding account is blocked by this store." }, 403);
  if (!bidder) {
    const status = auction.requireApprovedBidders ? "PENDING" : "APPROVED";
    await prisma.bidder.create({ data: { shop, customerId, status } });
    if (status === "PENDING") return json({ error: "Your bidder approval is pending." }, 403);
  }
  if (auction.requireApprovedBidders && bidder?.status !== "APPROVED") return json({ error: "Your bidder approval is pending." }, 403);

  if (intent === "offer" || intent === "buy-now") {
    if (intent === "offer" && !auction.offersEnabled) return json({ error: "Offers are not enabled for this auction." }, 400);
    const amountCents = intent === "buy-now" ? auction.buyNowPriceCents : Math.round(Number(form.get("amount")) * 100);
    if (!amountCents || amountCents <= 0) return json({ error: "Enter a valid offer amount." }, 400);
    if (intent === "buy-now") {
      const offer = await prisma.offer.create({ data: {
        auctionId, shop, productId, customerId, amountCents, status: "BUY_NOW",
      } });
      await prisma.auction.update({ where: { id: auctionId }, data: { endsAt: now } });
      return json({ ok: true, status: "BUY_NOW", offerId: offer.id });
    }

    const status = auction.offerAutoDeclineCents !== null && amountCents < auction.offerAutoDeclineCents
      ? "DECLINED"
      : auction.offerAutoAcceptCents !== null && amountCents >= auction.offerAutoAcceptCents
        ? "ACCEPTED"
        : "PENDING";
    const offer = await prisma.offer.create({ data: {
      auctionId, shop, productId, customerId, amountCents, status,
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
    } });
    return json({ ok: true, status, offerId: offer.id });
  }

  if (intent === "accept-counter") {
    const offerId = String(form.get("offerId") ?? "");
    const offer = await prisma.offer.findFirst({ where: { id: offerId, auctionId, shop, customerId, status: "COUNTERED", expiresAt: { gt: now } } });
    if (!offer?.counterAmountCents) return json({ error: "This counter offer is no longer available." }, 400);
    await prisma.offer.update({ where: { id: offer.id }, data: { status: "ACCEPTED", amountCents: offer.counterAmountCents, counterAmountCents: null } });
    return json({ ok: true, status: "ACCEPTED" });
  }

  const amount = String(form.get("amount") ?? "");
  if (intent !== "bid" || (auction.auctionType !== "PENNY" && !/^\d+(\.\d{1,2})?$/.test(amount))) return json({ error: "Enter a valid bid amount." }, 400);
  const enteredAmountCents = auction.auctionType === "PENNY" ? 0 : Math.round(Number(amount) * 100);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const highest = await tx.bid.findFirst({ where: { auctionId }, orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }] });
      const step = auction.auctionType === "PENNY" ? 1 : auction.bidIncrementCents;
      const requiredAmount = highest ? highest.amountCents + step : auction.startingPriceCents;
      if (auction.auctionType !== "PENNY" && enteredAmountCents < requiredAmount) throw new Error(`The next bid must be at least ${(requiredAmount / 100).toFixed(2)}.`);

      let bidCustomerId = customerId;
      let amountCents = auction.auctionType === "PENNY" ? requiredAmount : enteredAmountCents;
      if (auction.proxyBiddingEnabled && auction.auctionType !== "PENNY") {
        await tx.proxyBid.upsert({
          where: { auctionId_customerId: { auctionId, customerId } },
          create: { auctionId, customerId, maxBidCents: enteredAmountCents },
          update: { maxBidCents: { set: enteredAmountCents } },
        });
        const leaders = await tx.proxyBid.findMany({ where: { auctionId }, orderBy: [{ maxBidCents: "desc" }, { createdAt: "asc" }], take: 2 });
        const leader = leaders[0];
        const runnerUp = leaders[1];
        if (!leader || leader.customerId !== customerId) throw new Error(`The next bid must be at least ${(requiredAmount / 100).toFixed(2)}.`);
        bidCustomerId = leader.customerId;
        amountCents = runnerUp ? Math.min(leader.maxBidCents, Math.max(auction.startingPriceCents, runnerUp.maxBidCents + auction.bidIncrementCents)) : auction.startingPriceCents;
      }
      await tx.bid.create({ data: { auctionId, customerId: bidCustomerId, amountCents } });
      const updatedEndsAt = auction.popcornSeconds > 0 && auction.endsAt.getTime() - now.getTime() <= auction.popcornSeconds * 1000
        ? new Date(auction.endsAt.getTime() + auction.popcornSeconds * 1000)
        : auction.endsAt;
      if (updatedEndsAt !== auction.endsAt) await tx.auction.update({ where: { id: auction.id }, data: { endsAt: updatedEndsAt } });
      return { currentBidCents: amountCents, endsAt: updatedEndsAt };
    });
    return json({ ok: true, ...result });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to place your bid." }, 400);
  }
};
