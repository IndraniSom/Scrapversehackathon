/** Clerk and Convex providers with explicit configuration boundaries. */
"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

/** Binds Convex requests to the authenticated Clerk session. */
function ConvexWithClerk({ children }: { children: ReactNode }) {
  if (convexClient === null) return <>{children}</>;
  return <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

/** Provides authenticated Convex access or the explicit offline demo tree. */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!clerkKey || convexClient === null) return <>{children}</>;
  return <ConvexWithClerk>{children}</ConvexWithClerk>;
}
