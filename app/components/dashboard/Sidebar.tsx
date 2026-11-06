import styles from "./styles";
import type { ViewId } from "./shared";

type NavItem = { id: ViewId; label: string; icon: string; count?: number; alert?: boolean };

export function Sidebar({
  view,
  onNavigate,
  shop,
  currencyCode,
  counts,
  protectionEnabled,
}: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  shop?: string;
  currencyCode: string;
  counts: { attention: number; auctions: number; pendingOffers: number; bidders: number };
  protectionEnabled: boolean;
}) {
  const items: NavItem[] = [
    { id: "overview", label: "Overview", icon: "home", count: counts.attention || undefined, alert: counts.attention > 0 },
    { id: "analytics", label: "Analytics", icon: "chart-vertical" },
    { id: "auctions", label: "Auctions", icon: "live", count: counts.auctions },
    { id: "offers", label: "Offers", icon: "cash-dollar", count: counts.pendingOffers || undefined, alert: counts.pendingOffers > 0 },
    { id: "bidders", label: "Bidders", icon: "person-list", count: counts.bidders },
  ];

  const renderItem = (item: NavItem) => (
    <button
      key={item.id}
      type="button"
      className={`${styles.navItem} ${view === item.id ? styles.navItemActive : ""}`}
      aria-current={view === item.id ? "page" : undefined}
      onClick={() => onNavigate(item.id)}
    >
      <s-icon type={item.icon as "home"} />
      <span className={styles.navItemLabel}>{item.label}</span>
      {item.count !== undefined && (
        <span className={`${styles.navCount} ${item.alert ? styles.navCountAlert : ""}`}>{item.count}</span>
      )}
    </button>
  );

  return (
    <aside className={styles.sidebar} aria-label="Auction manager navigation">
      <div className={styles.brand}>
        <div className={styles.brandMark} aria-hidden="true">AM</div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Auction Manager</span>
          {shop && <span className={styles.brandShop}>{shop.replace(".myshopify.com", "")}</span>}
        </div>
      </div>

      <nav className={styles.nav}>
        <span className={styles.navLabel}>Manage</span>
        {items.map(renderItem)}
        <button
          type="button"
          className={`${styles.navItem} ${view === "create" ? styles.navItemActive : ""}`}
          aria-current={view === "create" ? "page" : undefined}
          onClick={() => onNavigate("create")}
        >
          <s-icon type="plus-circle" />
          <span className={styles.navItemLabel}>New auction</span>
        </button>
      </nav>

      <div className={styles.sidebarFooter}>
        <div className={styles.statusRow}>
          <span className={`${styles.statusDot} ${protectionEnabled ? "" : styles.statusDotWarning}`} />
          <span>{protectionEnabled ? "Checkout protection on" : "Checkout protection off"}</span>
        </div>
        <span>Times in UTC · Prices in {currencyCode}</span>
      </div>
    </aside>
  );
}
