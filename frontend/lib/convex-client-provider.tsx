/** Clerk and Convex providers with explicit configuration boundaries. */
"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const isE2eMode = process.env.NEXT_PUBLIC_BIDRADAR_E2E_MODE === "1";

const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Binds Convex requests to the authenticated Clerk session. */
function ConvexWithClerk({ children }: { children: ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

/** Provides authenticated Convex access or the isolated E2E test tree. */
export function ConvexClientProvider({ children, clerkConfigured }: { children: ReactNode; clerkConfigured: boolean }) {
  if (isE2eMode && convexClient !== null) return <ConvexProvider client={convexClient}>{children}</ConvexProvider>;
  if (!clerkConfigured || convexClient === null) return <>{children}</>;
  return <ConvexWithClerk>{children}</ConvexWithClerk>;
}
