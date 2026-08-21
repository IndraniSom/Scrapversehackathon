/** Clerk-hosted sign-up route with automatic organization creation. */
import { SignUp } from "@clerk/nextjs";

/** Renders production account creation through configured Clerk methods. */
export default function SignUpPage() {
  return <main id="main-content" className="page-shell"><SignUp /></main>;
}
