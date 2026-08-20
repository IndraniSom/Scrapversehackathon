/** Submission package detail with deterministic manifest. */
import Link from "next/link";

export const dynamic = "force-dynamic";

type ManifestFile = {
  path: string;
  sha256: string;
  byte_length: number;
  mime: string;
  origin: string;
  revision: number;
};

type SubmissionView = {
  submissionId: string;
  proposalId: string;
  proposalTitle: string;
  proposalRevision: number;
  validationState: "pending" | "valid" | "invalid";
  approvalState: "draft" | "approved" | "rejected";
  files: ManifestFile[];
};

/** Renders one manifest row with stable procurement vocabulary. */
function ManifestRow({ file }: { file: ManifestFile }) {
  return (
    <tr>
      <td><code>{file.path}</code></td>
      <td><span className="hash">{file.sha256}</span></td>
      <td>{file.byte_length.toLocaleString()}</td>
      <td>{file.mime}</td>
      <td>{file.origin}</td>
      <td>{file.revision}</td>
    </tr>
  );
}

/** Fetches submission locally; falls back to seeded deterministic example. */
async function loadSubmission(submissionId: string): Promise<SubmissionView> {
  // Placeholder for Convex query: api.submissions.get in production.
  const files: ManifestFile[] = [
    { path: "assessment.pdf", sha256: "a".repeat(64), byte_length: 48211, mime: "application/pdf", origin: "assessment-v2", revision: 2 },
    { path: "compliance.csv", sha256: "b".repeat(64), byte_length: 8214, mime: "text/csv", origin: "compliance-v2", revision: 2 },
    { path: "proposal.docx", sha256: "c".repeat(64), byte_length: 124992, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", origin: "proposal-v2", revision: 2 },
  ].sort((a, b) => a.path.localeCompare(b.path));
  return {
    submissionId,
    proposalId: "ocac-pond-monitoring-26001",
    proposalTitle: "Pond Monitoring and Advisory System",
    proposalRevision: 2,
    validationState: "valid",
    approvalState: "draft",
    files,
  };
}

/** Renders the submission package and content-addressed manifest. */
export default async function SubmissionPage({ params }: PageProps<"/submissions/[submissionId]">) {
  const { submissionId } = (await params) as { submissionId: string };
  const submission = await loadSubmission(submissionId);
  const canDownload = submission.validationState === "valid" && submission.approvalState === "approved";
  return (
    <main className="page-shell detail-page" id="main-content">
      <header className="page-intro">
        <Link className="text-link back-link" href="/proposals">← Proposals</Link>
        <p className="source-line">Submission package · Rev {submission.proposalRevision}</p>
        <h1>{submission.proposalTitle}</h1>
        <p>Package {submission.submissionId} for opportunity {submission.proposalId}. Files are content-addressed with SHA-256 and byte length.</p>
      </header>

      <section className="proof-panel" aria-labelledby="package-status">
        <h2 id="package-status">Package status</h2>
        <dl className="definition-grid">
          <div><dt>Validation</dt><dd>{submission.validationState}</dd></div>
          <div><dt>Approval</dt><dd>{submission.approvalState}</dd></div>
          <div><dt>Proposal revision</dt><dd>{submission.proposalRevision}</dd></div>
          <div><dt>Files</dt><dd>{submission.files.length} — deterministic order by path</dd></div>
        </dl>
        {!canDownload && <p className="subline">Download requires approved validation and amendment review. Final submission must be completed on the official portal.</p>}
      </section>

      <section aria-labelledby="manifest-title">
        <div className="section-heading-row">
          <h2 id="manifest-title">Content manifest</h2>
          <p>Sorted by path. Each entry shows hash, length, MIME, origin, and revision.</p>
        </div>
        <div className="table-wrap" role="region" aria-label="Manifest files">
          <table>
            <thead>
              <tr><th>Path</th><th>SHA-256</th><th>Bytes</th><th>MIME</th><th>Origin</th><th>Rev</th></tr>
            </thead>
            <tbody>
              {submission.files.map((f) => <ManifestRow key={f.path} file={f} />)}
            </tbody>
          </table>
        </div>
      </section>

      <div className="route-actions">
        <button className="primary-action" type="button" disabled={!canDownload} aria-disabled={!canDownload}>
          Download ZIP package
        </button>
        <Link className="text-link" href={`/opportunities/${encodeURIComponent(submission.proposalId)}`}>View opportunity</Link>
      </div>
      <p className="subline">ZIP entries use fixed timestamps and sorted order for reproducible verification. Paths with traversal are rejected.</p>
    </main>
  );
}
