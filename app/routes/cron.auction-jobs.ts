import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { createInvoice } from "../shopify/draft-order.server";
import { syncAuctionCheckoutLock } from "../shopify/auction-metafields.server";

const runJobs = async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shops = await prisma.session.findMany({ distinct: ["shop"], select: { shop: true } });
  const now = new Date();
  let started = 0;
  let closed = 0;
  let invoices = 0;
  let failed = 0;

  for (const { shop } of shops) {
    const { admin } = await unauthenticated.admin(shop);
    const syncLock = async (productId: string) => {
      try {
        await syncAuctionCheckoutLock(admin, shop, productId);
      } catch {
        failed++;
      }
    };
    const startingAuctions = await prisma.auction.findMany({
      where: { shop, status: "SCHEDULED", startsAt: { lte: now }, endsAt: { gt: now }, closedAt: null },
      select: { id: true, productId: true },
    });
    for (const auction of startingAuctions) {
      const update = await prisma.auction.updateMany({ where: { id: auction.id, status: "SCHEDULED" }, data: { status: "LIVE" } });
      if (update.count) started++;
      await syncLock(auction.productId);
    }

    const endingAuctions = await prisma.auction.findMany({
      where: { shop, status: { in: ["LIVE", "SCHEDULED"] }, endsAt: { lte: now }, closedAt: null },
      include: {
        bids: { orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 1 },
        offers: { where: { status: { in: ["BUY_NOW", "ACCEPTED"] }, draftOrderId: null }, orderBy: { createdAt: "asc" } },
      },
    });
    for (const auction of endingAuctions) {
      const claim = await prisma.auction.updateMany({
        where: { id: auction.id, closedAt: null, status: { in: ["LIVE", "SCHEDULED"] } },
        data: { status: "CLOSING" },
      });
      if (!claim.count) continue;
      const winningOffer = auction.offers.find((offer) => offer.status === "BUY_NOW")
        ?? auction.offers.find((offer) => offer.status === "ACCEPTED" && (!offer.expiresAt || offer.expiresAt > now));
      const winner = winningOffer ? null : auction.bids[0];
      const winningCustomerId = winningOffer?.customerId ?? winner?.customerId;
      const winningAmountCents = winningOffer?.amountCents ?? winner?.amountCents;
      const reserveMet = winningAmountCents !== undefined && (winningOffer !== undefined || auction.reservePriceCents === null || winningAmountCents >= auction.reservePriceCents);
      let draftOrderId: string | null = null;
      try {
        if (winningCustomerId && winningAmountCents !== undefined && reserveMet) {
          draftOrderId = await createInvoice(admin, {
            customerId: winningCustomerId,
            variantId: auction.variantId,
            title: auction.title,
            amountCents: winningAmountCents,
            buyerPremiumBps: auction.buyersPremiumBps,
            currencyCode: auction.currencyCode,
          });
          if (winningOffer) await prisma.offer.update({ where: { id: winningOffer.id }, data: { draftOrderId } });
          invoices++;
        }
        const result = await prisma.auction.updateMany({
          where: { id: auction.id, status: "CLOSING", closedAt: null },
          data: {
            status: "ENDED",
            closedAt: now,
            ...(winningCustomerId && reserveMet ? { winnerCustomerId: winningCustomerId, winnerBidId: winner?.id ?? null, draftOrderId } : {}),
          },
        });
        if (!result.count) continue;
        closed++;
        await prisma.offer.updateMany({
          where: { auctionId: auction.id, ...(winningOffer ? { id: { not: winningOffer.id } } : {}), status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } },
          data: { status: "EXPIRED" },
        });
      } catch {
        failed++;
        await prisma.auction.updateMany({ where: { id: auction.id, status: "CLOSING", closedAt: null }, data: { status: auction.startsAt > now ? "SCHEDULED" : "LIVE" } });
      }
      await syncLock(auction.productId);
    }

    const acceptedOffers = await prisma.offer.findMany({
      where: { shop, status: "ACCEPTED", draftOrderId: null, expiresAt: { gt: now }, auction: { closedAt: null } },
      include: { auction: true },
      orderBy: { createdAt: "asc" },
    });
    for (const offer of acceptedOffers) {
      const claim = await prisma.auction.updateMany({ where: { id: offer.auctionId, closedAt: null, status: { in: ["LIVE", "SCHEDULED"] } }, data: { status: "CLOSING" } });
      if (!claim.count) continue;
      try {
        const draftOrderId = await createInvoice(admin, {
          customerId: offer.customerId,
          variantId: offer.auction.variantId,
          title: offer.auction.title,
          amountCents: offer.amountCents,
          buyerPremiumBps: offer.auction.buyersPremiumBps,
          currencyCode: offer.auction.currencyCode,
        });
        const saved = await prisma.offer.updateMany({ where: { id: offer.id, status: "ACCEPTED", draftOrderId: null }, data: { draftOrderId } });
        if (!saved.count) {
          await prisma.auction.updateMany({ where: { id: offer.auctionId, status: "CLOSING", closedAt: null }, data: { status: offer.auction.startsAt > now ? "SCHEDULED" : "LIVE" } });
          continue;
        }
        invoices++;
        await prisma.auction.updateMany({ where: { id: offer.auctionId, status: "CLOSING", closedAt: null }, data: { status: "ENDED", endsAt: now, closedAt: now, winnerCustomerId: offer.customerId, draftOrderId } });
        await prisma.offer.updateMany({ where: { auctionId: offer.auctionId, id: { not: offer.id }, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] } }, data: { status: "EXPIRED" } });
        await syncLock(offer.productId);
      } catch {
        failed++;
        await prisma.auction.updateMany({ where: { id: offer.auctionId, status: "CLOSING", closedAt: null }, data: { status: offer.auction.startsAt > now ? "SCHEDULED" : "LIVE" } });
      }
    }
    await prisma.offer.updateMany({ where: { shop, status: { in: ["PENDING", "COUNTERED", "ACCEPTED"] }, expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
    const auctionProducts = await prisma.auction.findMany({ where: { shop }, distinct: ["productId"], select: { productId: true } });
    for (const { productId } of auctionProducts) await syncLock(productId);
  }

  return Response.json({ shops: shops.length, started, closed, invoices, failed });
};

export const loader = async ({ request }: LoaderFunctionArgs) => runJobs(request);
export const action = async ({ request }: ActionFunctionArgs) => runJobs(request);
