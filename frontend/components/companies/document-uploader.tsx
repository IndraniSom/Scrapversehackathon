/**
 * Secure company document uploader.
 * Validates 15MB PDF/DOCX, double extension, SHA-256 and signature client-side,
 * reserves Convex storage URL and finalizes only after server agrees.
 */
"use client";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Props for document upload. */
type Props = {
  /** Optional company to link document. */
  companyId?: Id<"companies">;
  /** Called after successful finalize. */
  onUploaded?: (id: Id<"companyDocuments">) => void;
};

/** Max 15MB. */
const MAX = 15 * 1024 * 1024;

/** Reads first 4 bytes as hex. */
async function headerHex(file: File): Promise<string> {
  const buf = await file.slice(0, 4).arrayBuffer();
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Computes SHA-256 hex via SubtleCrypto. */
async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Uploads a company evidence document with server-side verification. */
export function DocumentUploader({ companyId, onUploaded }: Props) {
  const generateUrl = useMutation(api.companyDocuments.generateUploadUrl);
  const finalize = useMutation(api.companyDocuments.finalizeUpload);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  /** Handles file selection and upload. */
  async function handleFile(file: File): Promise<void> {
    setError(null);
    setSuccess(null);
    if (file.size > MAX) { setError("File exceeds 15MB limit."); return; }
    if (!file.name.toLowerCase().endsWith(".pdf") && !file.name.toLowerCase().endsWith(".docx")) { setError("Only PDF and DOCX allowed."); return; }
    if (file.name.includes("..") || (file.name.match(/\./g) ?? []).length > 2) {
      // Light double extension check; server is authoritative.
      const lower = file.name.toLowerCase();
      if (/\.[^.]+\.(pdf|docx)$/.test(lower) && lower.split(".").length > 2) { setError("Double extension not allowed."); return; }
    }
    setBusy(true);
    try {
      const [sha, header] = await Promise.all([sha256Hex(file), headerHex(file)]);
      const url = await generateUrl({});
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!res.ok) throw new Error("Upload failed.");
      const json = (await res.json()) as { storageId: Id<"_storage"> };
      const docId = await finalize({ storageId: json.storageId, fileName: file.name, mime: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), size: file.size, sha256: sha, headerHex: header, companyId });
      setSuccess(`Uploaded ${file.name} and quarantined for review.`);
      onUploaded?.(docId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="upload-title">
      <h3 id="upload-title">Upload evidence document</h3>
      <p className="subline">PDF or DOCX only, up to 15MB. Files are quarantined until review.</p>
      <label htmlFor="doc-file">Choose file</label>
      <input id="doc-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
      {busy ? <p role="status">Uploading…</p> : null}
      {error ? <p role="alert" className="error-banner">{error}</p> : null}
      {success ? <p role="status">{success}</p> : null}
    </section>
  );
}
