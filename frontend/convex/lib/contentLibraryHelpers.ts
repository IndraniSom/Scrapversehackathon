/** Pure helpers for content library (no DB). */

/** Allowed lifecycle statuses for reusable content. */
export const STATUSES = ["draft", "review", "approved", "expired"] as const;
export type ContentStatus = (typeof STATUSES)[number];

/** Allowed transitions; only review can become approved. */
const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["review"],
  review: ["approved", "draft"],
  approved: ["expired", "review"],
  expired: ["draft"],
};

/**
 * Returns true when status transition is allowed.
 */
export function canTransition(from: ContentStatus, to: ContentStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Returns true when title is duplicate (case-insensitive) in org.
 */
export function isDuplicateTitle(title: string, existing: string[]): boolean {
  const norm = title.trim().toLowerCase();
  return existing.some((t) => t.trim().toLowerCase() === norm);
}

/**
 * Cosine similarity helper for duplicate suggestions.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Suggest near duplicates above threshold without auto-merge.
 */
export function suggestDuplicates(
  queryEmbedding: number[],
  candidates: Array<{ id: string; embedding: number[] }>,
  threshold = 0.88,
): Array<{ id: string; score: number }> {
  if (queryEmbedding.length === 0) return [];
  return candidates
    .map((c) => ({ id: c.id, score: cosineSimilarity(queryEmbedding, c.embedding) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Rank SME candidates by approved count then recency.
 */
export function rankSmes(
  contributions: Array<{ ownerId: string; capabilityArea: string; approvedCount: number; lastApprovedAt: number }>,
  capabilityArea: string,
): Array<{ ownerId: string; reason: string }> {
  if (!capabilityArea.trim()) return [];
  return contributions
    .filter((c) => c.capabilityArea.toLowerCase() === capabilityArea.toLowerCase())
    .sort((a, b) => b.approvedCount - a.approvedCount || b.lastApprovedAt - a.lastApprovedAt)
    .slice(0, 3)
    .map((c) => ({ ownerId: c.ownerId, reason: `${c.approvedCount} approved contributions in ${c.capabilityArea}` }));
}
