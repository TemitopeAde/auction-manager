import { useRef, useState } from "react";
import styles from "./styles";
import { ErrorBanner, ViewHeader, bidderTone, label, useDashboardFetcher, type Bidder, type DashboardData } from "./shared";

const STATUSES = ["APPROVED", "PENDING", "BLOCKED"] as const;
const ACTION_LABEL: Record<string, string> = { APPROVED: "Approve", BLOCKED: "Block", PENDING: "Mark pending" };

function BidderActions({ bidder }: { bidder: Bidder }) {
  const { fetcher, busy } = useDashboardFetcher();
  return (
    <div className={styles.actions}>
      {STATUSES.filter((status) => status !== bidder.status).map((status) => (
        <fetcher.Form method="post" key={status}>
          <input type="hidden" name="intent" value="bidder-status" />
          <input type="hidden" name="id" value={bidder.id} />
          <input type="hidden" name="status" value={status} />
          <s-button type="submit" variant="tertiary" tone={status === "BLOCKED" ? "critical" : "auto"} disabled={busy}>{ACTION_LABEL[status]}</s-button>
        </fetcher.Form>
      ))}
    </div>
  );
}

export function BiddersView({ data }: { data: DashboardData }) {
  const { bidders } = data;
  const formRef = useRef<HTMLFormElement>(null);
  const { fetcher, busy, error } = useDashboardFetcher(() => formRef.current?.reset());
  const [filter, setFilter] = useState<"ALL" | (typeof STATUSES)[number]>("ALL");
  const visible = bidders.filter((b) => filter === "ALL" || b.status === filter);

  return (
    <>
      <ViewHeader title="Bidders" subtitle="Control who can bid on auctions that require approved bidders." />

      <s-section heading="Add or update a bidder">
        <fetcher.Form method="post" ref={formRef}>
          <input type="hidden" name="intent" value="create-bidder" />
          <s-stack direction="block" gap="base">
            <ErrorBanner error={error} />
            <div className={styles.fieldGrid}>
              <s-text-field label="Shopify customer ID" name="customerId" placeholder="e.g. 7012345678901" required />
              <s-email-field label="Bidder email" name="email" placeholder="name@example.com" required />
              <s-select label="Access" name="status">
                <s-option value="APPROVED">Approved</s-option>
                <s-option value="PENDING">Pending</s-option>
                <s-option value="BLOCKED">Blocked</s-option>
              </s-select>
            </div>
            <s-stack direction="inline" justifyContent="end">
              <s-button type="submit" variant="primary" icon="person-add" disabled={busy} {...(busy ? { loading: true } : {})}>Save bidder</s-button>
            </s-stack>
          </s-stack>
        </fetcher.Form>
      </s-section>

      <s-section heading={`Bidder list (${bidders.length})`}>
        {bidders.length > 0 && (
          <div className={styles.toolbar}>
            <div className={styles.pills} role="tablist" aria-label="Filter bidders">
              {(["ALL", ...STATUSES] as const).map((s) => (
                <button key={s} type="button" role="tab" aria-selected={filter === s} className={`${styles.pill} ${filter === s ? styles.pillActive : ""}`} onClick={() => setFilter(s)}>
                  {s === "ALL" ? "All" : label(s)}<span className={styles.pillCount}>{s === "ALL" ? bidders.length : bidders.filter((b) => b.status === s).length}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {visible.length === 0 ? (
          <div className={styles.emptyInline}>
            <s-icon type="person-list" />
            <span>{bidders.length === 0 ? "No bidders yet. Add a customer above to manage their access." : "No bidders with this status."}</span>
          </div>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Email</s-table-header>
              <s-table-header>Customer ID</s-table-header>
              <s-table-header listSlot="inline">Access</s-table-header>
              <s-table-header listSlot="secondary">Change access</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {visible.map((bidder) => (
                <s-table-row key={bidder.id}>
                  <s-table-cell><s-text type="strong">{bidder.email ?? "—"}</s-text></s-table-cell>
                  <s-table-cell><span className={styles.subdued}>{bidder.customerId}</span></s-table-cell>
                  <s-table-cell><s-badge tone={bidderTone(bidder.status)}>{label(bidder.status)}</s-badge></s-table-cell>
                  <s-table-cell><BidderActions bidder={bidder} /></s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </>
  );
}
