/** Bright Data trigger action and provider-state transitions. */
import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { throwValidation } from "./lib/errors";

const DEFAULT_INPUTS: Record<string, string> = {
  NTPC: "https://ntpctender.ntpc.co.in/Index/Search",
  CPPP: "https://www.eprocure.gov.in/epublish/app",
  WEST_BENGAL: "https://wbtenders.gov.in/nicgep/app?page=Web",
  ODISHA: "https://odisha.gov.in",
};

/** Loads bounded connector context for a source run. */
export const getCollectionContext = internalQuery({
  args: { runId: v.id("sourceRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) throwValidation("Source run not found.");
    const connector = await ctx.db.get(run.connectorId);
    if (connector === null || !connector.enabled) throwValidation("Connector unavailable.");
    return { connector };
  },
});

/** Persists provider start or safe failure. */
export const setProviderState = internalMutation({
  args: {
    runId: v.id("sourceRuns"),
    status: v.union(v.literal("running"), v.literal("failed"), v.literal("retryable")),
    providerRunId: v.optional(v.string()),
    failureCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: args.status,
      providerRunId: args.providerRunId,
      failureCode: args.failureCode,
      startedAt: Date.now(),
      completedAt: args.status === "running" ? undefined : Date.now(),
    });
  },
});

/** Calls Bright Data and stores its real collection identifier. */
export const startCollection = internalAction({
  args: { runId: v.id("sourceRuns") },
  handler: async (ctx, args) => {
    const { connector } = await ctx.runQuery(internal.sourceProvider.getCollectionContext, args);
    const token = process.env.BRIGHT_DATA_API_TOKEN;
    if (!token) {
      await ctx.runMutation(internal.sourceProvider.setProviderState, { ...args, status: "failed", failureCode: "PROVIDER_NOT_CONFIGURED" });
      return;
    }
    const response = await fetch(`https://api.brightdata.com/dca/trigger?collector=${encodeURIComponent(connector.collectorName)}&queue_next=1`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([{ url: DEFAULT_INPUTS[connector.portal] }]),
    });
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      await ctx.runMutation(internal.sourceProvider.setProviderState, { ...args, status: retryable ? "retryable" : "failed", failureCode: `PROVIDER_HTTP_${response.status}` });
      return;
    }
    const payload: unknown = await response.json();
    const providerRunId = typeof payload === "object" && payload !== null && "collection_id" in payload && typeof payload.collection_id === "string" ? payload.collection_id : null;
    if (providerRunId === null) {
      await ctx.runMutation(internal.sourceProvider.setProviderState, { ...args, status: "failed", failureCode: "PROVIDER_MALFORMED_RESPONSE" });
      return;
    }
    await ctx.runMutation(internal.sourceProvider.setProviderState, { ...args, status: "running", providerRunId });
  },
});
