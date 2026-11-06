import prisma from "./db.server";

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

const DAY = 24 * 60 * 60 * 1000;

export const parseRange = (value: string | null): AnalyticsRange => {
  const days = Number(value);
  return (ANALYTICS_RANGES as readonly number[]).includes(days) ? (days as AnalyticsRange) : 30;
};

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Auction performance for one shop over the last `range` days, compared with the
 * `range` days before that. Sales are hammer prices (winning bid or accepted/buy-now
 * offer) in the store currency, excluding buyer premium.
 */
export async function getAuctionAnalytics(shop: string, range: AnalyticsRange, currencyCode: string) {
  const now = new Date();
  const start = new Date(startOfUtcDay(now).getTime() - (range - 1) * DAY);
  const prevStart = new Date(start.getTime() - range * DAY);

  const [bids, closedAuctions, offers] = await Promise.all([
    prisma.bid.findMany({
      where: { auction: { shop }, createdAt: { gte: prevStart } },
      select: { auctionId: true, customerId: true, amountCents: true, createdAt: true },
    }),
    prisma.auction.findMany({
      where: { shop, closedAt: { gte: prevStart } },
      select: {
        id: true, status: true, closedAt: true, currencyCode: true, startingPriceCents: true, reservePriceCents: true,
        winnerCustomerId: true,
        _count: { select: { bids: true } },
        bids: { orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }], take: 1, select: { amountCents: true } },
        offers: { where: { status: { in: ["BUY_NOW", "ACCEPTED"] }, draftOrderId: { not: null } }, take: 1, select: { amountCents: true } },
      },
    }),
    prisma.offer.findMany({ where: { shop, createdAt: { gte: start } }, select: { status: true } }),
  ]);

  // ---- Closed auctions → outcomes and sales ----
  const closed = closedAuctions.map((a) => {
    const sold = !!a.winnerCustomerId;
    // Winner is either an invoiced buy-now/accepted offer or the top bid.
    const hammerCents = sold ? (a.offers[0]?.amountCents ?? a.bids[0]?.amountCents ?? 0) : 0;
    const outcome =
      a.status === "CANCELED" ? "canceled"
      : sold ? "sold"
      : a._count.bids === 0 ? "noBids"
      : "reserveNotMet";
    return { ...a, sold, hammerCents, outcome, inStoreCurrency: a.currencyCode === currencyCode };
  });
  const inPeriod = <T extends { closedAt: Date | null }>(rows: T[], from: Date, to: Date) =>
    rows.filter((r) => r.closedAt && r.closedAt >= from && r.closedAt < to);
  const current = inPeriod(closed, start, new Date(now.getTime() + 1));
  const previous = inPeriod(closed, prevStart, start);

  const salesCents = (rows: typeof closed) => rows.filter((r) => r.sold && r.inStoreCurrency).reduce((t, r) => t + r.hammerCents, 0);
  const sellThrough = (rows: typeof closed) => {
    const decided = rows.filter((r) => r.outcome !== "canceled");
    return decided.length ? rows.filter((r) => r.sold).length / decided.length : null;
  };
  const upliftRows = current.filter((r) => r.sold && r.startingPriceCents > 0);
  const avgUplift = upliftRows.length ? upliftRows.reduce((t, r) => t + (r.hammerCents / r.startingPriceCents - 1), 0) / upliftRows.length : null;

  // ---- Bids ----
  const currentBids = bids.filter((b) => b.createdAt >= start);
  const previousBids = bids.filter((b) => b.createdAt < start);

  // ---- Time series (daily for ≤30 days, weekly for 90) ----
  const bucketDays = range > 30 ? 7 : 1;
  const bucketCount = Math.ceil(range / bucketDays);
  const series = Array.from({ length: bucketCount }, (_, i) => ({
    start: new Date(start.getTime() + i * bucketDays * DAY).toISOString(),
    bids: 0,
    salesCents: 0,
  }));
  const bucketOf = (d: Date) => Math.min(bucketCount - 1, Math.floor((d.getTime() - start.getTime()) / (bucketDays * DAY)));
  for (const b of currentBids) series[bucketOf(b.createdAt)].bids += 1;
  for (const a of current) if (a.sold && a.inStoreCurrency && a.closedAt) series[bucketOf(a.closedAt)].salesCents += a.hammerCents;

  // ---- Top auctions by bidding activity this period ----
  const byAuction = new Map<string, { bids: number; bidders: Set<string>; highCents: number }>();
  for (const b of currentBids) {
    const row = byAuction.get(b.auctionId) ?? { bids: 0, bidders: new Set<string>(), highCents: 0 };
    row.bids += 1;
    row.bidders.add(b.customerId);
    row.highCents = Math.max(row.highCents, b.amountCents);
    byAuction.set(b.auctionId, row);
  }
  const topIds = [...byAuction.entries()].sort((a, b) => b[1].bids - a[1].bids).slice(0, 5);
  const topMeta = await prisma.auction.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, title: true, productTitle: true, currencyCode: true, startingPriceCents: true },
  });
  const topAuctions = topIds.flatMap(([id, row]) => {
    const meta = topMeta.find((m) => m.id === id);
    return meta ? [{ ...meta, bids: row.bids, bidders: row.bidders.size, highCents: row.highCents }] : [];
  });

  // ---- Offers ----
  const offerCounts = { received: offers.length, accepted: 0, countered: 0, declined: 0, expired: 0, pending: 0 };
  for (const o of offers) {
    if (o.status === "ACCEPTED" || o.status === "BUY_NOW") offerCounts.accepted += 1;
    else if (o.status === "COUNTERED") offerCounts.countered += 1;
    else if (o.status === "DECLINED") offerCounts.declined += 1;
    else if (o.status === "EXPIRED") offerCounts.expired += 1;
    else if (o.status === "PENDING") offerCounts.pending += 1;
  }

  const count = (outcome: string) => current.filter((r) => r.outcome === outcome).length;

  return {
    range,
    bucketDays,
    kpis: {
      salesCents: salesCents(current),
      prevSalesCents: salesCents(previous),
      sellThrough: sellThrough(current),
      prevSellThrough: sellThrough(previous),
      bids: currentBids.length,
      prevBids: previousBids.length,
      uniqueBidders: new Set(currentBids.map((b) => b.customerId)).size,
      prevUniqueBidders: new Set(previousBids.map((b) => b.customerId)).size,
      auctionsSold: count("sold"),
      avgUplift,
    },
    series,
    outcomes: { sold: count("sold"), reserveNotMet: count("reserveNotMet"), noBids: count("noBids"), canceled: count("canceled") },
    offers: offerCounts,
    topAuctions,
  };
}

export type AuctionAnalytics = Awaited<ReturnType<typeof getAuctionAnalytics>>;
