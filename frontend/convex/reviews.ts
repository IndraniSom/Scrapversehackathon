/**
 * Clause and evidence review queue.
 *
 * Handles assignment, reassignment, concurrent edits, stale revisions,
 * and reject/edit/confirm with required reasons. Resets review on
 * material document or clause changes and re-runs assessments after
 * acceptance.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { throwConflict, throwForbidden, throwNotFound, throwValidation } from "./lib/errors";

/**
 * Validates a reason for reject or material edit is non-blank.
 */
export function requireReason(reason: string | undefined): string {
  if (!reason || reason.trim().length < 8) throwValidation("Reason must be at least 8 characters.");
  return reason.trim();
}

/**
 * Asserts caller and target share the same organization.
 */
function assertTenant(taskOrg: string, callerOrg: string): void {
  if (taskOrg !== callerOrg) throwNotFound("Review not found.");
}

/**
 * Throws CONFLICT when expected revision differs from current.
 */
export function checkStale(current: number, expected?: number): void {
  if (expected !== undefined && current !== expected) throwConflict("Stale revision. Refresh and retry.");
}

/**
 * Restricts reviewer actions to org:admin or org:reviewer.
 */
function requireReviewer(role: string): void {
  if (role !== "org:admin" && role !== "org:reviewer" && role !== "org:bid_manager") throwForbidden();
}

/**
 * Lists review tasks for the organization with optional filters.
 */
export const listReviewTasks = query({
  args: {
    organizationId: v.string(),
    assigneeId: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    state: v.optional(v.union(v.literal("open"), v.literal("in_review"), v.literal("approved"), v.literal("rejected"))),
    dueBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("reviewTasks")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();
    return tasks.filter((t) => {
      if (args.assigneeId && t.assigneeId !== args.assigneeId) return false;
      if (args.priority && t.priority !== args.priority) return false;
      if (args.state && t.state !== args.state) return false;
      if (args.dueBefore && t.dueAt && t.dueAt > args.dueBefore) return false;
      return true;
    });
  },
});

/**
 * Gets a single review task after tenant check.
 */
export const getReviewTask = query({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    return task;
  },
});

/**
 * Assigns an unassigned task; checks stale revision and permission.
 */
export const assignReviewTask = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), assigneeId: v.string(), expectedRevision: v.optional(v.number()), actorRole: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.actorRole) requireReviewer(args.actorRole);
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    checkStale(task.createdAt, args.expectedRevision);
    if (task.assigneeId) throwConflict("Task already assigned.");
    await ctx.db.patch(args.taskId, { assigneeId: args.assigneeId, state: "in_review" });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.assigneeId, action: "review.assigned", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Reassigns an assigned task; only admin or bid_manager allowed.
 */
export const reassignReviewTask = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), assigneeId: v.string(), expectedRevision: v.optional(v.number()), actorRole: v.string() },
  handler: async (ctx, args) => {
    if (args.actorRole !== "org:admin" && args.actorRole !== "org:bid_manager") throwForbidden();
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    checkStale(task.createdAt, args.expectedRevision);
    if (!task.assigneeId) throwConflict("Task not yet assigned.");
    await ctx.db.patch(args.taskId, { assigneeId: args.assigneeId });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.assigneeId, action: "review.reassigned", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Confirms a clause and schedules assessment rerun.
 */
export const confirmReviewTask = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), expectedRevision: v.optional(v.number()), actorRole: v.optional(v.string()), actorId: v.string() },
  handler: async (ctx, args) => {
    if (args.actorRole) requireReviewer(args.actorRole);
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    checkStale(task.createdAt, args.expectedRevision);
    await ctx.db.patch(args.taskId, { state: "approved", decision: "confirmed" });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.actorId, action: "review.confirmed", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    await ctx.db.insert("jobs", { organizationId: args.organizationId, kind: "ASSESSMENT", status: "QUEUED", idempotencyKey: `${args.organizationId}:${task._id}:${Date.now()}`, inputRevision: String(task.createdAt), inputHashes: [], attempt: 0, maxAttempts: 3, requestedBy: args.actorId, traceId: String(task._id), createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Rejects a clause requiring a reason.
 */
export const rejectReviewTask = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), reason: v.string(), expectedRevision: v.optional(v.number()), actorId: v.string(), actorRole: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.actorRole) requireReviewer(args.actorRole);
    const reason = requireReason(args.reason);
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    checkStale(task.createdAt, args.expectedRevision);
    await ctx.db.patch(args.taskId, { state: "rejected", decision: reason });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.actorId, action: "review.rejected", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Edits a clause requiring a reason and resets approval.
 */
export const editReviewTask = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), reason: v.string(), patch: v.optional(v.string()), expectedRevision: v.optional(v.number()), actorId: v.string(), actorRole: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.actorRole) requireReviewer(args.actorRole);
    const reason = requireReason(args.reason);
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    checkStale(task.createdAt, args.expectedRevision);
    await ctx.db.patch(args.taskId, { state: "open", decision: reason });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.actorId, action: "review.edited", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});

/**
 * Resets review when clause, predicate, or page hash materially changes.
 */
export const resetReviewOnMaterialChange = mutation({
  args: { organizationId: v.string(), taskId: v.id("reviewTasks"), materialChanged: v.boolean(), actorId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throwNotFound();
    assertTenant(task.organizationId, args.organizationId);
    if (!args.materialChanged) return task;
    await ctx.db.patch(args.taskId, { state: "open", decision: undefined });
    await ctx.db.insert("auditEvents", { organizationId: args.organizationId, actorId: args.actorId ?? "system", action: "review.reset_material", targetType: "reviewTask", targetId: task._id, createdAt: Date.now() });
    return await ctx.db.get(args.taskId);
  },
});
