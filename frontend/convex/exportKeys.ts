/** Internal API-key lookup for the unauthenticated HTTP export endpoint. */
import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { constantTimeEqual } from "./lib/keyComparison";

/** Finds the organization belonging to a matching active API-key hash. */
export const findActiveApiKey = internalQuery({
  args: { hash: v.string() },
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("integrationConnections")
      .filter((query) => query.eq(query.field("state"), "active"))
      .collect();
    const connection = connections.find((candidate) =>
      candidate.provider === "api_key" && candidate.scopes?.some((storedHash) => constantTimeEqual(args.hash, storedHash)),
    );
    return connection === undefined ? null : { organizationId: connection.organizationId };
  },
});
