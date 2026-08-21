/** Protects product routes and fails closed when Clerk is not configured. */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const isE2eMode = process.env.BIDRADAR_E2E_MODE === "1";
const hasClerkConfiguration = Boolean(process.env.CLERK_SECRET_KEY && (process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY));
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/opportunities(.*)", "/companies(.*)", "/reviews(.*)", "/watchlist(.*)", "/alerts(.*)", "/content-library(.*)", "/proposals(.*)", "/submissions(.*)", "/reports(.*)", "/integrations(.*)", "/settings(.*)", "/onboarding(.*)"]);
const protectedProxy = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request) && isProtectedRoute(request)) await auth.protect();
});

/** Applies Clerk protection or rejects protected traffic lacking required setup. */
export default function proxy(request: NextRequest, event: Parameters<typeof protectedProxy>[1]) {
  if (isE2eMode) return NextResponse.next();
  if (!hasClerkConfiguration && isPublicRoute(request)) return NextResponse.next();
  if (!hasClerkConfiguration) return new NextResponse("Authentication configuration is unavailable.", { status: 503 });
  return protectedProxy(request, event);
}

export const config = { matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)", "/__clerk/:path*"] };
