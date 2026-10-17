import type { Metadata } from "next";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Enter your code" };

export default function ForgotPasswordVerifyPage() {
  return (
    <AuthScreen
      backHref="/forgot-password"
      title="Enter your code"
      subtitle="We sent a 6-digit code to your email or phone."
    >
      <VerifyCodeForm nextHref="/reset-password" submitLabel="Continue" />
    </AuthScreen>
  );
}
