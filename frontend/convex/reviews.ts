/** Tenant-bound clause and evidence review workflow. */
import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOrganization } from "./lib/authorization";
import { throwConflict, throwForbidden, throwNotFound, throwValidation } from "./lib/errors";

/** Requires meaningful reason for rejection or material edit. */
export function requireReason(reason: string | undefined): string {
  if (!reason || reason.trim().length < 8) throwValidation("Reason must be at least 8 characters.");
  return reason.trim();
}

/** Rejects stale optimistic-concurrency revision. */
export function checkStale(current: number, expected?: number): void {
  if (expected !== undefined && current !== expected) throwConflict("Stale revision. Refresh and retry.");
}

/** Restricts review decisions to reviewer roles. */
function requireReviewer(role: string): void {
  if (!["org:admin", "org:reviewer", "org:bid_manager"].includes(role)) throwForbidden("Reviewer permission required.");
}

/** Loads caller-owned task and checks expected revision. */
async function taskForUpdate(ctx: MutationCtx, taskId: Id<"reviewTasks">, expectedRevision?: number): Promise<Doc<"reviewTasks">> {
  const auth = await requireOrganization(ctx);
  const task = await ctx.db.get(taskId);
  if (task === null || task.organizationId !== auth.organizationId) throwNotFound("Review not found.");
  checkStale(task.updatedAt ?? task.createdAt, expectedRevision);
  return task;
}

/** Lists review tasks using authenticated tenant and optional filters. */
export const listReviewTasks = query({
  args: {
    assigneeId: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("medium"), v.literal("high"))),
    state: v.optional(v.union(v.literal("open"), v.literal("in_review"), v.literal("approved"), v.literal("rejected"))),
    dueBefore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const tasks = await ctx.db.query("reviewTasks").withIndex("by_organization", (index) => index.eq("organizationId", auth.organizationId)).collect();
    return tasks.filter((task) => (!args.assigneeId || task.assigneeId === args.assigneeId) && (!args.priority || task.priority === args.priority) && (!args.state || task.state === args.state) && (!args.dueBefore || !task.dueAt || task.dueAt <= args.dueBefore));
  },
});

/** Gets one caller-owned review task. */
export const getReviewTask = query({
  args: { taskId: v.id("reviewTasks") },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const task = await ctx.db.get(args.taskId);
    if (task === null || task.organizationId !== auth.organizationId) throwNotFound("Review not found.");
    return task;
  },
});

/** Assigns one unassigned task. */
export const assignReviewTask = mutation({
  args: { taskId: v.id("reviewTasks"), assigneeId: v.string(), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    requireReviewer(auth.role);
    const task = await taskForUpdate(ctx, args.taskId, args.expectedRevision);
    if (task.assigneeId) throwConflict("Task already assigned.");
    const updatedAt = Date.now();
    await ctx.db.patch(task._id, { assigneeId: args.assigneeId, state: "in_review", updatedAt });
    return { taskId: task._id, updatedAt };
  },
});

/** Reassigns task as admin or bid manager. */
export const reassignReviewTask = mutation({
  args: { taskId: v.id("reviewTasks"), assigneeId: v.string(), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (auth.role !== "org:admin" && auth.role !== "org:bid_manager") throwForbidden();
    const task = await taskForUpdate(ctx, args.taskId, args.expectedRevision);
    if (!task.assigneeId) throwConflict("Task not yet assigned.");
    const updatedAt = Date.now();
    await ctx.db.patch(task._id, { assigneeId: args.assigneeId, updatedAt });
    return { taskId: task._id, updatedAt };
  },
});

/** Confirms reviewed clause and queues deterministic reassessment. */
export const confirmReviewTask = mutation({
  args: { taskId: v.id("reviewTasks"), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    requireReviewer(auth.role);
    const task = await taskForUpdate(ctx, args.taskId, args.expectedRevision);
    const updatedAt = Date.now();
    await ctx.db.patch(task._id, { state: "approved", decision: "confirmed", updatedAt });
    await ctx.db.insert("jobs", { organizationId: auth.organizationId, kind: "ASSESSMENT", status: "QUEUED", idempotencyKey: `${auth.organizationId}:${task._id}:confirm:${updatedAt}`, inputRevision: String(updatedAt), inputHashes: [String(task._id)], attempt: 0, maxAttempts: 3, requestedBy: auth.clerkUserId, traceId: String(task._id), createdAt: updatedAt });
    return { taskId: task._id, updatedAt };
  },
});

/** Rejects reviewed clause with required reason. */
export const rejectReviewTask = mutation({
  args: { taskId: v.id("reviewTasks"), reason: v.string(), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    requireReviewer(auth.role);
    const task = await taskForUpdate(ctx, args.taskId, args.expectedRevision);
    const updatedAt = Date.now();
    await ctx.db.patch(task._id, { state: "rejected", decision: requireReason(args.reason), updatedAt });
    return { taskId: task._id, updatedAt };
  },
});

/** Records material edit and resets review state. */
export const editReviewTask = mutation({
  args: { taskId: v.id("reviewTasks"), reason: v.string(), patch: v.optional(v.string()), expectedRevision: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    requireReviewer(auth.role);
    const task = await taskForUpdate(ctx, args.taskId, args.expectedRevision);
    const updatedAt = Date.now();
    await ctx.db.patch(task._id, { state: "open", decision: requireReason(args.reason), updatedAt });
    return { taskId: task._id, updatedAt, patchAccepted: args.patch !== undefined };
  },
});

/** Resets a review after trusted material document change. */
export const resetReviewOnMaterialChange = internalMutation({
  args: { taskId: v.id("reviewTasks"), materialChanged: v.boolean() },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (task === null || !args.materialChanged) return task;
    await ctx.db.patch(task._id, { state: "open", decision: undefined, updatedAt: Date.now() });
    return ctx.db.get(task._id);
  },
});
