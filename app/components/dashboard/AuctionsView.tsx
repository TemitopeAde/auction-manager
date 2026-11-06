import { useState } from "react";
import styles from "./styles";
import {
  DateTimeField, ErrorBanner, ViewHeader, auctionTone, date, datetimeLocal, label, money, timeUntil, useDashboardFetcher,
  type Auction, type DashboardData, type ViewId,
} from "./shared";

type Filter = "ALL" | "LIVE" | "SCHEDULED" | "TO_CLOSE" | "ENDED" | "OTHER";

const FILTERS: { id: Filter; label: string; match: (a: Auction) => boolean }[] = [
  { id: "ALL", label: "All", match: () => true },
  { id: "LIVE", label: "Live", match: (a) => a.status === "LIVE" },
  { id: "SCHEDULED", label: "Upcoming", match: (a) => a.status === "SCHEDULED" },
  { id: "TO_CLOSE", label: "To close", match: (a) => a.status === "ENDED" && !a.closedAt },
  { id: "ENDED", label: "Ended", match: (a) => a.status === "ENDED" && !!a.closedAt },
  { id: "OTHER", label: "Draft & canceled", match: (a) => ["DRAFT", "CANCELED", "CLOSING"].includes(a.status) },
];

function HiddenFields({ intent, id }: { intent: string; id: string }) {
  return <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={id} /></>;
}

function AuctionEditor({ auction, currencyCode, onClose }: { auction: Auction; currencyCode: string; onClose: () => void }) {
  const { fetcher, busy, error } = useDashboardFetcher(onClose);
  const locked = auction._count.bids > 0;
  return (
    <div className={styles.editor}>
      <s-section heading={`Edit “${auction.title}”`}>
        <fetcher.Form method="post">
          <HiddenFields intent="update-scheduled" id={auction.id} />
          <s-stack direction="block" gap="base">
            <ErrorBanner error={error} />
            {locked && <s-banner tone="info">Auctions that already have bids can’t be edited.</s-banner>}
            <div className={styles.fieldGrid}>
              <s-text-field label="Auction title" name="title" value={auction.title} required />
              <DateTimeField id={`starts-${auction.id}`} label="Starts at (UTC)" name="startsAt" defaultValue={datetimeLocal(auction.startsAt)} />
              <DateTimeField id={`ends-${auction.id}`} label="Ends at (UTC)" name="endsAt" defaultValue={datetimeLocal(auction.endsAt)} />
              <s-money-field label={`Starting bid (${currencyCode})`} name="startingPrice" min={0} value={(auction.startingPriceCents / 100).toFixed(2)} required />
              <s-money-field label={`Bid increment (${currencyCode})`} name="bidIncrement" min={0.01} value={(auction.bidIncrementCents / 100).toFixed(2)} required />
              <s-money-field label={`Reserve (${currencyCode})`} details="Optional" name="reservePrice" min={0} value={auction.reservePriceCents === null ? undefined : (auction.reservePriceCents / 100).toFixed(2)} />
              <s-money-field label={`Buy now (${currencyCode})`} details="Optional" name="buyNowPrice" min={0} value={auction.buyNowPriceCents === null ? undefined : (auction.buyNowPriceCents / 100).toFixed(2)} />
            </div>
            <s-stack direction="inline" gap="small" justifyContent="end">
              <s-button type="button" variant="secondary" onClick={onClose}>Cancel</s-button>
              <s-button type="submit" variant="primary" disabled={busy || locked} {...(busy ? { loading: true } : {})}>Save changes</s-button>
            </s-stack>
          </s-stack>
        </fetcher.Form>
      </s-section>
    </div>
  );
}

function AuctionActions({ auction, onEdit }: { auction: Auction; onEdit: () => void }) {
  const { fetcher, busy, error } = useDashboardFetcher();
  return (
    <div className={styles.cellStack}>
      <div className={styles.actions}>
        {auction.status === "DRAFT" && (
          <fetcher.Form method="post"><HiddenFields intent="delete" id={auction.id} /><s-button type="submit" variant="tertiary" tone="critical" icon="delete" disabled={busy}>Delete</s-button></fetcher.Form>
        )}
        {auction.status === "SCHEDULED" && (
          <>
            <s-button type="button" variant="secondary" icon="edit" onClick={onEdit}>Edit</s-button>
            <fetcher.Form method="post"><HiddenFields intent="cancel-scheduled" id={auction.id} /><s-button type="submit" variant="tertiary" tone="critical" disabled={busy}>Cancel</s-button></fetcher.Form>
          </>
        )}
        {auction.status === "LIVE" && (
          <fetcher.Form method="post"><HiddenFields intent="end-auction" id={auction.id} /><s-button type="submit" variant="secondary" tone="critical" icon="stop-circle" disabled={busy} {...(busy ? { loading: true } : {})}>End now</s-button></fetcher.Form>
        )}
        {auction.status === "ENDED" && !auction.closedAt && (
          <fetcher.Form method="post"><HiddenFields intent="close" id={auction.id} /><s-button type="submit" variant="primary" disabled={busy} {...(busy ? { loading: true } : {})}>Close & invoice</s-button></fetcher.Form>
        )}
      </div>
      {error && <s-text tone="critical">{error}</s-text>}
    </div>
  );
}

export function AuctionsView({ data, onNavigate }: { data: DashboardData; onNavigate: (view: ViewId) => void }) {
  const { auctions, currencyCode } = data;
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = auctions.find((a) => a.id === editingId && a.status === "SCHEDULED");

  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const q = query.trim().toLowerCase();
  const visible = auctions.filter((a) => activeFilter.match(a) && (!q || a.title.toLowerCase().includes(q) || a.productTitle.toLowerCase().includes(q)));

  return (
    <>
      <ViewHeader title="Auctions" subtitle="Monitor bidding, edit upcoming lots and close finished auctions.">
        <s-button variant="primary" icon="plus" onClick={() => onNavigate("create")}>New auction</s-button>
      </ViewHeader>

      {editing && <AuctionEditor key={editing.id} auction={editing} currencyCode={currencyCode} onClose={() => setEditingId(null)} />}

      <s-section>
        <div className={styles.toolbar}>
          <div className={styles.pills} role="tablist" aria-label="Filter auctions">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`} onClick={() => setFilter(f.id)}>
                {f.label}<span className={styles.pillCount}>{auctions.filter(f.match).length}</span>
              </button>
            ))}
          </div>
          <div className={styles.search}>
            <s-search-field label="Search auctions" labelAccessibilityVisibility="exclusive" placeholder="Search by title or product" value={query} onInput={(e) => setQuery(e.currentTarget.value ?? "")} />
          </div>
        </div>

        {auctions.length === 0 ? (
          <s-stack direction="block" gap="base" alignItems="center" padding="large">
            <s-icon type="live" />
            <s-heading>No auctions yet</s-heading>
            <s-paragraph color="subdued">Create your first auction. It starts as scheduled or live depending on its start time.</s-paragraph>
            <s-button variant="primary" onClick={() => onNavigate("create")}>Create auction</s-button>
          </s-stack>
        ) : visible.length === 0 ? (
          <div className={styles.emptyInline}><s-icon type="search" /><span>No auctions match this filter.</span></div>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Auction</s-table-header>
              <s-table-header listSlot="inline">Status</s-table-header>
              <s-table-header>Schedule (UTC)</s-table-header>
              <s-table-header format="numeric">High bid</s-table-header>
              <s-table-header>Result</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {visible.map((auction) => {
                const top = auction.bids[0];
                return (
                  <s-table-row key={auction.id}>
                    <s-table-cell>
                      <div className={styles.cellStack}>
                        <s-text type="strong">{auction.title}</s-text>
                        <span className={styles.subdued}>{auction.productTitle}{auction.auctionType === "PENNY" ? " · Penny" : ""}</span>
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <div className={styles.cellStack}>
                        <s-badge tone={auctionTone(auction.status)}>{auction.status === "ENDED" && !auction.closedAt ? "Awaiting close" : label(auction.status)}</s-badge>
                        <span className={styles.subdued}>{auction._count.bids} bids · {auction._count.offers} offers</span>
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <div className={styles.cellStack}>
                        <span>{date(auction.startsAt)} → {date(auction.endsAt)}</span>
                        {auction.status === "LIVE" && <span className={styles.subdued} suppressHydrationWarning>Ends in {timeUntil(auction.endsAt)}</span>}
                        {auction.status === "SCHEDULED" && <span className={styles.subdued} suppressHydrationWarning>Starts in {timeUntil(auction.startsAt)}</span>}
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <div className={styles.cellStack}>
                        <span className={styles.amount}>{money(top?.amountCents ?? auction.startingPriceCents, auction.currencyCode)}</span>
                        <span className={styles.subdued}>
                          {top ? `Customer ${top.customerId}` : "Opening bid"}
                          {auction.reservePriceCents !== null && ` · Reserve ${money(auction.reservePriceCents, auction.currencyCode)}`}
                        </span>
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <div className={styles.cellStack}>
                        {auction.winnerCustomerId && <span>Winner: customer {auction.winnerCustomerId}</span>}
                        {auction.closedAt && !auction.winnerCustomerId && <span className={styles.subdued}>No winner</span>}
                        {auction.draftOrderId && <s-link href={`https://${auction.shop}/admin/draft_orders/${auction.draftOrderId.split("/").pop()}`} target="_blank">View invoice</s-link>}
                        {!auction.closedAt && <span className={styles.subdued}>—</span>}
                      </div>
                    </s-table-cell>
                    <s-table-cell>
                      <AuctionActions auction={auction} onEdit={() => { setEditingId(auction.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </>
  );
}
