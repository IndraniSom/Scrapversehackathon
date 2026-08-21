/** Clerk-hosted sign-in route for production sessions. */
import { SignIn } from "@clerk/nextjs";

/** Renders email and Google authentication configured in Clerk. */
export default function SignInPage() {
  return <main id="main-content" className="page-shell"><SignIn /></main>;
}
