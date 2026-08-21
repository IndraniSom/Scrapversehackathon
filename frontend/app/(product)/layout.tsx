/** Product shell that exposes only navigation authorized by Clerk claims. */
"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";

/** Props accepted by the product layout. */
type ProductLayoutProps = { children: React.ReactNode };

const navigationPermissions = ["opportunities", "watchlist", "alerts", "companies", "reviews", "content", "proposals", "submissions", "integrations", "reports", "settings"] as const;
const isE2eMode = process.env.NEXT_PUBLIC_BIDRADAR_E2E_MODE === "1";

/** Returns least-privilege navigation allowed for one Clerk organization role. */
export function permissionsForRole(role: string | undefined): readonly string[] {
  if (role === "org:admin") return navigationPermissions;
  if (role === "org:bid_manager") return navigationPermissions.filter((permission) => permission !== "settings");
  if (role === "org:reviewer") return ["opportunities", "alerts", "reviews", "content", "proposals", "reports"];
  if (role === "org:contributor") return ["opportunities", "alerts", "companies", "content", "proposals"];
  return ["opportunities", "alerts", "reports"];
}

/** Renders authenticated product shell from active Clerk claims. */
function AuthenticatedProductLayout({ children }: ProductLayoutProps) {
  const pathname = usePathname() ?? "/opportunities";
  const { organization, membership } = useOrganization();
  const { user } = useUser();
  const permissions = permissionsForRole(membership?.role);
  return <AppShell currentPath={pathname} permissions={permissions} organizationName={organization?.name ?? "Organization"} userLabel={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Member"}>{children}</AppShell>;
}

/** Renders isolated browser-test shell without invoking Clerk hooks. */
function E2eProductLayout({ children }: ProductLayoutProps) {
  const pathname = usePathname() ?? "/opportunities";
  return <AppShell currentPath={pathname} permissions={navigationPermissions} organizationName="E2E organization" userLabel="Test manager">{children}</AppShell>;
}

/** Renders authenticated production shell or isolated browser-test shell. */
export default function ProductLayout(props: ProductLayoutProps) {
  if (isE2eMode) return <E2eProductLayout {...props} />;
  return <AuthenticatedProductLayout {...props} />;
}
