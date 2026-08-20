/**
 * Product layout for BidRadar.
 *
 * Wraps all procurement routes with the responsive app shell,
 * sidebar, top context, and mobile drawer handling.
 */
"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";

/**
 * Props for the product layout.
 */
type ProductLayoutProps = {
  /** Child route content. */
  children: React.ReactNode;
};

/**
 * Provides the shared procurement shell for authenticated routes.
 * Derives active navigation from the current pathname and supplies
 * organization context. Replace mock permissions with Clerk role claims.
 */
export default function ProductLayout({ children }: ProductLayoutProps) {
  const pathname = usePathname() ?? "/opportunities";
  // Mock: all permissions for admin; replace with useAuth/role check.
  const permissions: readonly string[] = [
    "opportunities",
    "watchlist",
    "companies",
    "reviews",
    "proposals",
    "submissions",
    "reports",
    "settings",
  ];

  return (
    <AppShell currentPath={pathname} permissions={permissions} organizationName="Acme Procurement" userLabel="A. Manager">
      {children}
    </AppShell>
  );
}
