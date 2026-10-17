import type { Metadata } from "next";
import { OnboardingCarousel } from "./onboarding-carousel";

export const metadata: Metadata = { title: "Welcome" };

export default function OnboardingPage() {
  return <OnboardingCarousel />;
}
