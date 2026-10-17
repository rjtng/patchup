import type { Metadata } from "next";
import { VerifyCodeForm } from "@/components/auth/verify-code-form";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Verify your account" };

export default function SignupVerifyPage() {
  return (
    <AuthScreen
      backHref="/signup"
      title="Verify your account"
      subtitle="Enter the 6-digit code we sent to your email or phone."
    >
      <VerifyCodeForm nextHref="/home" submitLabel="Verify and continue" />
    </AuthScreen>
  );
}
