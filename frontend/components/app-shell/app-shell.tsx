/**
 * Procurement app shell with responsive navigation.
 *
 * Provides skip link, banner, sidebar, mobile drawer,
 * and shared state primitives with accessible semantics.
 */
"use client";
import { useEffect, useState } from "react";
import { SideNavigation } from "./side-navigation";
import { TopContext } from "./top-context";
/**
 * Props for the application shell.
 */
type AppShellProps = {
  /** Current pathname for active state. */
  currentPath: string;
  /** Allowed permission keys. */
  permissions: readonly string[];
  /** Organization name. */
  organizationName: string;
  /** Current user label. */
  userLabel: string;
  /** Page content. */
  children: React.ReactNode;
};
/**
 * Layout that wires navigation, header, and main landmark with mobile drawer.
 * Sidebar persists on desktop; drawer handles navigation below 768px.
 */
export function AppShell({ currentPath, permissions, organizationName, userLabel, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="app-shell-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <aside className="shell-sidebar" aria-label="Primary navigation desktop">
        <div className="shell-sidebar-head">
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: "var(--radius-xs)", background: "var(--text)", color: "var(--surface)", fontFamily: "var(--font-mono)", fontSize: "0.68rem", fontWeight: 500, letterSpacing: "0.06em" }} aria-hidden="true">
              BR
            </span>
            <strong style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", letterSpacing: "var(--tracking-tight)" }}>BidRadar</strong>
          </div>
          <p style={{ margin: 0, color: "var(--faint)", fontSize: "0.76rem", lineHeight: 1.4 }}>Evidence-backed procurement</p>
        </div>
        <SideNavigation currentPath={currentPath} permissions={permissions} />
      </aside>

      <TopContext
        organizationName={organizationName}
        userLabel={userLabel}
        currentPath={currentPath}
        leadingAction={
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={open}
            aria-controls="mobile-drawer"
            onClick={() => setOpen(true)}
            className="menu-button min-h-[44px] min-w-[44px]"
          >
            Menu
          </button>
        }
      />

      <main id="main-content" className="shell-main" tabIndex={-1}>
        {children}
      </main>

      {open ? (
        <>
          <div data-testid="drawer-overlay" className="drawer-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            id="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="drawer-panel"
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
              <strong style={{ fontFamily: "var(--font-display)" }}>Menu</strong>
              <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="drawer-close">
                Close
              </button>
            </div>
            <SideNavigation currentPath={currentPath} permissions={permissions} id="mobile-nav" />
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * Destination-shaped skeleton without spinners.
 */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} data-testid="skeleton-line" className={`skeleton-line ${index === lines - 1 ? "short" : index === 0 ? "full" : "medium"}`} />
      ))}
    </div>
  );
}

/**
 * Empty state that teaches the next action.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <h2 id="empty-title">{title}</h2>
      {description ? <p style={{ color: "var(--muted)" }}>{description}</p> : <p>Add a company or adjust filters to see results. Saved searches will notify you when matches appear.</p>}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="btn-primary" style={{ marginTop: "var(--space-4)" }}>
          {actionLabel}
        </button>
      ) : null}
    </section>
  );
}

/**
 * Error panel with retry and alert role.
 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <p style={{ margin: 0, fontWeight: 650 }}>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-primary" style={{ marginTop: "var(--space-3)" }}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * Offline banner with status announcement.
 */
export function OfflineBanner() {
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <span aria-hidden="true">●</span> You are offline. Content may be stale.
    </div>
  );
}

/**
 * Permission denied with alert semantics.
 */
export function PermissionDenied() {
  return (
    <div className="permission-denied" role="alert">
      <h2 style={{ margin: 0, fontFamily: "var(--font-display)" }}>Permission required</h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>You do not have access to this section. Contact an organization admin.</p>
    </div>
  );
}

/**
 * Filter rail that becomes a sheet on mobile via native details.
 */
export function FilterRail({ children }: { children: React.ReactNode }) {
  return (
    <>
      <aside className="filter-rail filter-rail-desktop" aria-label="Filters">
        {children}
      </aside>
      <details className="filter-sheet md:hidden" aria-label="Filters">
        <summary className="min-h-[44px] cursor-pointer font-semibold text-[var(--action)]">Filters</summary>
        <div className="grid gap-4">{children}</div>
      </details>
    </>
  );
}
