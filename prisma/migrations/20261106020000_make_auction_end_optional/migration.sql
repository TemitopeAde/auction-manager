PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_Auction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "auctionType" TEXT NOT NULL DEFAULT 'STANDARD',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startingPriceCents" INTEGER NOT NULL,
    "reservePriceCents" INTEGER,
    "buyNowPriceCents" INTEGER,
    "bidIncrementCents" INTEGER NOT NULL,
    "popcornSeconds" INTEGER NOT NULL DEFAULT 0,
    "proxyBiddingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "buyersPremiumBps" INTEGER NOT NULL DEFAULT 0,
    "offersEnabled" BOOLEAN NOT NULL DEFAULT false,
    "offerAutoAcceptCents" INTEGER,
    "offerAutoDeclineCents" INTEGER,
    "requireApprovedBidders" BOOLEAN NOT NULL DEFAULT false,
    "winnerCustomerId" TEXT,
    "winnerBidId" TEXT,
    "draftOrderId" TEXT,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Auction" (
    "id", "shop", "productId", "variantId", "productTitle", "title", "auctionType", "currencyCode",
    "startsAt", "endsAt", "status", "startingPriceCents", "reservePriceCents", "buyNowPriceCents",
    "bidIncrementCents", "popcornSeconds", "proxyBiddingEnabled", "buyersPremiumBps", "offersEnabled",
    "offerAutoAcceptCents", "offerAutoDeclineCents", "requireApprovedBidders", "winnerCustomerId",
    "winnerBidId", "draftOrderId", "closedAt", "createdAt", "updatedAt"
)
SELECT
    "id", "shop", "productId", "variantId", "productTitle", "title", "auctionType", "currencyCode",
    "startsAt", "endsAt", "status", "startingPriceCents", "reservePriceCents", "buyNowPriceCents",
    "bidIncrementCents", "popcornSeconds", "proxyBiddingEnabled", "buyersPremiumBps", "offersEnabled",
    "offerAutoAcceptCents", "offerAutoDeclineCents", "requireApprovedBidders", "winnerCustomerId",
    "winnerBidId", "draftOrderId", "closedAt", "createdAt", "updatedAt"
FROM "Auction";

DROP TABLE "Auction";
ALTER TABLE "new_Auction" RENAME TO "Auction";

CREATE INDEX "Auction_shop_status_startsAt_idx" ON "Auction"("shop", "status", "startsAt");
CREATE INDEX "Auction_productId_idx" ON "Auction"("productId");

PRAGMA foreign_key_check;
