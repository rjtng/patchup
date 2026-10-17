import type { Metadata } from "next";
import { AuthScreen } from "@/components/layout/auth-screen";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <AuthScreen
      backHref="/login"
      title="Set a new password"
      subtitle="Choose a password you haven't used before."
    >
      <ResetPasswordForm />
    </AuthScreen>
  );
}
