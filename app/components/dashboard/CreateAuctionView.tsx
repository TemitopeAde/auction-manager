import { useRef } from "react";
import styles from "./styles";
import { DateTimeField, ErrorBanner, ViewHeader, useDashboardFetcher, type DashboardData, type ViewId } from "./shared";

export function CreateAuctionView({ data, onNavigate }: { data: DashboardData; onNavigate: (view: ViewId) => void }) {
  const { products, currencyCode, checkoutProtection } = data;
  const formRef = useRef<HTMLFormElement>(null);
  const { fetcher, busy, error } = useDashboardFetcher(() => {
    formRef.current?.reset();
    onNavigate("auctions");
  });
  const activeProducts = products.filter((product) => product.status === "ACTIVE");

  return (
    <>
      <ViewHeader title="New auction" subtitle={`Pick a product, set the schedule and pricing. Times are in UTC and prices in ${currencyCode}.`} />

      <ErrorBanner error={error} />
      {!checkoutProtection.enabled && (
        <s-banner tone="warning" heading="Checkout protection is not active">
          Customers may be able to buy this product normally while the auction is live.
        </s-banner>
      )}

      <fetcher.Form method="post" ref={formRef}>
        <input type="hidden" name="intent" value="create" />
        <div className={styles.formColumns}>
          <s-stack direction="block" gap="base">
            <s-section heading="Lot details">
              <div className={styles.fieldGrid}>
                <s-select label="Product" name="productId" required details={activeProducts.length ? undefined : "No active products found in your store."}>
                  <s-option value="">Select a product</s-option>
                  {activeProducts.map((product) => <s-option key={product.id} value={product.id}>{product.title}</s-option>)}
                </s-select>
                <s-text-field label="Auction title" name="title" placeholder="Spring collection • Lot 01" required />
                <s-select label="Auction type" name="auctionType" details="Penny auctions raise the price by a fixed amount per bid.">
                  <s-option value="STANDARD">Standard auction</s-option>
                  <s-option value="PENNY">Penny auction</s-option>
                </s-select>
              </div>
            </s-section>

            <s-section heading="Schedule">
              <div className={styles.fieldGrid}>
                <DateTimeField id="create-starts" label="Starts at (UTC)" name="startsAt" />
                <DateTimeField id="create-ends" label="Ends at (UTC)" name="endsAt" />
              </div>
            </s-section>

            <s-section heading="Pricing">
              <div className={styles.fieldGrid}>
                <s-money-field label={`Starting bid (${currencyCode})`} name="startingPrice" min={0} required />
                <s-money-field label={`Bid increment (${currencyCode})`} name="bidIncrement" min={0.01} required />
                <s-money-field label={`Reserve price (${currencyCode})`} name="reservePrice" min={0} details="Optional. The lot only sells if bidding reaches this." />
                <s-money-field label={`Buy now price (${currencyCode})`} name="buyNowPrice" min={0} details="Optional. Lets a buyer end the auction instantly." />
                <s-number-field label="Buyer premium (%)" name="buyersPremiumPercent" min={0} max={100} step={0.01} details="Added on top of the winning amount." />
              </div>
            </s-section>

            <s-section heading="Offers">
              <s-stack direction="block" gap="base">
                <s-checkbox name="offersEnabled" label="Allow Make an Offer" details="Shoppers can send you a private offer during the auction." />
                <div className={styles.fieldGrid}>
                  <s-money-field label={`Auto-accept offers at (${currencyCode})`} name="offerAutoAccept" min={0} details="Optional" />
                  <s-money-field label={`Auto-decline offers below (${currencyCode})`} name="offerAutoDecline" min={0} details="Optional" />
                </div>
              </s-stack>
            </s-section>

            <s-section heading="Bidding rules">
              <s-stack direction="block" gap="base">
                <s-checkbox name="popcorn" label="Popcorn bidding" details="A bid in the final moments extends the closing time by two minutes." />
                <s-checkbox name="proxyBidding" label="Proxy bidding" details="Bidders set a maximum and the app bids for them automatically." />
                <s-checkbox name="requireApprovedBidders" label="Approved bidders only" details="Only customers on your approved bidder list can place bids." />
              </s-stack>
            </s-section>
          </s-stack>

          <div className={styles.stickyAside}>
            <s-section heading="Publish">
              <s-stack direction="block" gap="base">
                <s-paragraph color="subdued">
                  The auction starts as <s-text type="strong">scheduled</s-text> or <s-text type="strong">live</s-text> depending on its start time. Checkout is blocked for the product while it’s live.
                </s-paragraph>
                <s-button type="submit" variant="primary" disabled={busy} {...(busy ? { loading: true } : {})}>Create auction</s-button>
                <s-button type="button" variant="tertiary" onClick={() => onNavigate("auctions")}>Cancel</s-button>
              </s-stack>
            </s-section>
            <s-section heading="Tips">
              <s-unordered-list>
                <s-list-item>Upcoming auctions can be edited until the first bid.</s-list-item>
                <s-list-item>The reserve must be at least the starting bid.</s-list-item>
                <s-list-item>Buy now must be above the starting bid and reserve.</s-list-item>
              </s-unordered-list>
            </s-section>
          </div>
        </div>
      </fetcher.Form>
    </>
  );
}
