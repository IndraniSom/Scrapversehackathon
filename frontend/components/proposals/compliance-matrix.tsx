/**
 * Compliance matrix table with gap review, approval gate and CSV export.
 */
"use client";

import { useMemo, useState } from "react";
import { exportComplianceCsv, isApprovalBlocked, type ComplianceRow, type GapCategory } from "../../convex/compliance";

/** Props for the deterministic compliance matrix view. */
type ComplianceMatrixProps = {
  rows: ComplianceRow[];
  onExport?: (csv: string) => void;
};

/** Human-readable gap labels for procurement reviewers. */
const GAP_LABEL: Record<GapCategory, string> = {
  MISSING_DATA: "Missing response data",
  MISSING_DOCUMENT: "Missing evidence document",
  FAILED_REQUIREMENT: "Requirement failed",
  UNKNOWN_SEMANTICS: "Unknown semantics needs review",
  OWNER_REQUIRED: "Owner assignment required",
  REVIEW_REQUIRED: "Review required",
};

/** Returns badge color class for a compliance status. */
function statusClass(status: ComplianceRow["status"]): string {
  if (status === "compliant") return "status-pass";
  if (status === "gap") return "status-fail";
  return "status-pending";
}

/**
 * Renders the compliance matrix with gap categories and approval gate.
 */
export function ComplianceMatrix({ rows, onExport }: ComplianceMatrixProps) {
  const [filter, setFilter] = useState<"all" | GapCategory>("all");
  const blocked = useMemo(() => isApprovalBlocked(rows), [rows]);
  const filtered = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.gapCategory === filter)), [rows, filter]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => a.requirementId.localeCompare(b.requirementId)), [filtered]);

  /** Exports deterministic CSV for the submission package. */
  function handleExport(): void {
    const csv = exportComplianceCsv(rows);
    if (onExport) onExport(csv);
    else {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "compliance-matrix.csv"; a.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <section aria-labelledby="compliance-title">
      <div className="section-heading-row">
        <div><h2 id="compliance-title">Compliance matrix</h2><p>Deterministic rows seeded before AI grouping. Mandatory gaps block approval.</p></div>
        <button type="button" className="primary-action" onClick={handleExport} aria-label="Export compliance CSV">Export CSV</button>
      </div>
      {blocked && <p role="alert" className="approval-blocked">Approval blocked: mandatory rows lack response or evidence.</p>}
      <div className="filter-row" role="toolbar" aria-label="Gap category filter">
        <label>Filter by gap
          <select value={filter} onChange={(e) => setFilter(e.target.value as never)} aria-label="Gap filter">
            <option value="all">All rows</option>
            {Object.keys(GAP_LABEL).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <span aria-live="polite">{sorted.length} of {rows.length} rows shown</span>
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable compliance matrix">
        <table>
          <thead><tr><th scope="col">Requirement</th><th scope="col">Citation</th><th scope="col">Response location</th><th scope="col">Evidence</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Gap category</th></tr></thead>
          <tbody>
            {sorted.length === 0 ? <tr><td colSpan={7}>No compliance rows match the filter.</td></tr> : sorted.map((row) => (
              <tr key={row.requirementId} className={row.isMandatory ? "mandatory-row" : ""}>
                <td><code>{row.requirementId}</code>{row.isMandatory && <span aria-label="mandatory"> *</span>}</td>
                <td>{row.citation}</td>
                <td>{row.responseLocation ?? <em>Not addressed</em>}</td>
                <td>{row.evidence ?? <em>No evidence</em>}</td>
                <td>{row.ownerId ?? <em>Unassigned</em>}</td>
                <td><span className={`status-badge ${statusClass(row.status)}`}>{row.status}</span></td>
                <td>{row.gapCategory ? GAP_LABEL[row.gapCategory] : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>Compliance matrix has no rows. Accepted requirements will seed deterministic rows.</p>}
    </section>
  );
}
