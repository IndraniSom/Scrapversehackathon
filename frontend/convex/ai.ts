/**
 * AI run tracking with model/prompt hashes, token usage, and feedback.
 *
 * Every AI output is a proposal until deterministic validation
 * or an authorized reviewer accepts it.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization, requirePermission } from "./lib/authorization";
import { throwValidation } from "./lib/errors";

/**
 * Returns a deterministic hex hash for a model or prompt identifier.
 * Uses a simple djb2-style loop to avoid importing node crypto in Convex.
 */
export function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

/**
 * Returns model and prompt hashes for a run.
 * Both are derived deterministically from the supplied identifiers.
 */
export function deriveHashes(model: string, promptVersion: string): { modelHash: string; promptHash: string } {
  return { modelHash: hashString(model), promptHash: hashString(promptVersion) };
}

/**
 * Validates token usage is non-negative and bounded.
 * @throws Validation error when tokens are invalid.
 */
export function validateTokens(tokens?: { input: number; output: number }): void {
  if (!tokens) return;
  if (!Number.isFinite(tokens.input) || !Number.isFinite(tokens.output)) throwValidation("Tokens must be finite numbers");
  if (tokens.input < 0 || tokens.output < 0) throwValidation("Tokens must be non-negative");
  if (tokens.input > 200000 || tokens.output > 200000) throwValidation("Tokens exceed limit");
}

/**
 * Records one AI run with hashes, token usage, and outcome.
 * Tenant-isolated and auditable.
 */
export const recordAiRun = mutation({
  args: {
    feature: v.union(
      v.literal("PROPOSAL_DRAFT"),
      v.literal("CLAIM_REVIEW"),
      v.literal("REVIEW_COPILOT"),
      v.literal("TENDER_QA"),
      v.literal("TENDER_BRIEF"),
    ),
    model: v.string(),
    promptVersion: v.string(),
    schemaVersion: v.string(),
    inputHashes: v.array(v.string()),
    tokens: v.optional(v.object({ input: v.number(), output: v.number() })),
    cost: v.optional(v.number()),
    outcome: v.union(v.literal("success"), v.literal("failure")),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!args.model.trim() || !args.promptVersion.trim()) throwValidation("Model and promptVersion are required");
    if (!args.schemaVersion.trim()) throwValidation("schemaVersion is required");
    if (args.inputHashes.length === 0) throwValidation("inputHashes must include at least one source hash");
    if (args.inputHashes.some((h) => h.length < 8)) throwValidation("inputHashes must be valid hashes");
    validateTokens(args.tokens ?? undefined);
    if (args.cost !== undefined && (args.cost < 0 || !Number.isFinite(args.cost))) throwValidation("Cost must be non-negative");
    const hashes = deriveHashes(args.model, args.promptVersion);
    const now = Date.now();
    const id = await ctx.db.insert("aiRuns", {
      organizationId: auth.organizationId,
      feature: args.feature,
      model: args.model,
      promptVersion: args.promptVersion,
      schemaVersion: args.schemaVersion,
      inputHashes: args.inputHashes,
      tokens: args.tokens,
      cost: args.cost,
      outcome: args.outcome,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      organizationId: auth.organizationId,
      actorId: auth.clerkUserId,
      action: "ai_run.recorded",
      targetType: "aiRuns",
      targetId: String(id),
      traceId: `${hashes.modelHash}:${hashes.promptHash}`,
      createdAt: now,
    });
    return { id, modelHash: hashes.modelHash, promptHash: hashes.promptHash };
  },
});

/** Lists AI runs for the active organization newest first. */
export const listAiRuns = query({
  args: { feature: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db
      .query("aiRuns")
      .withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId))
      .collect();
    const filtered = args.feature ? rows.filter((r) => r.feature === args.feature) : rows;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).map((r) => ({ ...r, hashes: deriveHashes(r.model, r.promptVersion) }));
  },
});

/**
 * Records reviewer feedback for one AI output.
 * Stores accepted, rejected, or edited decision and category.
 */
export const recordAiFeedback = mutation({
  args: {
    outputId: v.string(),
    userDecision: v.union(v.literal("accepted"), v.literal("rejected"), v.literal("edited")),
    correctionCategory: v.optional(v.string()),
    acceptedRevision: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!args.outputId.trim()) throwValidation("outputId is required");
    const run = await ctx.db
      .query("aiRuns")
      .withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId))
      .collect()
      .then((rows) => rows.find((r) => String(r._id) === args.outputId));
    if (args.correctionCategory && args.correctionCategory.length > 100) throwValidation("correctionCategory too long");
    if (args.acceptedRevision && args.acceptedRevision.length > 5000) throwValidation("acceptedRevision too long");
    const now = Date.now();
    const id = await ctx.db.insert("aiFeedback", {
      organizationId: auth.organizationId,
      outputId: args.outputId,
      userDecision: args.userDecision,
      correctionCategory: args.correctionCategory,
      acceptedRevision: args.acceptedRevision,
      createdAt: now,
    });
    await ctx.db.insert("auditEvents", {
      organizationId: auth.organizationId,
      actorId: auth.clerkUserId,
      action: "ai_feedback.recorded",
      targetType: "aiFeedback",
      targetId: String(id),
      traceId: String(id),
      createdAt: now,
    });
    return { id, outputId: args.outputId, hashes: run ? deriveHashes(run.model, run.promptVersion) : null };
  },
});

/** Lists feedback for the active organization. */
export const listAiFeedback = query({
  args: { outputId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const rows = await ctx.db.query("aiFeedback").withIndex("by_organization", (q) => q.eq("organizationId", auth.organizationId)).collect();
    return args.outputId ? rows.filter((r) => r.outputId === args.outputId) : rows;
  },
});
/** Allowed models for AI features. */
export const ALLOWED_MODELS = ["deepseek-v4-flash", "deepseek-v4-pro"] as const;
/** Allowed AI feature identifiers. */
export const AI_FEATURES = ["extraction", "citations", "qa", "compliance", "claims", "amendment_mapping"] as const;
/** Per-scope rate limits for token usage. */
export const RATE_LIMITS = { perUser: 10, perOrg: 100, perGlobal: 1000 } as const;
/** Returns true when model is in governance allowlist. */
export function isModelAllowed(m: string): boolean { return (ALLOWED_MODELS as readonly string[]).includes(m); }
/** Returns true when feature is enabled and not kill-switched. */
export function isFeatureEnabled(f: string, s: Record<string, boolean> = {}): boolean { if (!(AI_FEATURES as readonly string[]).includes(f)) return false; return !s[f]; }
/** Checks per-user/org/global rate limits with retry hint. */
export function checkRateLimit(c: { perUser: number; perOrg: number; perGlobal: number }): { allowed: boolean; retryAfterMs: number; limited?: string } { if (c.perUser >= RATE_LIMITS.perUser) return { allowed: false, retryAfterMs: 60000, limited: "perUser" }; if (c.perOrg >= RATE_LIMITS.perOrg) return { allowed: false, retryAfterMs: 60000, limited: "perOrg" }; if (c.perGlobal >= RATE_LIMITS.perGlobal) return { allowed: false, retryAfterMs: 60000, limited: "perGlobal" }; return { allowed: true, retryAfterMs: 0 }; }
/** Estimates cost from token counts without storing prompts. */
export function estimateCost(input: number, output: number): number { return Math.round((input / 1000 * 0.001 + output / 1000 * 0.002) * 1e6) / 1e6; }
/** Computes schema validity, precision, recall, and hard-clause/cross-tenant failures. */
export function computeMetrics(cases: { expectedCitedIds: string[]; hardClause?: boolean }[], outputs: { schema_valid?: boolean; cited_ids?: string[]; unsupported_claim?: boolean; cross_tenant?: boolean }[]): { schemaValidity: number; precision: number; recall: number; unsupportedHard: number; crossTenant: number } { const n = Math.max(1, cases.length); const valid = outputs.filter((o) => o.schema_valid).length; let tp = 0, fp = 0, fn = 0, hard = 0, cross = 0; cases.forEach((c, i) => { const o = outputs[i] ?? {}; const exp = new Set(c.expectedCitedIds ?? []); const got = new Set(o.cited_ids ?? []); tp += [...got].filter((x) => exp.has(x)).length; fp += [...got].filter((x) => !exp.has(x)).length; fn += [...exp].filter((x) => !got.has(x)).length; if (c.hardClause && o.unsupported_claim) hard++; if (o.cross_tenant) cross++; }); return { schemaValidity: valid / n, precision: tp / Math.max(1, tp + fp), recall: tp / Math.max(1, tp + fn), unsupportedHard: hard, crossTenant: cross }; }
/** Gates production enablement: zero hard unsupported and zero cross-tenant. */
export function checkGate(m: { schemaValidity: number; unsupportedHard: number; crossTenant: number }): { enabled: boolean; blocked: string[] } { const b: string[] = []; if (m.unsupportedHard !== 0) b.push("unsupported_hard_clause"); if (m.crossTenant !== 0) b.push("cross_tenant_retrieval"); if (m.schemaValidity < 1) b.push("schema_validity"); return { enabled: b.length === 0, blocked: b }; }
/** Returns governance config for the active organization. */
export const getGovernance = query({ args: {}, handler: async (ctx) => { const a = await requireOrganization(ctx); const settings = await ctx.db.query("aiFeatureSettings").withIndex("by_organization", (q) => q.eq("organizationId", a.organizationId)).collect(); return { organizationId: a.organizationId, features: [...AI_FEATURES], models: [...ALLOWED_MODELS], limits: RATE_LIMITS, kills: Object.fromEntries(settings.map((setting) => [setting.feature, setting.disabled])) }; } });
/** Toggles a kill switch for a feature (admin only). */
export const setKillSwitch = mutation({ args: { feature: v.string(), disabled: v.boolean() }, handler: async (ctx, args) => { const auth = await requirePermission(ctx, "org:admin"); if (!(AI_FEATURES as readonly string[]).includes(args.feature)) throwValidation("Unknown feature."); const existing = await ctx.db.query("aiFeatureSettings").withIndex("by_organization_and_id", (q) => q.eq("organizationId", auth.organizationId).eq("feature", args.feature)).unique(); const value = { disabled: args.disabled, updatedAt: Date.now() }; if (existing) await ctx.db.patch(existing._id, value); else await ctx.db.insert("aiFeatureSettings", { organizationId: auth.organizationId, feature: args.feature, ...value }); return { feature: args.feature, disabled: args.disabled }; } });
/** Checks rate limits for the caller without mutating state. */
export const checkLimits = query({ args: { perUser: v.number(), perOrg: v.number(), perGlobal: v.number() }, handler: async (ctx, args) => { await requireOrganization(ctx); return checkRateLimit(args); } });
