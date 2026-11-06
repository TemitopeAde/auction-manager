import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import type { loader, action } from "../../routes/app._index";
import styles from "./styles";

export type DashboardData = Awaited<ReturnType<typeof loader>>;
export type Auction = DashboardData["auctions"][number];
export type Offer = DashboardData["offers"][number];
export type Bidder = DashboardData["bidders"][number];

export type ViewId = "overview" | "analytics" | "auctions" | "create" | "offers" | "bidders";
export const VIEW_IDS: ViewId[] = ["overview", "analytics", "auctions", "create", "offers", "bidders"];

// Server and browser must format identically or React hydration fails, so never rely on
// the runtime's default locale. The route sets this from Shopify's `locale` param each render.
let formatLocale = "en";
export const setFormatLocale = (locale: string | null | undefined) => {
  try {
    formatLocale = locale && Intl.NumberFormat.supportedLocalesOf(locale).length ? locale : "en";
  } catch {
    formatLocale = "en";
  }
};

export const money = (cents: number, currencyCode: string) =>
  new Intl.NumberFormat(formatLocale, { style: "currency", currency: currencyCode }).format(cents / 100);

export const date = (value: string | Date) =>
  new Date(value).toLocaleString(formatLocale, { timeZone: "UTC", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const moneyCompact = (cents: number, currencyCode: string) =>
  new Intl.NumberFormat(formatLocale, { style: "currency", currency: currencyCode, notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);

export const numberCompact = (value: number) =>
  new Intl.NumberFormat(formatLocale, { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const percent = (value: number) =>
  new Intl.NumberFormat(formatLocale, { style: "percent", maximumFractionDigits: 0 }).format(value);

export const shortDate = (value: string | Date) =>
  new Date(value).toLocaleDateString(formatLocale, { timeZone: "UTC", month: "short", day: "numeric" });

export const datetimeLocal = (value: string | Date | null) => value ? new Date(value).toISOString().slice(0, 16) : "";

export const timeUntil = (value: string | Date) => {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return "now";
  const minutes = Math.floor(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${Math.max(minutes, 1)}m`;
};

type BadgeTone = "success" | "critical" | "warning" | "neutral" | "info" | "caution";

export const auctionTone = (status: string): BadgeTone =>
  status === "LIVE" ? "success" : status === "CANCELED" ? "critical" : status === "CLOSING" ? "warning" : status === "ENDED" ? "neutral" : "info";

export const offerTone = (status: string): BadgeTone =>
  status === "ACCEPTED" || status === "BUY_NOW" ? "success" : status === "DECLINED" ? "critical" : status === "EXPIRED" ? "neutral" : status === "PENDING" ? "warning" : "info";

export const bidderTone = (status: string): BadgeTone =>
  status === "APPROVED" ? "success" : status === "BLOCKED" ? "critical" : "warning";

export const label = (status: string) => {
  const text = status.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** A fetcher for the dashboard action that toasts on success and exposes the latest error. */
export function useDashboardFetcher(onSuccess?: () => void) {
  const fetcher = useFetcher<typeof action>();
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    if ("ok" in fetcher.data && fetcher.data.ok) {
      toast.success("message" in fetcher.data && fetcher.data.message ? String(fetcher.data.message) : "Changes saved");
      onSuccessRef.current?.();
    } else if ("error" in fetcher.data && fetcher.data.error) {
      toast.error(String(fetcher.data.error), { duration: 5000, closeButton: true });
    }
  }, [fetcher.state, fetcher.data]);

  const error = fetcher.state === "idle" && fetcher.data && "error" in fetcher.data && fetcher.data.error ? String(fetcher.data.error) : null;
  return { fetcher, busy: fetcher.state !== "idle", error };
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return <s-banner tone="critical" heading="Action could not be completed">{error}</s-banner>;
}

export function ViewHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className={styles.viewHeader}>
      <div>
        <h1 className={styles.viewTitle}>{title}</h1>
        {subtitle && <p className={styles.viewSubtitle}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function DateTimeField({ label: text, name, defaultValue, id, startNowShortcut = false, required = true }: { label: string; name: string; defaultValue?: string; id: string; startNowShortcut?: boolean; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const setStartNow = () => {
    if (inputRef.current) inputRef.current.value = new Date().toISOString().slice(0, 16);
  };

  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.fieldLabel}>{text}</span>
      <div className={styles.datetimeControl}>
        <input ref={inputRef} id={id} className={styles.input} name={name} type="datetime-local" defaultValue={defaultValue} required={required} />
        {startNowShortcut && <s-button type="button" variant="secondary" onClick={setStartNow}>Start now</s-button>}
      </div>
    </label>
  );
}

export function BuyerPremiumField({ defaultValue = "0.00" }: { defaultValue?: string }) {
  const clampPercent = (event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget;
    const value = Number(input.value);
    if (!input.value || !Number.isFinite(value)) return;
    if (value > 100) input.value = "100";
    else if (value < 0) input.value = "0";
  };

  return (
    <label className={styles.field} htmlFor="buyers-premium-percent">
      <span className={styles.fieldLabel}>Buyer premium (%)</span>
      <input id="buyers-premium-percent" className={styles.input} name="buyersPremiumPercent" type="number" min={0} max={100} step={0.01} inputMode="decimal" defaultValue={defaultValue} onInput={clampPercent} />
      <span className={styles.subdued}>Added on top of the winning amount.</span>
    </label>
  );
}
