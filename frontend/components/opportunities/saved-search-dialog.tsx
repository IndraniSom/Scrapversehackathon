/**
 * Dialog for creating and updating saved searches.
 *
 * Uses native dialog element for accessible focus trapping.
 * Persists query, filters, cadence, and notification channels.
 */
"use client";

import { useEffect, useRef, useState } from "react";

export type SavedSearchDraft = {
  name?: string;
  query: string;
  filters: Record<string, unknown>;
  cadence: "instant" | "daily" | "weekly";
  channels: string[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSave: (draft: SavedSearchDraft) => void;
  initial?: SavedSearchDraft;
};

/**
 * Renders a modal dialog for saved search creation.
 */
export function SavedSearchDialog({ open, onClose, onSave, initial }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<SavedSearchDraft>(
    initial ?? { query: "", filters: {}, cadence: "daily", channels: ["in_app"] },
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (draft.query.trim().length === 0 && Object.keys(draft.filters).length === 0) return;
    onSave(draft);
    onClose();
  }

  return (
    <dialog ref={ref} aria-labelledby="save-title" onClose={onClose}>
      <form method="dialog" onSubmit={submit}>
        <h2 id="save-title">Save search</h2>
        <label htmlFor="save-name">Name</label>
        <input id="save-name" value={draft.name ?? ""} placeholder="e.g., Odisha cybersecurity" onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value || undefined }))} />

        <label htmlFor="save-query">Keyword</label>
        <input id="save-query" value={draft.query} placeholder="Optional keyword" onChange={(e) => setDraft((p) => ({ ...p, query: e.target.value }))} />

        <fieldset>
          <legend>Cadence</legend>
          <label><input type="radio" name="cadence" checked={draft.cadence === "instant"} onChange={() => setDraft((p) => ({ ...p, cadence: "instant" }))} /> Instant</label>
          <label><input type="radio" name="cadence" checked={draft.cadence === "daily"} onChange={() => setDraft((p) => ({ ...p, cadence: "daily" }))} /> Daily</label>
          <label><input type="radio" name="cadence" checked={draft.cadence === "weekly"} onChange={() => setDraft((p) => ({ ...p, cadence: "weekly" }))} /> Weekly</label>
        </fieldset>

        <fieldset>
          <legend>Channels</legend>
          <label><input type="checkbox" checked={draft.channels.includes("in_app")} onChange={(e) => setDraft((p) => ({ ...p, channels: e.target.checked ? [...p.channels, "in_app"] : p.channels.filter((c) => c !== "in_app") }))} /> In-app</label>
          <label><input type="checkbox" checked={draft.channels.includes("email")} onChange={(e) => setDraft((p) => ({ ...p, channels: e.target.checked ? [...p.channels, "email"] : p.channels.filter((c) => c !== "email") }))} /> Email</label>
        </fieldset>

        <div className="dialog-actions">
          <button type="submit">Save search</button>
          <button type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </dialog>
  );
}
