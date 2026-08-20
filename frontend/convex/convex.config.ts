/**
 * Convex deployment configuration for BidRadar.
 *
 * Declares typed environment variables and installs durable workflow
 * components used across the platform.
 */
import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";
import { v } from "convex/values";

/**
 * Application definition with typed env and component wiring.
 *
 * Uses Workflow for durable orchestration, Workpool for bounded
 * concurrency, and Rate Limiter for abuse controls.
 */
const app = defineApp({
  env: {
    CLERK_JWT_ISSUER_DOMAIN: v.optional(v.string()),
    CONVEX_DEPLOYMENT: v.optional(v.string()),
    BRIGHT_DATA_API_TOKEN: v.optional(v.string()),
    DEEPSEEK_API_KEY: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
  },
});

app.use(workflow);
app.use(workpool);
app.use(rateLimiter);

export default app;
