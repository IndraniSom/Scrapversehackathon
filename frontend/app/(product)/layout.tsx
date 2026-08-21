/** Product shell that exposes only navigation authorized by Clerk claims. */
"use client";

import { useOrganization, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell/app-shell";

/** Props accepted by the product layout. */
type ProductLayoutProps = { children: React.ReactNode };

const navigationPermissions = ["opportunities", "watchlist", "companies", "reviews", "proposals", "submissions", "reports", "settings"] as const;
const isDemoMode = process.env.NEXT_PUBLIC_BIDRADAR_DEMO_MODE === "1";

/** Returns least-privilege navigation allowed for one Clerk organization role. */
export function permissionsForRole(role: string | undefined): readonly string[] {
  if (role === "org:admin") return navigationPermissions;
  if (role === "org:bid_manager") return navigationPermissions.filter((permission) => permission !== "settings");
  if (role === "org:reviewer") return ["opportunities", "reviews", "proposals", "reports"];
  if (role === "org:contributor") return ["opportunities", "companies", "proposals"];
  return ["opportunities", "reports"];
}

/** Renders authenticated product shell from active Clerk claims. */
function AuthenticatedProductLayout({ children }: ProductLayoutProps) {
  const pathname = usePathname() ?? "/opportunities";
  const { organization, membership } = useOrganization();
  const { user } = useUser();
  const permissions = permissionsForRole(membership?.role);
  return <AppShell currentPath={pathname} permissions={permissions} organizationName={organization?.name ?? "Organization"} userLabel={user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Member"}>{children}</AppShell>;
}

/** Renders authenticated shell or explicit offline demo shell. */
export default function ProductLayout(props: ProductLayoutProps) {
  if (isDemoMode) {
    return <AppShell currentPath="/opportunities" permissions={navigationPermissions} organizationName="Demo organization" userLabel="Demo manager">{props.children}</AppShell>;
  }
  return <AuthenticatedProductLayout {...props} />;
}
