import Link from "next/link";
import { NotificationWidget } from "./NotificationWidget";
import { RealtimeNotifications } from "./RealtimeNotifications";
import { UrlAlerts } from "./UrlAlerts";
import {
  LayoutDashboard, CreditCard, History, User, Settings,
  TrendingUp, Briefcase, ShoppingBag, Shield
} from "lucide-react";

interface WorkspaceLink {
  href: string;
  label: string;
}

interface WorkspaceMetric {
  label: string;
  value: string;
}

interface ProfileSummary {
  completion: number;
  kycStatus: string;
  warningText: string;
  requiredItems: string[];
}

interface WorkspaceFrameProps {
  roleLabel: string;
  heading: string;
  description: string;
  email: string | null;
  userName?: string | null;
  metrics: WorkspaceMetric[];
  links: WorkspaceLink[];
  currentPath?: string;
  profilePath?: string;
  profileSummary?: ProfileSummary;
  headerWidget?: React.ReactNode;
  showProfileAlert?: boolean;
  children?: React.ReactNode;
}

// Map link labels to icons
function getIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes("overview") || l.includes("home") || l.includes("dashboard")) return LayoutDashboard;
  if (l.includes("loan") || l.includes("borrow") || l.includes("apply")) return CreditCard;
  if (l.includes("repay")) return TrendingUp;
  if (l.includes("history")) return History;
  if (l.includes("market") || l.includes("browse")) return ShoppingBag;
  if (l.includes("portfolio") || l.includes("fund")) return Briefcase;
  if (l.includes("kyc") || l.includes("verify")) return Shield;
  if (l.includes("profile") || l.includes("setting")) return Settings;
  return User;
}

export function WorkspaceFrame({
  roleLabel,
  heading,
  description,
  userName,
  metrics,
  links,
  currentPath,
  profilePath,
  profileSummary,
  headerWidget,
  showProfileAlert = true,
  children,
}: WorkspaceFrameProps) {
  const resolvedPath = currentPath ?? links[0]?.href ?? "/dashboard";
  const resolvedProfilePath =
    profilePath ??
    links.find((item) => /profile|settings/i.test(item.label))?.href ??
    links[0]?.href ??
    "/dashboard";
  const displayName =
    userName && userName.trim() !== "" ? userName.trim() : "User";

  const resolvedProfileSummary = profileSummary ?? null;

  const normalizedLinks = (() => {
    const seen = new Set<string>();
    return links.filter((item) => {
      if (seen.has(item.href)) return false;
      seen.add(item.href);
      return true;
    });
  })();

  const metricColumns = metrics.length === 4 ? 4 : metrics.length || 1;

  const isBorrower = roleLabel.toLowerCase().includes("borrow");

  return (
    <main className="role-dashboard-shell">
      <div className="role-dashboard-card role-dashboard-card--wide">
        <div className="workspace-layout">

          {/* ── Sidebar ──────────────────────────────────────────────── */}
          <aside className="workspace-sidebar" aria-label="Dashboard sidebar">
            {/* Brand */}
            <div className="workspace-brand-wrap">
              <Link href="/" className="workspace-brand font-display">
                <div style={{ background: "white", padding: "4px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px" }}>
                   <img src="/logo.png" alt="Kredex Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                </div>
                Kredex
              </Link>
              <p className="workspace-sidebar-kicker">{roleLabel}</p>
            </div>

            {/* Nav */}
            <nav className="workspace-sidebar-nav" aria-label={`${roleLabel} navigation`}>
              {normalizedLinks.map((item) => {
                const Icon = getIcon(item.label);
                const isActive = resolvedPath === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`workspace-sidebar-link ${isActive ? "workspace-sidebar-link--active" : ""}`}
                  >
                    <Icon size={15} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* KYC / Profile Alert */}
            {showProfileAlert && resolvedProfileSummary ? (
              <section className="premium-alert" aria-live="polite">
                <p className="premium-alert-badge">Action Required</p>
                <div className="premium-alert-header">
                  <span className="premium-alert-icon" aria-hidden="true">
                    <span>!</span>
                  </span>
                  <p className="premium-alert-title">Profile & KYC</p>
                </div>
                <p className="workspace-profile-warning">
                  Complete your profile to unlock all actions.
                </p>
                <p className="workspace-profile-copy">{resolvedProfileSummary.warningText}</p>

                <div
                  className="workspace-progress"
                  style={{ margin: "0.8rem 0" }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={resolvedProfileSummary.completion}
                  aria-label={`Profile ${resolvedProfileSummary.completion}% complete`}
                >
                  <span style={{ width: `${resolvedProfileSummary.completion}%` }} />
                </div>
                <p style={{ fontSize: "0.72rem", opacity: 0.65, marginBottom: "0.5rem", color: "var(--text-muted)" }}>
                  {resolvedProfileSummary.completion}% complete
                </p>

                {resolvedProfileSummary.requiredItems.length > 0 && (
                  <ul className="workspace-checklist">
                    {resolvedProfileSummary.requiredItems.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}

                <Link href={resolvedProfilePath} className="premium-alert-btn">
                  Complete Profile
                </Link>
              </section>
            ) : null}
          </aside>

          {/* ── Main panel ───────────────────────────────────────────── */}
          <div className="workspace-main-panel">
            {/* Real-Time Websocket Listener & URL-based Alerts */}
            <RealtimeNotifications />
            <UrlAlerts />

            {/* Topbar */}
            <header className="workspace-topbar">
              <div>
                <h1 className="font-display role-title">{heading}</h1>
                <p className="role-description">{description}</p>
              </div>
              <div className="workspace-header-widget" aria-label="Dashboard controls">
                {headerWidget ?? (
                  <div className="workspace-top-actions">
                    <span className="workspace-chip">
                      <span style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: isBorrower ? "var(--indigo-light)" : "var(--teal-light)",
                        flexShrink: 0,
                      }} />
                      {displayName}
                    </span>
                    <NotificationWidget />
                  </div>
                )}
              </div>
            </header>

            {/* Metrics */}
            <div
              className={`role-metrics ${metrics.length === 4 ? "role-metrics--four" : ""}`}
              style={{ ["--metric-columns" as string]: String(metricColumns) }}
            >
              {metrics.map((metric) => (
                <article key={metric.label} className="role-metric-card">
                  <p className="role-metric-value font-display">{metric.value}</p>
                  <p className="role-metric-label">{metric.label}</p>
                </article>
              ))}
            </div>

            {/* Content */}
            {children ? (
              <section className="workspace-content">{children}</section>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
