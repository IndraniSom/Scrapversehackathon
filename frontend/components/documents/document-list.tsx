/**
 * Document list for company evidence.
 * Renders quarantine/approved/rejected states and proxy download links.
 * Never exposes Convex storage bearer URLs.
 */
"use client";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Props for list. */
type Props = {
  /** Optional filter by company. */
  companyId?: Id<"companies">;
};

/** Formats bytes. */
function fmt(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Badge class for state. */
function badge(state: string): string {
  if (state === "approved") return "status-badge status-pass";
  if (state === "rejected") return "status-badge status-fail";
  if (state === "quarantined" || state === "quarantine" || state === "pending") return "status-badge status-unknown";
  return "status-badge";
}

/** Company document list with permission-checked downloads. */
export function DocumentList({ companyId }: Props) {
  const docs = useQuery(api.companyDocuments.listDocuments, companyId ? { companyId } : {});
  const approve = useMutation(api.companyDocuments.approveDocument);
  const rejectM = useMutation(api.companyDocuments.rejectDocument);
  const del = useMutation(api.companyDocuments.deleteDocument);

  if (docs === undefined) return <p role="status">Loading documents…</p>;
  if (docs.length === 0) return <p>No documents uploaded.</p>;

  return (
    <section aria-labelledby="doc-list-title">
      <h3 id="doc-list-title">Evidence documents</h3>
      <div className="table-wrap" role="region" aria-label="Document list">
        <table>
          <thead>
            <tr><th>File</th><th>Size</th><th>MIME</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d._id}>
                <td>{d.fileName ?? d.sha256.slice(0, 12)}<span className="subline">{d.sha256.slice(0, 16)}…</span></td>
                <td>{fmt(d.size)}</td>
                <td>{d.mime}</td>
                <td><span className={badge(d.scanState)}>{d.scanState}</span></td>
                <td>
                  <a className="text-link" href={`/api/files/${d._id}`} download>Download</a>
                  {d.scanState === "quarantined" || d.scanState === "quarantine" || d.scanState === "pending" ? (
                    <>
                      <button className="text-link" onClick={() => void approve({ documentId: d._id })}>Approve</button>
                      <button className="text-link" onClick={() => void rejectM({ documentId: d._id })}>Reject</button>
                    </>
                  ) : null}
                  <button className="text-link" onClick={() => void del({ documentId: d._id })}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
