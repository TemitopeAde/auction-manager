import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import type { loader as candidateLoader } from "../../routes/app.auction-candidates.$auctionId";
import type { loader as biddersLoader } from "../../routes/app.auction-bidders.$auctionId";
import styles from "./styles";
import {
  BuyerPremiumField, DateTimeField, ErrorBanner, TablePagination, ViewHeader, auctionTone, date, datetimeLocal, label, money, timeUntil, useDashboardFetcher,
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
const AUCTIONS_PAGE_SIZE = 20;

function HiddenFields({ intent, id }: { intent: string; id: string }) {
  return <><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={id} /></>;
}

function AuctionEditor({ auction, currencyCode, onClose }: { auction: Auction; currencyCode: string; onClose: () => void }) {
  const { fetcher, busy, error } = useDashboardFetcher(onClose);
  const locked = auction._count.bids > 0;
  return (
    <div className={styles.editor}>
      <s-section heading={`Edit “${auction.title}”`}>
        <fetcher.Form method="post" noValidate>
          <HiddenFields intent="update-scheduled" id={auction.id} />
          <s-stack direction="block" gap="base">
            <ErrorBanner error={error} />
            {locked && <s-banner tone="info">Auctions that already have bids can’t be edited.</s-banner>}
            <div className={styles.fieldGrid}>
              <s-text-field label="Auction title" name="title" value={auction.title} required />
              <s-select label="Auction type" name="auctionType" value={auction.auctionType}>
                <s-option value="STANDARD">Standard auction</s-option>
                <s-option value="PENNY">Penny auction</s-option>
              </s-select>
              <DateTimeField id={`starts-${auction.id}`} label="Starts at (UTC)" name="startsAt" defaultValue={datetimeLocal(auction.startsAt)} startNowShortcut />
              <DateTimeField id={`ends-${auction.id}`} label="Ends at (UTC, optional)" name="endsAt" defaultValue={datetimeLocal(auction.endsAt)} required={false} />
              <s-money-field label={`Starting bid (${currencyCode})`} name="startingPrice" min={0} value={(auction.startingPriceCents / 100).toFixed(2)} required />
              <s-money-field label={`Bid increment (${currencyCode})`} name="bidIncrement" min={0.01} value={(auction.bidIncrementCents / 100).toFixed(2)} required />
              <s-money-field label={`Reserve (${currencyCode})`} details="Optional" name="reservePrice" min={0} value={auction.reservePriceCents === null ? undefined : (auction.reservePriceCents / 100).toFixed(2)} />
              <s-money-field label={`Buy now (${currencyCode})`} details="Optional" name="buyNowPrice" min={0} value={auction.buyNowPriceCents === null ? undefined : (auction.buyNowPriceCents / 100).toFixed(2)} />
              <BuyerPremiumField defaultValue={(auction.buyersPremiumBps / 100).toFixed(2)} />
            </div>
            <s-section heading="Offers">
              <s-stack direction="block" gap="base">
                <s-checkbox name="offersEnabled" label="Allow Make an Offer" checked={auction.offersEnabled} details="Shoppers can send a private offer during the auction." />
                <div className={styles.fieldGrid}>
                  <s-money-field label={`Auto-accept offers at (${currencyCode})`} name="offerAutoAccept" min={0} details="Optional" value={auction.offerAutoAcceptCents === null ? undefined : (auction.offerAutoAcceptCents / 100).toFixed(2)} />
                  <s-money-field label={`Auto-decline offers below (${currencyCode})`} name="offerAutoDecline" min={0} details="Optional" value={auction.offerAutoDeclineCents === null ? undefined : (auction.offerAutoDeclineCents / 100).toFixed(2)} />
                </div>
              </s-stack>
            </s-section>
            <s-section heading="Bidding rules">
              <s-stack direction="block" gap="base">
                <s-checkbox name="popcorn" label="Popcorn bidding" details="A bid in the final moments extends the closing time by two minutes." checked={auction.popcornSeconds > 0} />
                <s-checkbox name="proxyBidding" label="Proxy bidding" details="Bidders set a maximum and the app bids for them automatically." checked={auction.proxyBiddingEnabled} />
                <s-checkbox name="requireApprovedBidders" label="Approved bidders only" details="Only customers on your approved bidder list can place bids." checked={auction.requireApprovedBidders} />
              </s-stack>
            </s-section>
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
  const shopify = useAppBridge();
  const { fetcher, busy, error } = useDashboardFetcher(() => {
    shopify.modal.hide(`approve-winner-${auction.id}`);
    shopify.modal.hide(`revoke-winner-${auction.id}`);
  });
  const candidateFetcher = useFetcher<typeof candidateLoader>();
  const eligibleCandidates = candidateFetcher.data?.candidates ?? [];
  const [selectedBidId, setSelectedBidId] = useState(eligibleCandidates[0]?.id ?? "");
  useEffect(() => {
    if (!eligibleCandidates.some((bid) => bid.id === selectedBidId)) setSelectedBidId(eligibleCandidates[0]?.id ?? "");
  }, [eligibleCandidates, selectedBidId]);
  return (
    <div className={styles.cellStack}>
      <div className={styles.actions}>
        {auction.status === "DRAFT" && (
          <fetcher.Form method="post"><HiddenFields intent="delete" id={auction.id} /><s-button type="submit" variant="tertiary" tone="critical" icon="delete" disabled={busy}>Delete</s-button></fetcher.Form>
        )}
        {(auction.status === "SCHEDULED" || auction.status === "LIVE") && (
          <>
            <s-button type="button" variant="secondary" icon="edit" onClick={onEdit}>Edit</s-button>
            {auction.status === "SCHEDULED" && <fetcher.Form method="post"><HiddenFields intent="cancel-scheduled" id={auction.id} /><s-button type="submit" variant="tertiary" tone="critical" disabled={busy}>Cancel</s-button></fetcher.Form>}
          </>
        )}
        {auction.status === "LIVE" && (
          <fetcher.Form method="post"><HiddenFields intent="end-auction" id={auction.id} /><s-button type="submit" variant="secondary" tone="critical" icon="stop-circle" disabled={busy} {...(busy ? { loading: true } : {})}>End now</s-button></fetcher.Form>
        )}
        {auction.status === "ENDED" && !auction.closedAt && (
          <fetcher.Form method="post"><HiddenFields intent="close" id={auction.id} /><s-button type="submit" variant="primary" disabled={busy} {...(busy ? { loading: true } : {})}>Close & invoice</s-button></fetcher.Form>
        )}
        {auction.closedAt && auction.winnerCustomerId && (
          <s-button type="button" variant="tertiary" tone="critical" commandFor={`revoke-winner-${auction.id}`} command="--show" disabled={busy}>Revoke winner</s-button>
        )}
        {auction.closedAt && !auction.winnerCustomerId && (
          <s-button type="button" variant="primary" commandFor={`approve-winner-${auction.id}`} command="--show" onClick={() => candidateFetcher.load(`/app/auction-candidates/${auction.id}`)} disabled={busy}>Choose winner</s-button>
        )}
      </div>
      {error && <s-text tone="critical">{error}</s-text>}
      {auction.closedAt && auction.winnerCustomerId && (
        <s-modal id={`revoke-winner-${auction.id}`} heading="Revoke this winner?" size="base">
          <s-stack direction="block" gap="base">
            <s-paragraph>Revoke customer {auction.winnerCustomerId} as winner for “{auction.title}”. Their open Shopify draft invoice will be deleted so a replacement can be selected.</s-paragraph>
            <fetcher.Form method="post">
              <HiddenFields intent="revoke-winner" id={auction.id} />
              <s-button type="button" variant="secondary" commandFor={`revoke-winner-${auction.id}`} command="--hide">Cancel</s-button>
              <s-button slot="primary-action" type="submit" variant="primary" tone="critical" disabled={busy} {...(busy ? { loading: true } : {})}>Revoke winner</s-button>
            </fetcher.Form>
          </s-stack>
        </s-modal>
      )}
      {auction.closedAt && !auction.winnerCustomerId && (
        <s-modal id={`approve-winner-${auction.id}`} heading="Choose a replacement winner" size="base">
          <s-stack direction="block" gap="base">
            <s-paragraph>Choose a bidder who met the reserve. Approving them sends a new Shopify invoice by email.</s-paragraph>
            {candidateFetcher.state !== "idle" ? <s-spinner size="base" accessibilityLabel="Loading eligible bidders" /> : candidateFetcher.data?.error ? <s-text tone="critical">{candidateFetcher.data.error}</s-text> : eligibleCandidates.length === 0 ? <s-paragraph>No other bids met the reserve price.</s-paragraph> : (
              <fetcher.Form method="post">
                <HiddenFields intent="approve-winner" id={auction.id} />
                <s-select label="Replacement winner" name="bidId" value={selectedBidId} onChange={(event) => setSelectedBidId(event.currentTarget.value ?? "")}>
                  {eligibleCandidates.map((bid) => <s-option key={bid.id} value={bid.id}>Customer {bid.customerId} · {money(bid.amountCents, auction.currencyCode)}</s-option>)}
                </s-select>
                <s-button type="button" variant="secondary" commandFor={`approve-winner-${auction.id}`} command="--hide">Cancel</s-button>
                <s-button slot="primary-action" type="submit" variant="primary" disabled={busy || !selectedBidId} {...(busy ? { loading: true } : {})}>Approve winner</s-button>
              </fetcher.Form>
            )}
          </s-stack>
        </s-modal>
      )}
    </div>
  );
}

export function AuctionsView({ data, onNavigate }: { data: DashboardData; onNavigate: (view: ViewId) => void }) {
  const { auctions, currencyCode } = data;
  const bidderFetcher = useFetcher<typeof biddersLoader>();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [auctionPage, setAuctionPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [biddersAuctionId, setBiddersAuctionId] = useState<string | null>(null);
  const [bidderPage, setBidderPage] = useState(0);
  const biddersAuction = auctions.find((auction) => auction.id === biddersAuctionId);
  const bidderCurrencyCode = biddersAuction?.currencyCode ?? currencyCode;
  const loadBidderPage = (page: number) => {
    if (!biddersAuctionId) return;
    setBidderPage(page);
    bidderFetcher.load(`/app/auction-bidders/${biddersAuctionId}?page=${page}`);
  };
  const editing = auctions.find((a) => a.id === editingId && ["SCHEDULED", "LIVE"].includes(a.status));

  const activeFilter = FILTERS.find((f) => f.id === filter) ?? FILTERS[0];
  const q = query.trim().toLowerCase();
  const visible = auctions.filter((a) => activeFilter.match(a) && (!q || a.title.toLowerCase().includes(q) || a.productTitle.toLowerCase().includes(q)));
  const currentAuctionPage = Math.min(auctionPage, Math.max(0, Math.ceil(visible.length / AUCTIONS_PAGE_SIZE) - 1));
  const pagedAuctions = visible.slice(currentAuctionPage * AUCTIONS_PAGE_SIZE, (currentAuctionPage + 1) * AUCTIONS_PAGE_SIZE);

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
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`${styles.pill} ${filter === f.id ? styles.pillActive : ""}`} onClick={() => { setFilter(f.id); setAuctionPage(0); }}>
                {f.label}<span className={styles.pillCount}>{auctions.filter(f.match).length}</span>
              </button>
            ))}
          </div>
          <div className={styles.search}>
            <s-search-field label="Search auctions" labelAccessibilityVisibility="exclusive" placeholder="Search by title or product" value={query} onInput={(e) => { setQuery(e.currentTarget.value ?? ""); setAuctionPage(0); }} />
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
              <s-table-header>Bidders</s-table-header>
              <s-table-header>Result</s-table-header>
              <s-table-header listSlot="secondary">Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {pagedAuctions.map((auction) => {
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
                        <span>{date(auction.startsAt)} → {auction.endsAt ? date(auction.endsAt) : "No scheduled end"}</span>
                        {auction.status === "LIVE" && <span className={styles.subdued} suppressHydrationWarning>{auction.endsAt ? `Ends in ${timeUntil(auction.endsAt)}` : "Ends when you end it"}</span>}
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
                      <s-button type="button" variant="tertiary" commandFor="auction-bidders-modal" command="--show" onClick={() => { bidderFetcher.load(`/app/auction-bidders/${auction.id}?page=0`); setBiddersAuctionId(auction.id); setBidderPage(0); }}>
                        View bidders
                      </s-button>
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
        {visible.length > 0 && <TablePagination page={currentAuctionPage} pageSize={AUCTIONS_PAGE_SIZE} total={visible.length} onPageChange={setAuctionPage} />}
      </s-section>
      <s-modal id="auction-bidders-modal" heading={`Bidders${biddersAuction ? ` · ${biddersAuction.title}` : ""}`} size="large">
        {bidderFetcher.state !== "idle" ? <s-spinner size="base" accessibilityLabel="Loading auction bidders" /> : bidderFetcher.data?.error ? <s-banner tone="critical">{bidderFetcher.data.error}</s-banner> : bidderFetcher.data?.bidders.length ? (
          <>
            <s-table variant="auto">
              <s-table-header-row>
                <s-table-header listSlot="primary">Shopify customer ID</s-table-header>
                <s-table-header format="numeric">Highest bid</s-table-header>
                <s-table-header format="numeric">Bids</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {bidderFetcher.data.bidders.map((bidder) => (
                  <s-table-row key={bidder.customerId}>
                    <s-table-cell>{bidder.customerId}</s-table-cell>
                    <s-table-cell>{money(bidder.highestBidCents, bidderCurrencyCode)}</s-table-cell>
                    <s-table-cell>{bidder.bidCount}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-stack direction="inline" gap="base" alignItems="center">
              <s-text>Page {bidderPage + 1}</s-text>
              <s-button variant="secondary" disabled={bidderPage === 0} onClick={() => loadBidderPage(bidderPage - 1)}>Previous</s-button>
              <s-button variant="secondary" disabled={!bidderFetcher.data.hasNextPage} onClick={() => loadBidderPage(bidderPage + 1)}>Next</s-button>
            </s-stack>
          </>
        ) : bidderFetcher.state === "idle" ? <s-paragraph>No bidders yet.</s-paragraph> : null}
      </s-modal>
    </>
  );
}
