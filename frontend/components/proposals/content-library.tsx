/** Persistent approved-content library with tenant-scoped filters. */
"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

type Status = "draft" | "review" | "approved" | "expired";

/** Lists current Convex entries without static examples. */
export function ContentLibrary() {
  const [status, setStatus] = useState<Status | "all">("all");
  const [capability, setCapability] = useState("");
  const entries = useQuery(api.contentLibrary.listEntries, { status: status === "all" ? undefined : status, capabilityArea: capability || undefined });
  return (
    <section aria-label="Content library" className="stack">
      <div className="filter-rail">
        <label>Status <select value={status} onChange={(event) => setStatus(event.target.value as Status | "all")}><option value="all">All</option><option value="draft">Draft</option><option value="review">Review</option><option value="approved">Approved</option><option value="expired">Expired</option></select></label>
        <label>Capability <input value={capability} onChange={(event) => setCapability(event.target.value)} placeholder="Filter capability area" /></label>
      </div>
      {entries === undefined ? <p role="status">Loading approved content…</p> : entries.length === 0 ? <p className="empty-state">No content matches these filters.</p> : (
        <div className="table-wrap"><table><thead><tr><th scope="col">Title</th><th scope="col">Status</th><th scope="col">Capability</th><th scope="col">Owner</th><th scope="col">Freshness</th></tr></thead><tbody>
          {entries.map((entry) => <tr key={entry._id}><td>{entry.title}</td><td>{entry.status}</td><td>{entry.capabilityArea ?? "Unclassified"}</td><td>{entry.ownerId}</td><td>{entry.freshnessState ?? "Not reviewed"}</td></tr>)}
        </tbody></table></div>
      )}
      <p className="help-text">Near-duplicate and subject-matter expert suggestions use persisted contribution evidence and require confirmation.</p>
    </section>
  );
}
