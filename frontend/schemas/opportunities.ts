import { z } from "zod";

import { dataModeSchema, dateTimeSchema, httpsUrlSchema, requestIdSchema, sha256Schema } from "./common";

export const opportunitySummarySchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(["CPPP", "WEST_BENGAL", "NTPC"]),
  source_tender_id: z.string().min(1),
  reference_number: z.string().nullable(),
  authority: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["CLOUD", "CYBERSECURITY", "SOFTWARE", "DATA_CENTER", "MANAGED_IT", "NETWORKING", "ERP", "DEVOPS", "OTHER"]),
  published_at: dateTimeSchema.nullable(),
  closes_at: dateTimeSchema.nullable(),
  canonical_url: httpsUrlSchema,
  data_mode: dataModeSchema,
  snapshot_sha256: sha256Schema,
});

export const opportunityListEnvelopeSchema = z.strictObject({
  request_id: requestIdSchema,
  data: z.strictObject({
    items: z.array(opportunitySummarySchema),
    total: z.number().int().min(0),
    generated_at: dateTimeSchema,
  }),
});

export type OpportunitySummary = z.infer<typeof opportunitySummarySchema>;
export type OpportunityListEnvelope = z.infer<typeof opportunityListEnvelopeSchema>;
