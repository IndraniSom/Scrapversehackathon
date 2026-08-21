/** Clerk JWT configuration with an explicit offline demo exception. */
import type { AuthConfig } from "convex/server";

const isDemoMode = process.env.BIDRADAR_DEMO_MODE === "1";
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!isDemoMode && !issuerDomain) throw new Error("CLERK_JWT_ISSUER_DOMAIN is required outside demo mode.");

/** Configures Clerk only when a production issuer is available. */
const authConfig: AuthConfig = { providers: issuerDomain ? [{ domain: issuerDomain, applicationID: "convex" }] : [] };

export default authConfig;
