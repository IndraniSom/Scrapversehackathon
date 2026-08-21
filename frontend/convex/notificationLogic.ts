/** Pure notification deduplication, preference, digest, and retry rules. */

export type NotificationType = "saved_search_match" | "new_document" | "amendment" | "deadline" | "assessment_transition" | "assignment" | "comment_mention" | "approval" | "export" | "submission_risk";
export type Channel = "in_app" | "email" | "digest";

/** Builds tenant-scoped deduplication key for idempotent event emission. */
export function buildDeduplicationKey(organizationId: string, type: NotificationType, sourceId: string): string {
  return `${organizationId}:${type}:${sourceId}`;
}

/** Returns true when UTC hour falls inside quiet window. */
export function isQuietHour(timestamp: number, quiet: { startHour: number; endHour: number } | null): boolean {
  if (!quiet) return false;
  const hour = new Date(timestamp).getUTCHours();
  if (quiet.startHour <= quiet.endHour) return hour >= quiet.startHour && hour < quiet.endHour;
  return hour >= quiet.startHour || hour < quiet.endHour;
}

/** Returns true when channel is enabled and delivery is not disabled. */
export function shouldDeliver(channel: Channel, preferences: Channel[] | null, disabled: boolean): boolean {
  if (disabled) return false;
  return preferences === null || preferences.includes(channel);
}

/** Groups events by UTC day and type for digest delivery. */
export function groupIntoDigest(events: Array<{ type: NotificationType; createdAt: number }>): Map<string, typeof events> {
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = `${new Date(event.createdAt).toISOString().slice(0, 10)}:${event.type}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return groups;
}

/** Returns true when a failed delivery remains below three attempts. */
export function shouldRetry(attempts: number, status: string): boolean {
  return status === "failed" && attempts < 3;
}
