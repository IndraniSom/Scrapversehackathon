/** Persistent submission package register. */
"use client";

import { useQuery } from "convex/react";
import Link from "next/link";

import { api } from "../../../convex/_generated/api";

/** Lists tenant packages and links to receipt and download detail. */
export default function SubmissionsPage() {
  const packages = useQuery(api.submissions.list, {});
  return <main className="page-shell" id="main-content"><header className="page-intro"><h1>Submission packages</h1><p>Validated proposal exports awaiting approval, portal handoff, or receipt capture.</p></header>{packages === undefined ? <p role="status">Loading submission packages…</p> : packages.length === 0 ? <p className="empty-state">No submission packages.</p> : <div className="table-wrap"><table><thead><tr><th>Package</th><th>Validation</th><th>Approval</th><th>Exports</th><th>Created</th></tr></thead><tbody>{packages.map((entry) => <tr key={entry._id}><td><Link href={`/submissions/${entry._id}`}>{String(entry._id)}</Link></td><td>{entry.validationState}</td><td>{entry.approvalState}</td><td>{entry.exportIds.length}</td><td>{new Date(entry.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</main>;
}
