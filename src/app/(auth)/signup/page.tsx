import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/layout/auth-screen";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <AuthScreen
      backHref="/welcome"
      title="Create your account"
      subtitle="It only takes a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-navy underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthScreen>
  );
}
