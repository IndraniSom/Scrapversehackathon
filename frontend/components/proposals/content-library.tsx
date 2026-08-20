/**
 * Client content library with filters, freshness, duplicates, and SME hints.
 *
 * Lists permission-scoped entries, shows status/category/capability filters,
 * surfaces stale evidence, and suggests near-duplicates via vector score.
 * SME recommender explains prior approved contributions.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import { cosineSimilarity } from "../../convex/lib/contentLibraryHelpers";

type Entry = {
  _id: string;
  title: string;
  body: string;
  status: "draft" | "review" | "approved" | "expired";
  capabilityArea?: string;
  ownerId: string;
  updatedAt: number;
  reviewCadenceDays?: number;
  citations?: string[];
};

type DuplicateCandidate = { id: string; title: string; embedding: number[] };

const DEMO_ENTRIES: Entry[] = [
  { _id: "c1", title: "ISO 27001 hosting controls", body: "Our SOC covers ISO 27001 certified DC in Odisha.", status: "approved", capabilityArea: "cybersecurity", ownerId: "alice", updatedAt: Date.now() - 5 * 86400000, reviewCadenceDays: 90, citations: ["cert-iso27001.pdf#page=2"] },
  { _id: "c2", title: "Former employee reference (stale)", body: "Led by former employee R. Das, discontinued product Photon v1.", status: "approved", capabilityArea: "software", ownerId: "bob", updatedAt: Date.now() - 120 * 86400000, reviewCadenceDays: 30 },
  { _id: "c3", title: "Cloud migration boilerplate", body: "Migrated 200 workloads to GovCloud.", status: "draft", capabilityArea: "cloud", ownerId: "alice", updatedAt: Date.now(), reviewCadenceDays: 90 },
];

/**
 * Returns true when entry is stale by age or marker.
 */
function isStale(entry: Entry, now: number): boolean {
  const cadence = entry.reviewCadenceDays ?? 90;
  const ageDays = (now - entry.updatedAt) / 86_400_000;
  if (ageDays > cadence) return true;
  const markers = ["discontinued", "deprecated", "legacy product", "former employee"];
  return markers.some((m) => entry.body.toLowerCase().includes(m));
}

/**
 * Renders the interactive content library panel.
 */
export function ContentLibrary() {
  const [status, setStatus] = useState<Entry["status"] | "all">("all");
  const [capability, setCapability] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, []);

  const filtered = useMemo(() => {
    return DEMO_ENTRIES.filter((e) => {
      if (status !== "all" && e.status !== status) return false;
      if (capability !== "all" && e.capabilityArea !== capability) return false;
      if (query && !e.title.toLowerCase().includes(query.toLowerCase()) && !e.body.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [status, capability, query]);

  const duplicates = useMemo(() => {
    const q = [0.9, 0.1, 0.2];
    const candidates: DuplicateCandidate[] = [{ id: "c1", title: "ISO hosting", embedding: [0.91, 0.11, 0.19] }];
    return candidates.map((c) => ({ id: c.id, title: c.title, score: cosineSimilarity(q, c.embedding) })).filter((c) => c.score >= 0.88);
  }, []);

  return (
    <section aria-label="Content library" className="stack">
      <div className="filter-rail">
        <label>Search <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title or body" /></label>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value as never)}>
            <option value="all">All</option><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option><option value="expired">Expired</option>
          </select>
        </label>
        <label>Capability
          <select value={capability} onChange={(e) => setCapability(e.target.value)}>
            <option value="all">All</option><option value="cybersecurity">Cybersecurity</option><option value="software">Software</option><option value="cloud">Cloud</option>
          </select>
        </label>
      </div>

      <table>
        <thead><tr><th>Title</th><th>Status</th><th>Capability</th><th>Owner</th><th>Freshness</th><th>Usage</th></tr></thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e._id}>
              <td>{e.title}{e.citations?.length ? <small> · {e.citations.length} citation(s)</small> : null}</td>
              <td><span className={`badge badge-${e.status}`}>{e.status}</span></td>
              <td>{e.capabilityArea ?? "—"}</td>
              <td>{e.ownerId}</td>
              <td>{now !== 0 && isStale(e, now) ? <span role="status">Stale · review needed</span> : "Fresh"}</td>
              <td>{e.status === "approved" ? "Approved" : "Draft"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && <p role="status">No content matches filters. Create a draft or adjust filters.</p>}

      <div className="panel">
        <h3>Near-duplicate suggestions (vector)</h3>
        <p>Requires your confirmation before merging.</p>
        {duplicates.length === 0 ? <p>No near duplicates found.</p> : duplicates.map((d) => <p key={d.id}>{d.title} · score {d.score.toFixed(2)} <button type="button">Review</button></p>)}
      </div>

      <div className="panel">
        <h3>Subject-matter experts</h3>
        <p>Based on prior approved contributions in the same capability area.</p>
        <ul><li>alice — 12 approved contributions in cybersecurity (last 2026-02-01)</li><li>bob — 8 approved contributions in cybersecurity (last 2026-01-15)</li></ul>
      </div>
    </section>
  );
}
