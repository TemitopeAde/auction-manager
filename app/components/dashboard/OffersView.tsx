import { useState } from "react";
import styles from "./styles";
import { ViewHeader, date, label, money, offerTone, useDashboardFetcher, type DashboardData, type Offer } from "./shared";

type Filter = "PENDING" | "COUNTERED" | "ACCEPTED" | "ALL";
const FILTERS: { id: Filter; label: string; match: (o: Offer) => boolean }[] = [
  { id: "PENDING", label: "Pending", match: (o) => o.status === "PENDING" },
  { id: "COUNTERED", label: "Countered", match: (o) => o.status === "COUNTERED" },
  { id: "ACCEPTED", label: "Accepted", match: (o) => o.status === "ACCEPTED" || o.status === "BUY_NOW" },
  { id: "ALL", label: "All", match: () => true },
];

function OfferReview({ offer, currencyCode }: { offer: Offer; currencyCode: string }) {
  const { fetcher, busy, error } = useDashboardFetcher();
  const hidden = (decision: string) => (
    <><input type="hidden" name="intent" value="offer-review" /><input type="hidden" name="id" value={offer.id} /><input type="hidden" name="decision" value={decision} /></>
  );
  return (
    <div className={styles.cellStack}>
      <div className={styles.actions}>
        <fetcher.Form method="post">{hidden("accept")}<s-button type="submit" variant="primary" icon="check" disabled={busy}>Accept</s-button></fetcher.Form>
        <fetcher.Form method="post">{hidden("decline")}<s-button type="submit" variant="tertiary" tone="critical" disabled={busy}>Decline</s-button></fetcher.Form>
      </div>
      <fetcher.Form method="post" className={styles.counterForm}>
        {hidden("counter")}
        <s-money-field label={`Counter (${currencyCode})`} labelAccessibilityVisibility="exclusive" placeholder="Counter amount" name="counterAmount" min={(offer.amountCents + 1) / 100} required />
        <s-button type="submit" variant="secondary" disabled={busy}>Counter</s-button>
      </fetcher.Form>
      {error && <s-text tone="critical">{error}</s-text>}
    </div>
  );
}

export function OffersView({ data }: { data: DashboardData }) {
  const { offers, bidders, currencyCode } = data;
  const pendingCount = offers.filter((o) => o.status === "PENDING").length;
  const [filter, setFilter] = useState<Filter>(pendingCount > 0 ? "PENDING" : "ALL");
  const bidderEmails = new Map(bidders.map((bidder) => [bidder.customerId, bidder.email]));
  const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const visible = offers.filter(active.match);

  return (
    <>
      <ViewHeader title="Offers" subtitle="Private offers shoppers have made on your auction lots." />
      <s-section>
        <div className={styles.toolbar}>
          <div className={styles.pills} role="tablist" aria-label="Filter offers">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}<span className={styles.pillCount}>{offers.filter(f.match).length}</span>
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <div className={styles.emptyInline}>
            <s-icon type="cash-dollar" />
            <span>{offers.length === 0 ? "No offers yet. Enable “Make an Offer” on an auction to receive them." : "No offers in this view."}</span>
          </div>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Bidder</s-table-header>
              <s-table-header>Auction</s-table-header>
              <s-table-header format="numeric">Offer</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header listSlot="secondary">Review</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {visible.map((offer) => (
                <s-table-row key={offer.id}>
                  <s-table-cell>
                    <div className={styles.cellStack}>
                      <s-text type="strong">{String(bidderEmails.get(offer.customerId) || `Customer ${offer.customerId}`)}</s-text>
                      <span className={styles.subdued}>{date(offer.createdAt)} UTC</span>
                    </div>
                  </s-table-cell>
                  <s-table-cell>{offer.auction.title}</s-table-cell>
                  <s-table-cell><span className={styles.amount}>{money(offer.amountCents, currencyCode)}</span></s-table-cell>
                  <s-table-cell>
                    <div className={styles.cellStack}>
                      <s-badge tone={offerTone(offer.status)}>{label(offer.status)}</s-badge>
                      {offer.status === "ACCEPTED" && <span className={styles.subdued}>{offer.draftOrderId ? "Invoice sent" : "Invoice queued"}</span>}
                    </div>
                  </s-table-cell>
                  <s-table-cell>
                    {offer.status === "PENDING" && <OfferReview offer={offer} currencyCode={currencyCode} />}
                    {offer.status === "COUNTERED" && (
                      <div className={styles.cellStack}>
                        <span>Countered at <span className={styles.amount}>{offer.counterAmountCents ? money(offer.counterAmountCents, currencyCode) : "—"}</span></span>
                        <span className={styles.subdued}>Expires {offer.expiresAt ? `${date(offer.expiresAt)} UTC` : "—"}</span>
                      </div>
                    )}
                    {offer.draftOrderId && <s-link href={`https://${offer.shop}/admin/draft_orders/${offer.draftOrderId.split("/").pop()}`} target="_blank">View invoice</s-link>}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </>
  );
}
