/** Persistent pursuit pipeline for watched opportunities. */
"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";

const STAGES = ["DISCOVERED", "QUALIFYING", "PURSUING", "NO_BID", "SUBMITTED", "WON", "LOST", "ARCHIVED"] as const;

/** Renders tenant watchlist with persisted stage changes and removal. */
export default function WatchlistPage() {
  const entries = useQuery(api.watchlists.list, {});
  const update = useMutation(api.watchlists.update);
  const remove = useMutation(api.watchlists.remove);
  return <main className="page-shell" id="main-content"><header className="page-intro"><h1>Watchlist</h1><p>Move watched tenders through qualification, pursuit, submission, and outcome stages.</p></header>{entries === undefined ? <p role="status">Loading watchlist…</p> : entries.length === 0 ? <p className="empty-state">No watched opportunities.</p> : <div className="table-wrap"><table><thead><tr><th>Opportunity</th><th>Stage</th><th>Owner</th><th>Next action</th><th>Action</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry._id}><td>{entry.opportunity ? <Link href={`/opportunities/${entry.opportunityId}`}>{entry.opportunity.title}</Link> : "Unavailable opportunity"}</td><td><select aria-label={`Stage for ${entry.opportunity?.title ?? entry._id}`} value={entry.stage} onChange={(event) => void update({ id: entry._id, stage: event.target.value as (typeof STAGES)[number] })}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></td><td>{entry.ownerId}</td><td>{entry.nextActionAt ? new Date(entry.nextActionAt).toLocaleString() : "Not set"}</td><td><button type="button" onClick={() => void remove({ id: entry._id })}>Remove</button></td></tr>)}</tbody></table></div>}</main>;
}
