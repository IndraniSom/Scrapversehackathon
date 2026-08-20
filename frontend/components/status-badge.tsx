import type { Evaluation, Recommendation } from "../schemas/common";

type Status = Evaluation | Recommendation | "VERIFIED" | "UNAVAILABLE" | "ACCEPTED" | "REJECTED" | "EFFECTIVE" | "UNCHANGED";

const statusIcon: Record<Status, string> = {
  PASS: "✓",
  FAIL: "×",
  UNKNOWN: "?",
  NOT_APPLICABLE: "–",
  BID: "↑",
  REVIEW: "!",
  NO_BID: "×",
  VERIFIED: "✓",
  UNAVAILABLE: "?",
  ACCEPTED: "✓",
  REJECTED: "×",
  EFFECTIVE: "↻",
  UNCHANGED: "–",
};

/** Renders a semantic status using both visible text and an icon. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span className={`status-badge status-${status.toLowerCase().replaceAll("_", "-")}`}>
      <span aria-hidden="true">{statusIcon[status]}</span>
      {label ?? status}
    </span>
  );
}
