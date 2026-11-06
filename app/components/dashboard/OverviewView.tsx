import styles from "./styles";
import { ViewHeader, money, date, timeUntil, type DashboardData, type ViewId } from "./shared";

type StatTone = "success" | "info" | "warning" | "neutral";

function StatCard({ label, value, hint, icon, tone, onClick }: { label: string; value: number | string; hint: string; icon: string; tone: StatTone; onClick: () => void }) {
  const toneClass = { success: styles.statIconSuccess, info: styles.statIconInfo, warning: styles.statIconWarning, neutral: styles.statIconNeutral }[tone];
  return (
    <button type="button" className={styles.statCard} onClick={onClick}>
      <span className={styles.statTop}>
        {label}
        <span className={`${styles.statIcon} ${toneClass}`}><s-icon type={icon as "home"} size="small" /></span>
      </span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statHint} suppressHydrationWarning>{hint}</span>
    </button>
  );
}

export function OverviewView({ data, onNavigate }: { data: DashboardData; onNavigate: (view: ViewId) => void }) {
  const { auctions, offers, checkoutProtection, currencyCode } = data;
  const live = auctions.filter((a) => a.status === "LIVE").sort((a, b) => new Date(a.endsAt).getTime() - new Date(b.endsAt).getTime());
  const upcoming = auctions.filter((a) => a.status === "SCHEDULED").sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  const needsClosing = auctions.filter((a) => a.status === "ENDED" && !a.closedAt);
  const pendingOffers = offers.filter((o) => o.status === "PENDING");
  const totalBids = auctions.reduce((total, a) => total + a._count.bids, 0);
  const liveValue = live.reduce((total, a) => total + (a.bids[0]?.amountCents ?? 0), 0);

  return (
    <>
      <ViewHeader title="Overview" subtitle="What's happening across your auctions right now." />

      {!checkoutProtection.enabled && (
        <s-banner tone="warning" heading="Auction checkout protection is not active">
          {String(checkoutProtection.error || "Reload the app after installing the latest version to enable checkout protection.")}
        </s-banner>
      )}

      <div className={styles.stats}>
        <StatCard label="Live auctions" value={live.length} hint={live.length ? `${money(liveValue, currencyCode)} in high bids` : "None running"} icon="live" tone="success" onClick={() => onNavigate("auctions")} />
        <StatCard label="Upcoming" value={upcoming.length} hint={upcoming[0] ? `Next starts in ${timeUntil(upcoming[0].startsAt)}` : "Nothing scheduled"} icon="calendar-time" tone="info" onClick={() => onNavigate("auctions")} />
        <StatCard label="Total bids" value={totalBids} hint={`Across ${auctions.length} auction${auctions.length === 1 ? "" : "s"}`} icon="chart-vertical" tone="neutral" onClick={() => onNavigate("auctions")} />
        <StatCard label="Offers to review" value={pendingOffers.length} hint={pendingOffers.length ? "Awaiting your decision" : "All caught up"} icon="cash-dollar" tone="warning" onClick={() => onNavigate("offers")} />
      </div>

      <div className={styles.columns}>
        <s-section heading="Live now">
          {live.length === 0 ? (
            <div className={styles.emptyInline}>
              <s-icon type="live" tone="neutral" />
              <span>No auctions are live right now.</span>
              <s-button variant="tertiary" onClick={() => onNavigate("create")}>Create an auction</s-button>
            </div>
          ) : (
            <ul className={styles.list}>
              {live.slice(0, 6).map((auction) => (
                <li key={auction.id} className={styles.listItem}>
                  <span className={styles.liveDot} aria-hidden="true" />
                  <div className={styles.listBody}>
                    <span className={styles.listTitle}>{auction.title}</span>
                    <span className={styles.listMeta}>{auction.productTitle} · {auction._count.bids} bid{auction._count.bids === 1 ? "" : "s"}</span>
                  </div>
                  <div className={styles.listAside}>
                    <span className={styles.amount}>{money(auction.bids[0]?.amountCents ?? auction.startingPriceCents, auction.currencyCode)}</span>
                    <span className={styles.subdued} suppressHydrationWarning>Ends in {timeUntil(auction.endsAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </s-section>

        <s-stack direction="block" gap="base">
          <s-section heading="Needs attention">
            {needsClosing.length === 0 && pendingOffers.length === 0 ? (
              <div className={styles.emptyInline}>
                <s-icon type="check-circle" tone="success" />
                <span>You’re all caught up.</span>
              </div>
            ) : (
              <ul className={styles.list}>
                {needsClosing.length > 0 && (
                  <li className={styles.listItem}>
                    <s-icon type="stop-circle" tone="warning" />
                    <div className={styles.listBody}>
                      <span className={styles.listTitle}>{needsClosing.length} auction{needsClosing.length === 1 ? "" : "s"} to close</span>
                      <span className={styles.listMeta}>Declare winners and send invoices</span>
                    </div>
                    <s-button variant="secondary" onClick={() => onNavigate("auctions")}>Review</s-button>
                  </li>
                )}
                {pendingOffers.length > 0 && (
                  <li className={styles.listItem}>
                    <s-icon type="cash-dollar" tone="warning" />
                    <div className={styles.listBody}>
                      <span className={styles.listTitle}>{pendingOffers.length} pending offer{pendingOffers.length === 1 ? "" : "s"}</span>
                      <span className={styles.listMeta}>Accept, counter or decline</span>
                    </div>
                    <s-button variant="secondary" onClick={() => onNavigate("offers")}>Review</s-button>
                  </li>
                )}
              </ul>
            )}
          </s-section>

          <s-section heading="Up next">
            {upcoming.length === 0 ? (
              <div className={styles.emptyInline}><span>No upcoming auctions.</span></div>
            ) : (
              <ul className={styles.list}>
                {upcoming.slice(0, 4).map((auction) => (
                  <li key={auction.id} className={styles.listItem}>
                    <s-icon type="calendar-time" tone="neutral" />
                    <div className={styles.listBody}>
                      <span className={styles.listTitle}>{auction.title}</span>
                      <span className={styles.listMeta}>{date(auction.startsAt)} UTC</span>
                    </div>
                    <span className={styles.amount}>{money(auction.startingPriceCents, auction.currencyCode)}</span>
                  </li>
                ))}
              </ul>
            )}
          </s-section>
        </s-stack>
      </div>
    </>
  );
}
