import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import styles from "./styles";
import { ViewHeader, money, moneyCompact, numberCompact, percent, shortDate, type DashboardData } from "./shared";

// Chart tokens (reference dataviz palette, light mode — Shopify admin has no dark mode).
const SERIES = "#2a78d6";
const OUTCOME_COLORS = { sold: "#2a78d6", reserveNotMet: "#eb6834", noBids: "#1baf7a", canceled: "#eda100" } as const;
const GRID = "#ebebeb";
const TICK = { fill: "#616161", fontSize: 12 };

type Analytics = DashboardData["analytics"];
type Range = Analytics["range"];

/** Recharts measures the DOM, so render charts only after mount to keep SSR and hydration identical. */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function Delta({ current, previous, format }: { current: number | null; previous: number | null; format: "relative" | "points" }) {
  if (current === null || previous === null) return <span className={styles.statHint}>No prior data</span>;
  if (format === "relative" && previous === 0) return <span className={styles.statHint}>{current > 0 ? "New this period" : "No change"}</span>;
  const change = format === "relative" ? (current - previous) / previous : current - previous;
  if (Math.abs(change) < 0.005) return <span className={styles.statHint}>No change vs previous period</span>;
  const up = change > 0;
  const text = format === "relative" ? percent(Math.abs(change)) : `${Math.round(Math.abs(change) * 100)} pts`;
  return (
    <span className={styles.deltaRow}>
      <s-badge tone={up ? "success" : "critical"} icon={up ? "arrow-up" : "arrow-down"}>{text}</s-badge>
      <span className={styles.statHint}>vs previous period</span>
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.statTop}>{label}</span>
      <span className={styles.statValue}>{value}</span>
      {children}
    </div>
  );
}

function ChartTooltip({ active, payload, label, bucketDays, format }: { active?: boolean; payload?: readonly { value?: unknown }[]; label?: unknown; bucketDays: number; format: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  return (
    <div className={styles.chartTooltip}>
      <span className={styles.subdued}>{bucketDays > 1 ? `Week of ${shortDate(String(label))}` : shortDate(String(label))}</span>
      <span className={styles.amount}>{format(value)}</span>
    </div>
  );
}

function TimeSeriesChart({ analytics, dataKey, name, format, formatTick }: {
  analytics: Analytics;
  dataKey: "bids" | "salesCents";
  name: string;
  format: (v: number) => string;
  formatTick: (v: number) => string;
}) {
  const mounted = useMounted();
  const empty = analytics.series.every((point) => point[dataKey] === 0);
  return (
    <>
      <div className={styles.chartBox} aria-hidden="true">
        {mounted && !empty && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="start" tickFormatter={(v) => shortDate(v)} tick={TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis tickFormatter={formatTick} tick={TICK} tickLine={false} axisLine={false} allowDecimals={false} width={56} />
              <Tooltip cursor={{ fill: "#f1f1f1" }} content={(props) => <ChartTooltip {...props} bucketDays={analytics.bucketDays} format={format} />} />
              <Bar dataKey={dataKey} name={name} fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {empty && <div className={styles.chartEmpty}>No {name.toLowerCase()} in this period yet.</div>}
      </div>
      <table className={styles.srOnly}>
        <caption>{name} by {analytics.bucketDays > 1 ? "week" : "day"}</caption>
        <thead><tr><th scope="col">{analytics.bucketDays > 1 ? "Week of" : "Day"}</th><th scope="col">{name}</th></tr></thead>
        <tbody>{analytics.series.map((point) => <tr key={point.start}><td>{shortDate(point.start)}</td><td>{format(point[dataKey])}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function OutcomesFigure({ outcomes }: { outcomes: Analytics["outcomes"] }) {
  const parts = [
    { key: "sold", label: "Sold", value: outcomes.sold },
    { key: "reserveNotMet", label: "Reserve not met", value: outcomes.reserveNotMet },
    { key: "noBids", label: "No bids", value: outcomes.noBids },
    { key: "canceled", label: "Canceled", value: outcomes.canceled },
  ] as const;
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (total === 0) return <div className={styles.emptyInline}><s-icon type="chart-donut" /><span>No auctions closed in this period.</span></div>;
  return (
    <s-stack direction="block" gap="base">
      <div className={styles.segmented} role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.key} className={styles.segment} style={{ flexGrow: p.value, background: OUTCOME_COLORS[p.key] }} title={`${p.label}: ${p.value} (${percent(p.value / total)})`} />
        ))}
      </div>
      <ul className={styles.legend}>
        {parts.map((p) => (
          <li key={p.key} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: OUTCOME_COLORS[p.key] }} aria-hidden="true" />
            <span className={styles.legendLabel}>{p.label}</span>
            <span className={styles.amount}>{p.value}</span>
            <span className={styles.subdued}>{percent(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </s-stack>
  );
}

function OffersChart({ offers }: { offers: Analytics["offers"] }) {
  const mounted = useMounted();
  const rows = [
    { label: "Accepted", value: offers.accepted },
    { label: "Countered", value: offers.countered },
    { label: "Declined", value: offers.declined },
    { label: "Expired", value: offers.expired },
    { label: "Pending", value: offers.pending },
  ];
  if (offers.received === 0) return <div className={styles.emptyInline}><s-icon type="cash-dollar" /><span>No offers received in this period.</span></div>;
  return (
    <>
      <p className={styles.subdued}>{offers.received} received · {percent(offers.accepted / offers.received)} accepted</p>
      <div className={styles.chartBoxSmall} aria-hidden="true">
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={TICK} tickLine={false} axisLine={false} width={80} />
              <Tooltip cursor={{ fill: "#f1f1f1" }} content={({ active, payload }) => active && payload?.length ? (
                <div className={styles.chartTooltip}><span className={styles.subdued}>{String(payload[0].payload.label)}</span><span className={styles.amount}>{String(payload[0].value)} offers</span></div>
              ) : null} />
              <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                <LabelList dataKey="value" position="right" style={{ fill: "#303030", fontSize: 12, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      <table className={styles.srOnly}>
        <caption>Offer outcomes</caption>
        <tbody>{rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}</tbody>
      </table>
    </>
  );
}

export function AnalyticsView({ data, onRangeChange }: { data: DashboardData; onRangeChange: (range: Range) => void }) {
  const { analytics, currencyCode } = data;
  const { kpis } = analytics;
  const ranges: Range[] = [7, 30, 90];

  return (
    <>
      <ViewHeader title="Analytics" subtitle={`Auction performance over the last ${analytics.range} days (UTC). Sales are hammer prices in ${currencyCode}.`}>
        <div className={styles.pills} role="tablist" aria-label="Date range">
          {ranges.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={analytics.range === r} className={`${styles.pill} ${analytics.range === r ? styles.pillActive : ""}`} onClick={() => onRangeChange(r)}>
              Last {r} days
            </button>
          ))}
        </div>
      </ViewHeader>

      <div className={styles.stats}>
        <Kpi label="Sales" value={money(kpis.salesCents, currencyCode)}>
          <Delta current={kpis.salesCents} previous={kpis.prevSalesCents} format="relative" />
        </Kpi>
        <Kpi label="Sell-through rate" value={kpis.sellThrough === null ? "—" : percent(kpis.sellThrough)}>
          <Delta current={kpis.sellThrough} previous={kpis.prevSellThrough} format="points" />
        </Kpi>
        <Kpi label="Bids placed" value={numberCompact(kpis.bids)}>
          <Delta current={kpis.bids} previous={kpis.prevBids} format="relative" />
        </Kpi>
        <Kpi label="Unique bidders" value={numberCompact(kpis.uniqueBidders)}>
          <Delta current={kpis.uniqueBidders} previous={kpis.prevUniqueBidders} format="relative" />
        </Kpi>
      </div>

      <div className={styles.chartGrid}>
        <s-section heading="Bids placed">
          <TimeSeriesChart analytics={analytics} dataKey="bids" name="Bids" format={(v) => `${v} bid${v === 1 ? "" : "s"}`} formatTick={numberCompact} />
        </s-section>
        <s-section heading="Sales">
          <TimeSeriesChart analytics={analytics} dataKey="salesCents" name="Sales" format={(v) => money(v, currencyCode)} formatTick={(v) => moneyCompact(v, currencyCode)} />
        </s-section>
      </div>

      <div className={styles.chartGrid}>
        <s-section heading="Auction outcomes">
          <s-stack direction="block" gap="small">
            <span className={styles.subdued}>
              {kpis.auctionsSold} sold{kpis.avgUplift !== null && ` · sold on average ${percent(kpis.avgUplift)} above the starting bid`}
            </span>
            <OutcomesFigure outcomes={analytics.outcomes} />
          </s-stack>
        </s-section>
        <s-section heading="Offers">
          <OffersChart offers={analytics.offers} />
        </s-section>
      </div>

      <s-section heading="Most active auctions">
        {analytics.topAuctions.length === 0 ? (
          <div className={styles.emptyInline}><s-icon type="chart-vertical" /><span>No bids in this period yet.</span></div>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Auction</s-table-header>
              <s-table-header format="numeric">Bids</s-table-header>
              <s-table-header format="numeric">Bidders</s-table-header>
              <s-table-header format="numeric">High bid</s-table-header>
              <s-table-header format="numeric">vs starting bid</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {analytics.topAuctions.map((a) => (
                <s-table-row key={a.id}>
                  <s-table-cell>
                    <div className={styles.cellStack}><s-text type="strong">{a.title}</s-text><span className={styles.subdued}>{a.productTitle}</span></div>
                  </s-table-cell>
                  <s-table-cell>{a.bids}</s-table-cell>
                  <s-table-cell>{a.bidders}</s-table-cell>
                  <s-table-cell><span className={styles.amount}>{money(a.highCents, a.currencyCode)}</span></s-table-cell>
                  <s-table-cell>{a.startingPriceCents > 0 ? `+${percent(a.highCents / a.startingPriceCents - 1)}` : "—"}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </>
  );
}
