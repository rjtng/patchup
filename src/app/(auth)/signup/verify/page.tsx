import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Verify your account" };

export default function SignupVerifyPage() {
  return (
    <AuthScreen
      backHref="/signup"
      title="Verify your account"
      subtitle="Tap the link in the email we sent you, or enter its 6-digit code."
    >
      <Suspense>
        <VerifyCodeForm purpose="signup" nextHref="/home" restartHref="/signup" submitLabel="Verify and continue" />
      </Suspense>
    </AuthScreen>
  );
}
