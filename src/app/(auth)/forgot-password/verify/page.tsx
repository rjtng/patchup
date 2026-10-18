import type { Metadata } from "next";
import { Suspense } from "react";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Enter your code" };

export default function ForgotPasswordVerifyPage() {
  return (
    <AuthScreen
      backHref="/forgot-password"
      title="Enter your code"
      subtitle="We sent a 6-digit code to your email."
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
