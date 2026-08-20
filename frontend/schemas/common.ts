import { z } from "zod";

export const requestIdSchema = z.uuid();
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const httpsUrlSchema = z.url().refine((value) => value.startsWith("https://"));
export const dateTimeSchema = z.iso.datetime({ offset: true });
export const dataModeSchema = z.enum(["LIVE", "RECORDED_BRIGHT_DATA_SNAPSHOT", "MANUAL_FIXTURE"]);
export const recommendationSchema = z.enum(["BID", "REVIEW", "NO_BID"]);
export const evaluationSchema = z.enum(["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE"]);
export const extractionStateSchema = z.enum(["PROPOSED", "EVIDENCE_VERIFIED", "INVALID"]);
export const reviewStateSchema = z.enum(["UNREVIEWED", "HUMAN_CONFIRMED", "HUMAN_REJECTED", "HUMAN_EDITED"]);

export const documentVersionSchema = z.strictObject({
  id: z.string().min(1),
  role: z.enum(["BASE_TENDER", "CORRIGENDUM", "CLARIFICATION", "PRE_BID_RESPONSE", "REPLACEMENT"]),
  source_url: httpsUrlSchema,
  sha256: sha256Schema,
  physical_page_count: z.number().int().min(1),
  text_quality: z.enum(["SUPPORTED", "NEEDS_OCR", "INVALID"]),
});

export const evidenceSpanSchema = z.strictObject({
  source_url: httpsUrlSchema,
  source_snapshot_sha256: sha256Schema,
  document_sha256: sha256Schema,
  document_version_id: z.string().min(1),
  physical_page_number: z.number().int().min(1),
  printed_page_label: z.string().nullable(),
  section_heading: z.string().min(1),
  excerpt: z.string().min(1).max(1200),
  normalized_page_text_sha256: sha256Schema,
  extraction_model: z.string().min(1),
  extraction_prompt_version: z.string().min(1),
  extraction_schema_version: z.string().min(1),
  extraction_state: extractionStateSchema,
  review_state: reviewStateSchema,
});

export type DataMode = z.infer<typeof dataModeSchema>;
export type DocumentVersion = z.infer<typeof documentVersionSchema>;
export type EvidenceSpan = z.infer<typeof evidenceSpanSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
