import { z } from "zod";

import { dataModeSchema, documentVersionSchema, evidenceSpanSchema, recommendationSchema, requestIdSchema } from "./common";
import { opportunityIdSchema, opportunitySummarySchema } from "./opportunities";
import { companyProfileSchema } from "./profile";
import { ruleNodeSchema, rulePredicateSchema, ruleResultSchema } from "./rules";

const assessmentSchema = z.strictObject({
  document: documentVersionSchema,
  requirements: ruleNodeSchema.refine((value) => value.node_type === "GROUP"),
  recommendation: recommendationSchema,
  rule_results: z.array(ruleResultSchema).min(1),
  unknown_applicable_rule_count: z.number().int().min(0),
  failed_hard_rule_count: z.number().int().min(0),
});

export const assessmentEnvelopeSchema = z.strictObject({
  request_id: requestIdSchema,
  data: z.strictObject({
    opportunity: opportunitySummarySchema,
    company_profile: companyProfileSchema,
    base_assessment: assessmentSchema,
    amended_assessment: assessmentSchema,
    disclaimer: z.string().min(1),
  }),
});

const authorityStatementSchema = z.strictObject({
  actor: z.enum(["AUTHORITY", "BIDDER", "THIRD_PARTY"]),
  disposition: z.enum(["ACCEPTED", "REJECTED", "CLARIFIED", "UNCHANGED", "AMBIGUOUS"]),
  effective_change: z.boolean(),
  replaces_document_id: z.string().min(1).nullable(),
  evidence: evidenceSpanSchema,
}).superRefine((value, context) => {
  if (value.effective_change && (value.actor !== "AUTHORITY" || value.disposition !== "ACCEPTED" || value.replaces_document_id === null)) {
    context.addIssue({ code: "custom", message: "effective changes require accepted authority evidence" });
  }
});

const amendmentImpactSchema = z.strictObject({
  opportunity_id: opportunityIdSchema,
  data_mode: dataModeSchema,
  base_document: documentVersionSchema,
  amendment_document: documentVersionSchema,
  authority_statement: authorityStatementSchema,
  changed_rule_id: z.string().min(1),
  old_clause: evidenceSpanSchema,
  new_clause: evidenceSpanSchema,
  old_predicate: rulePredicateSchema,
  new_predicate: rulePredicateSchema,
  base_recommendation: recommendationSchema,
  amended_recommendation: recommendationSchema,
  authority_change_applied: z.boolean(),
  transition_reason: z.string().min(1),
}).superRefine((value, context) => {
  const changed = value.base_recommendation !== value.amended_recommendation;
  if (changed && !value.authority_change_applied) {
    context.addIssue({ code: "custom", message: "recommendation changes require authority_change_applied" });
  }
  if ((changed || value.authority_change_applied) && !value.authority_statement.effective_change) {
    context.addIssue({ code: "custom", message: "recommendation changes require effective authority evidence" });
  }
});

export const amendmentImpactEnvelopeSchema = z.strictObject({
  request_id: requestIdSchema,
  data: amendmentImpactSchema,
});

export type AssessmentEnvelope = z.infer<typeof assessmentEnvelopeSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type AmendmentImpactEnvelope = z.infer<typeof amendmentImpactEnvelopeSchema>;
export type AmendmentImpact = z.infer<typeof amendmentImpactSchema>;
