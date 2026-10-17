import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/layout/auth-screen";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthScreen
      backHref="/login"
      title="Forgot your password?"
      subtitle="No worries. We'll send you a code to reset it."
      footer={
        <Link href="/login" className="font-semibold text-brand-navy underline-offset-4 hover:underline">
          Back to log in
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthScreen>
  );
}
