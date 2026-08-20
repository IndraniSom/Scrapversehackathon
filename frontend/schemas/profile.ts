import { z } from "zod";

export const companyProfileSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  bidder_legal_entity_id: z.string().min(1).nullable(),
  turnover_evidence: z.array(z.strictObject({
    financial_year: z.string().regex(/^[0-9]{4}-[0-9]{2}$/),
    amount_inr: z.string().regex(/^[0-9]+(?:\.[0-9]{1,2})?$/),
    audited: z.boolean(),
    legal_entity_id: z.string().min(1).nullable(),
    evidence_reference: z.string().nullable(),
  })),
  certifications: z.array(z.strictObject({
    name: z.string().min(1),
    valid_from: z.iso.date().nullable(),
    valid_until: z.iso.date().nullable(),
    evidence_reference: z.string().nullable(),
  })),
  projects: z.array(z.strictObject({
    id: z.string().min(1),
    title: z.string().min(1),
    client: z.string().min(1),
    value_inr: z.string().regex(/^[0-9]+(?:\.[0-9]{1,2})?$/),
    completion_state: z.enum(["COMPLETED", "IN_PROGRESS", "UNKNOWN"]),
    completed_at: z.iso.date().nullable(),
    similar_work_confirmed: z.boolean().nullable(),
    evidence_reference: z.string().nullable(),
  })),
  emd_exemptions: z.array(z.strictObject({
    scheme: z.string().min(1),
    qualified: z.boolean().nullable(),
    evidence_reference: z.string().nullable(),
  })),
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;
