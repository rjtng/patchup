import type { Metadata } from "next";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <AuthScreen backHref="/signup" title="Terms of Service">
      {/* TODO: replace with PatchUp's actual terms before launch. */}
      <p className="text-muted">Our terms of service will be published here before launch.</p>
    </AuthScreen>
  );
}
