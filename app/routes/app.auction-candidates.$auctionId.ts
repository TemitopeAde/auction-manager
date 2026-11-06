import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const auction = await prisma.auction.findFirst({
    where: { id: params.auctionId, shop: session.shop, closedAt: { not: null }, winnerCustomerId: null },
    select: { id: true, reservePriceCents: true },
  });
  if (!auction) return { candidates: [], error: "This auction is not ready for a replacement winner." };

  const bids = await prisma.bid.findMany({
    where: { auctionId: auction.id },
    orderBy: [{ amountCents: "desc" }, { createdAt: "asc" }],
    take: 200,
    select: { id: true, customerId: true, amountCents: true },
  });
  const seen = new Set<string>();
  const candidates = bids.filter((bid) => {
    if (seen.has(bid.customerId) || (auction.reservePriceCents !== null && bid.amountCents < auction.reservePriceCents)) return false;
    seen.add(bid.customerId);
    return true;
  });
  return { candidates, error: null };
};
