import type { Metadata } from "next";
import { AuthScreen } from "@/components/layout/auth-screen";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <AuthScreen backHref="/signup" title="Privacy Policy">
      {/* TODO: replace with PatchUp's actual privacy policy before launch. */}
      <p className="text-muted">Our privacy policy will be published here before launch.</p>
    </AuthScreen>
  );
}
