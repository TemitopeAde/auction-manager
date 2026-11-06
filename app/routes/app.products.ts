import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const PAGE_SIZE = 40;

export type ProductPickerItem = { id: string; title: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const after = url.searchParams.get("after") || null;
  const escapedQuery = query.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const search = `status:active${query ? ` title:"${escapedQuery}"` : ""}`;

  const response = await admin.graphql(`#graphql
    query AuctionProductPicker($first: Int!, $after: String, $query: String!) {
      products(first: $first, after: $after, query: $query, sortKey: TITLE) {
        nodes { id title }
        pageInfo { hasNextPage endCursor }
      }
    }`, {
    variables: { first: PAGE_SIZE, after, query: search },
  });
  const payload = await response.json();
  const connection = payload.data?.products;
  if (!response.ok || !connection) {
    return { products: [], hasNextPage: false, nextCursor: null, query, after, error: "Could not load products. Try searching again." };
  }

  const products = (connection.nodes ?? []) as ProductPickerItem[];
  const auctionedProducts = products.length
    ? await prisma.auction.findMany({
      where: { shop: session.shop, productId: { in: products.map((product) => product.id) } },
      select: { productId: true },
    })
    : [];
  const auctionedIds = new Set(auctionedProducts.map((auction) => auction.productId));

  return {
    products: products.filter((product) => !auctionedIds.has(product.id)),
    hasNextPage: connection.pageInfo.hasNextPage,
    nextCursor: connection.pageInfo.endCursor,
    query,
    after,
    error: null,
  };
};
