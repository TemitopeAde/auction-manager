CREATE TABLE "Auction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "auctionType" TEXT NOT NULL DEFAULT 'STANDARD',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME NOT NULL,
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

CREATE INDEX "Auction_shop_status_startsAt_idx" ON "Auction"("shop", "status", "startsAt");
CREATE INDEX "Auction_productId_idx" ON "Auction"("productId");

CREATE TABLE "Bid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Bid_auctionId_amountCents_idx" ON "Bid"("auctionId", "amountCents");
CREATE INDEX "Bid_auctionId_customerId_idx" ON "Bid"("auctionId", "customerId");

CREATE TABLE "ProxyBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "maxBidCents" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProxyBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProxyBid_auctionId_customerId_key" ON "ProxyBid"("auctionId", "customerId");
CREATE INDEX "ProxyBid_auctionId_maxBidCents_idx" ON "ProxyBid"("auctionId", "maxBidCents");

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "counterAmountCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME,
    "draftOrderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Offer_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Offer_shop_status_createdAt_idx" ON "Offer"("shop", "status", "createdAt");
CREATE INDEX "Offer_auctionId_customerId_idx" ON "Offer"("auctionId", "customerId");

CREATE TABLE "Bidder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Bidder_shop_customerId_key" ON "Bidder"("shop", "customerId");
CREATE INDEX "Bidder_shop_status_idx" ON "Bidder"("shop", "status");
CREATE INDEX "Bidder_shop_email_idx" ON "Bidder"("shop", "email");

CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "checkoutValidationId" TEXT
);

CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");
