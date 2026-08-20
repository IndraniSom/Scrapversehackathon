import { z } from "zod";

import { dataModeSchema, dateTimeSchema, requestIdSchema, sha256Schema } from "./common";
import { opportunitySummarySchema } from "./opportunities";

const unavailableSourceProofSchema = z.strictObject({
  status: z.literal("UNAVAILABLE"),
  data_mode: z.literal("MANUAL_FIXTURE"),
  reason_code: z.enum(["NOT_CONFIGURED", "LEGAL_VERIFY_REQUIRED", "PROVIDER_UNAVAILABLE", "PROOF_NOT_CAPTURED"]),
  collector_name: z.null(),
  collector_config_version: z.null(),
  provider_run_id: z.null(),
  started_at: z.null(),
  completed_at: z.null(),
  raw_snapshot_sha256: z.null(),
  raw_record: z.null(),
  normalized_record: z.null(),
  terminal_state: z.null(),
  failure_code: z.null(),
});

const verifiedSourceProofSchema = z.strictObject({
  status: z.literal("VERIFIED"),
  data_mode: dataModeSchema.extract(["RECORDED_BRIGHT_DATA_SNAPSHOT"]),
  reason_code: z.null(),
  collector_name: z.string().min(1),
  collector_config_version: z.string().min(1),
  provider_run_id: z.string().min(1),
  started_at: dateTimeSchema,
  completed_at: dateTimeSchema,
  raw_snapshot_sha256: sha256Schema,
  raw_record: z.record(z.string(), z.unknown()),
  normalized_record: opportunitySummarySchema,
  terminal_state: z.literal("SUCCESS"),
  failure_code: z.null(),
});

export const sourceProofSchema = z.discriminatedUnion("status", [
  unavailableSourceProofSchema,
  verifiedSourceProofSchema,
]);

export const sourceProofEnvelopeSchema = z.strictObject({
  request_id: requestIdSchema,
  data: sourceProofSchema,
});

export type SourceProof = z.infer<typeof sourceProofSchema>;
export type SourceProofEnvelope = z.infer<typeof sourceProofEnvelopeSchema>;
