import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 50;

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const auction = await prisma.auction.findFirst({
    where: { id: params.auctionId, shop: session.shop },
    select: { id: true },
  });
  if (!auction) return { bidders: [], page: 0, hasNextPage: false, error: "Auction not found." };

  const url = new URL(request.url);
  const rawPage = Number(url.searchParams.get("page") ?? 0);
  const page = Number.isInteger(rawPage) && rawPage >= 0 ? Math.min(rawPage, 10000) : 0;
  const rows = await prisma.bid.groupBy({
    by: ["customerId"],
    where: { auctionId: auction.id },
    _max: { amountCents: true },
    _count: { _all: true },
    orderBy: { _max: { amountCents: "desc" } },
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
  });
  return {
    bidders: rows.slice(0, PAGE_SIZE).map((row) => ({ customerId: row.customerId, highestBidCents: row._max.amountCents ?? 0, bidCount: row._count._all })),
    page,
    hasNextPage: rows.length > PAGE_SIZE,
    error: null,
  };
};
