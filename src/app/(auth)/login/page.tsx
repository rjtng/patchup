import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthNotice } from "@/components/auth/auth-notice";
import { AuthScreen } from "@/components/layout/auth-screen";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <AuthScreen
      backHref="/welcome"
      title="Welcome back"
      subtitle="Log in to book and track your repairs."
      footer={
        <>
          New to PatchUp?{" "}
          <Link href="/signup" className="font-semibold text-brand-navy underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense>
        <AuthNotice />
      </Suspense>
      <LoginForm />
    </AuthScreen>
  );
}
