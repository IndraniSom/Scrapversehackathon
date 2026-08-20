import { z } from "zod";

import { dateTimeSchema, evidenceSpanSchema, evaluationSchema, type EvidenceSpan, type Evaluation } from "./common";

const moneySchema = z.string().regex(/^[0-9]+(?:\.[0-9]{1,2})?$/);

export const rulePredicateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("TURNOVER_AVERAGE"), required_financial_years: z.array(z.string().regex(/^[0-9]{4}-[0-9]{2}$/)).min(1), minimum_average_inr: moneySchema, audited_only: z.literal(true), legal_entity_scope: z.literal("BIDDER_ONLY") }),
  z.strictObject({ kind: z.literal("CERTIFICATION"), certificate_name: z.string().min(1), valid_at: dateTimeSchema }),
  z.strictObject({ kind: z.literal("PROJECT_EXPERIENCE"), value_basis: z.enum(["SINGLE_PROJECT", "EACH_OF_N_PROJECTS", "AGGREGATE_PROJECTS"]), required_count: z.number().int().min(1), minimum_value_inr: moneySchema, completion_requirement: z.literal("COMPLETED"), completed_from: z.iso.date().nullable(), completed_through: z.iso.date().nullable(), date_window_inclusive: z.literal(true) }),
  z.strictObject({ kind: z.literal("EMD"), amount_inr: moneySchema, exemption_available: z.boolean(), qualification_field: z.string().nullable() }),
  z.strictObject({ kind: z.literal("DEADLINE"), closes_at: dateTimeSchema, timezone: z.string().min(1), timezone_assumed: z.boolean() }),
]);

const applicabilitySchema = z.strictObject({
  field: z.string().min(1),
  operator: z.enum(["EQUALS", "IN", "EXISTS"]),
  expected_value: z.union([z.string(), z.boolean(), z.array(z.string()), z.null()]),
  evidence: evidenceSpanSchema,
});

const ruleLeafSchema = z.strictObject({
  node_type: z.literal("LEAF"),
  id: z.string().min(1),
  kind: z.enum(["TURNOVER_AVERAGE", "CERTIFICATION", "PROJECT_EXPERIENCE", "EMD", "DEADLINE"]),
  title: z.string().min(1),
  hardness: z.literal("HARD"),
  predicate: rulePredicateSchema,
  applicability: applicabilitySchema.nullable(),
  evidence: z.array(evidenceSpanSchema).min(1),
}).refine((value) => value.kind === value.predicate.kind, { message: "kind must match predicate", path: ["predicate", "kind"] });

export type RuleNode = z.infer<typeof ruleLeafSchema> | {
  node_type: "GROUP";
  id: string;
  operator: "ALL" | "ANY" | "AT_LEAST_N";
  minimum_matches: number | null;
  children: RuleNode[];
};

export const ruleNodeSchema: z.ZodType<RuleNode> = z.lazy(() => z.union([
  ruleLeafSchema,
  z.strictObject({
    node_type: z.literal("GROUP"),
    id: z.string().min(1),
    operator: z.enum(["ALL", "ANY", "AT_LEAST_N"]),
    minimum_matches: z.number().int().min(1).nullable(),
    children: z.array(ruleNodeSchema).min(1),
  }).superRefine((value, context) => {
    const validMinimum = value.operator === "AT_LEAST_N"
      ? value.minimum_matches !== null && value.minimum_matches <= value.children.length
      : value.minimum_matches === null;
    if (!validMinimum) context.addIssue({ code: "custom", message: "minimum_matches does not match operator", path: ["minimum_matches"] });
  }),
]));

export interface RuleResult {
  rule_id: string;
  title: string;
  evaluation: Evaluation;
  explanation: string;
  company_value: string | null;
  requirement_value: string | null;
  evidence: EvidenceSpan[];
  children: RuleResult[];
}

export const ruleResultSchema: z.ZodType<RuleResult> = z.lazy(() => z.strictObject({
  rule_id: z.string().min(1),
  title: z.string().min(1),
  evaluation: evaluationSchema,
  explanation: z.string().min(1),
  company_value: z.string().nullable(),
  requirement_value: z.string().nullable(),
  evidence: z.array(evidenceSpanSchema),
  children: z.array(ruleResultSchema),
}));
