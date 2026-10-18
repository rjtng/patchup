import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Check your email" };

export default function ForgotPasswordVerifyPage() {
  return (
    <AuthScreen
      backHref="/forgot-password"
      title="Check your email"
      subtitle="Tap the link in the email we sent you, or enter its 6-digit code."
    >
      <Suspense>
        <VerifyCodeForm
          purpose="recovery"
          nextHref="/reset-password"
          restartHref="/forgot-password"
          submitLabel="Continue"
        />
      </Suspense>
    </AuthScreen>
  );
}
