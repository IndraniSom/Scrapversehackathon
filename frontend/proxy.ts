/**
 * Route protection via Clerk middleware (Next.js proxy).
 *
 * Protects product routes, allows public landing and sign-in.
 * Falls back to allow when Clerk keys are absent for local dev.
 */
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)"]);
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/opportunities(.*)",
  "/companies(.*)",
  "/reviews(.*)",
  "/watchlist(.*)",
  "/alerts(.*)",
  "/content-library(.*)",
  "/proposals(.*)",
  "/submissions(.*)",
  "/settings(.*)",
  "/onboarding(.*)",
  "/(product)(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!process.env.CLERK_SECRET_KEY && !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return;
  if (isPublicRoute(req)) return;
  if (isProtectedRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
