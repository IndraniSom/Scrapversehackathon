import Link from "next/link";

/**
 * Navigation item for the procurement shell.
 */
type NavItem = {
  /** Visible label. */
  label: string;
  /** Route href. */
  href: string;
  /** Permission key required to view this item. */
  permission: string;
};

/** Full product navigation with eight entries. */
const NAV_ITEMS: readonly NavItem[] = [
  { label: "Opportunities", href: "/opportunities", permission: "opportunities" },
  { label: "Watchlist", href: "/watchlist", permission: "watchlist" },
  { label: "Companies", href: "/companies", permission: "companies" },
  { label: "Reviews", href: "/reviews", permission: "reviews" },
  { label: "Proposals", href: "/proposals", permission: "proposals" },
  { label: "Submissions", href: "/submissions", permission: "submissions" },
  { label: "Reports", href: "/reports", permission: "reports" },
  { label: "Settings", href: "/settings/organization", permission: "settings" },
] as const;

/**
 * Props for side navigation.
 */
type SideNavigationProps = {
  /** Current pathname for active state. */
  currentPath: string;
  /** Allowed permission keys. */
  permissions: readonly string[];
  /** Optional id for drawer aria-controls linking. */
  id?: string;
};

/**
 * Returns true when the item matches the current route.
 */
function isActive(currentPath: string, href: string): boolean {
  if (currentPath === href) return true;
  return currentPath.startsWith(`${href}/`);
}

/**
 * Renders primary navigation with active-state and permission filtering.
 * Uses native links with 44px targets and WCAG-compliant focus.
 */
export function SideNavigation({ currentPath, permissions, id }: SideNavigationProps) {
  const allowed = NAV_ITEMS.filter((item) => permissions.includes(item.permission));
  return (
    <nav aria-label="Primary" id={id}>
      <ul className="nav-list">
        {allowed.map((item) => {
          const active = isActive(currentPath, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="nav-link min-h-[44px] min-w-[44px] focus-visible:outline-[3px] focus-visible:outline-[var(--focus)]"
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
