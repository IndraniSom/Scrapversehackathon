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

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** No-op when Clerk keys are absent for local deterministic demo. */
async function noopMiddleware(): Promise<void> {
  return;
}

export default hasClerkKeys
  ? clerkMiddleware(async (auth, req) => {
      if (isPublicRoute(req)) return;
      if (isProtectedRoute(req)) await auth.protect();
    })
  : (noopMiddleware as unknown as ReturnType<typeof clerkMiddleware>);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
