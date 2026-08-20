import type { ReactNode } from "react";

/**
 * Props for the top context bar.
 */
type TopContextProps = {
  /** Organization display name. */
  organizationName: string;
  /** Current user label. */
  userLabel: string;
  /** Current pathname for contextual title. */
  currentPath: string;
  /** Optional leading action such as mobile menu button. */
  leadingAction?: ReactNode;
};

/**
 * Derives a human title from the current path.
 */
function titleForPath(path: string): string {
  if (path.startsWith("/opportunities")) return "Opportunities";
  if (path.startsWith("/watchlist")) return "Watchlist";
  if (path.startsWith("/companies")) return "Companies";
  if (path.startsWith("/reviews")) return "Reviews";
  if (path.startsWith("/proposals")) return "Proposals";
  if (path.startsWith("/submissions")) return "Submissions";
  if (path.startsWith("/reports")) return "Reports";
  if (path.startsWith("/settings")) return "Settings";
  return "Procurement workspace";
}

/**
 * Renders the top context header with organization and user.
 * Uses semantic header and 44px focus targets.
 */
export function TopContext({ organizationName, userLabel, currentPath, leadingAction }: TopContextProps) {
  const title = titleForPath(currentPath);
  return (
    <header className="shell-topbar" role="banner">
      {leadingAction ? <div className="mr-3 flex items-center">{leadingAction}</div> : null}
      <div className="min-w-0 flex-1">
        <p className="eyebrow m-0 truncate">{organizationName}</p>
        <h1 className="m-0 text-[1.05rem] font-semibold leading-none">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline text-sm text-[var(--muted)]" aria-label={`Signed in as ${userLabel}`}>
          {userLabel}
        </span>
        <span
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--surface-strong)] text-sm font-bold"
          aria-hidden="true"
        >
          {userLabel.slice(0, 1).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
