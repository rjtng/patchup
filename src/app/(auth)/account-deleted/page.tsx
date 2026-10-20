import type { Metadata } from "next";
import { AuthScreen } from "@/components/layout/auth-screen";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

// Where someone lands after deleting their account (signed out by then).
export default function AccountDeletedPage() {
  return (
    <AuthScreen title="Your account is deleted">
      <p className="text-sm leading-relaxed text-ink">
        We&apos;ve deleted your details, and you&apos;re logged out. Thanks for using PatchUp. You&apos;re welcome to
        sign up again any time.
      </p>
      <ButtonLink href="/welcome" className="mt-6">
        Back to start
      </ButtonLink>
    </AuthScreen>
  );
}
