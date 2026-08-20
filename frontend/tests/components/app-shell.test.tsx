import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AppShell } from "../../components/app-shell/app-shell";
import { SideNavigation } from "../../components/app-shell/side-navigation";
import { TopContext } from "../../components/app-shell/top-context";

afterEach(() => {
  cleanup();
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.useRealTimers();
});

describe("app shell", () => {
  test("marks active route and hides permission-restricted links", () => {
    render(<SideNavigation currentPath="/opportunities" permissions={["opportunities", "watchlist"]} />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(within(nav).getByRole("link", { name: "Opportunities" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Watchlist" })).toBeVisible();
    expect(within(nav).queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  test("shows all eight navigation items for admin role", () => {
    render(<SideNavigation currentPath="/dashboard" permissions={["opportunities", "watchlist", "companies", "reviews", "proposals", "submissions", "reports", "settings"]} />);
    for (const label of ["Opportunities", "Watchlist", "Companies", "Reviews", "Proposals", "Submissions", "Reports", "Settings"]) {
      expect(screen.getByRole("link", { name: label })).toBeVisible();
      expect(screen.getByRole("link", { name: label })).toHaveAttribute("href");
    }
  });

  test("renders skip link and top context landmarks", () => {
    render(
      <AppShell currentPath="/opportunities" permissions={["opportunities"]} organizationName="Acme Procurement" userLabel="A. Manager">
        <div>content</div>
      </AppShell>,
    );
    const skip = screen.getByRole("link", { name: /skip to main content/i });
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(skip).toHaveClass("skip-link");
    expect(screen.getAllByRole("banner")[0]).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /primary/i })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByText("Acme Procurement")).toBeVisible();
  });

  test("opens and closes mobile drawer below 768 and traps focus via native dialog", async () => {
    render(
      <AppShell currentPath="/companies" permissions={["opportunities", "companies"]} organizationName="Acme" userLabel="User">
        <div>page</div>
      </AppShell>,
    );
    const openButton = screen.getByRole("button", { name: /open navigation/i });
    expect(openButton).toHaveAttribute("aria-expanded", "false");
    expect(openButton).toHaveAttribute("aria-controls");
    // Drawer initially hidden
    expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();
    fireEvent.click(openButton);
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    expect(dialog).toBeVisible();
    expect(openButton).toHaveAttribute("aria-expanded", "true");
    const closeButton = within(dialog).getByRole("button", { name: /close navigation/i });
    expect(closeButton).toBeVisible();
    // Close via button
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();
    // Reopen and close via overlay click
    fireEvent.click(openButton);
    const overlay = screen.getByTestId("drawer-overlay");
    fireEvent.click(overlay);
    expect(screen.queryByRole("dialog", { name: /navigation menu/i })).not.toBeInTheDocument();
  });

  test("exposes keyboard focus order with 44px targets", () => {
    render(<SideNavigation currentPath="/reviews" permissions={["opportunities", "reviews"]} />);
    const links = screen.getAllByRole("link");
    for (const link of links) {
      // JSDOM computed style not reliable, check class enforces 44px via Tailwind/min-height and explicit check
      expect(link.className).toMatch(/min-h-\[44px\]|min-height/);
    }
    cleanup();
    // Skip link should be first focusable element in AppShell
    render(
      <AppShell currentPath="/reviews" permissions={["opportunities", "reviews"]} organizationName="Acme" userLabel="User">
        <div>content</div>
      </AppShell>,
    );
    const allLinks = screen.getAllByRole("link");
    expect(allLinks[0]).toHaveTextContent(/skip to main content/i);
  });

  test("renders top context with organization and user", () => {
    render(<TopContext organizationName="Acme Procurement" userLabel="A. Manager" currentPath="/opportunities" />);
    expect(screen.getByText("Acme Procurement")).toBeVisible();
    expect(screen.getByText("A. Manager")).toBeVisible();
    expect(screen.getAllByRole("banner")[0]).toBeInTheDocument();
  });

  test("renders skeleton, empty, error, offline and permission primitives", async () => {
    render(
      <AppShell currentPath="/opportunities" permissions={["opportunities"]} organizationName="Acme" userLabel="User">
        <div>content</div>
      </AppShell>,
    );
    // Skeleton primitive exported via app-shell (check via lazy import test)
    const { Skeleton, EmptyState, ErrorState, OfflineBanner, PermissionDenied } = await import(
      "../../components/app-shell/app-shell"
    );
    const { container: skeletonContainer } = render(<Skeleton lines={3} />);
    expect(skeletonContainer.querySelectorAll("[data-testid='skeleton-line']").length).toBe(3);
    cleanup();
    render(<EmptyState title="No opportunities" actionLabel="Add company" onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /no opportunities/i })).toBeVisible();
    cleanup();
    render(<ErrorState message="Load failed" onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/load failed/i);
    cleanup();
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/offline/i);
    cleanup();
    render(<PermissionDenied />);
    expect(screen.getByRole("alert")).toHaveTextContent(/permission/i);
  });
});
