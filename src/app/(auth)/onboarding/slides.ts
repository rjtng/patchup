import { CalendarClock, MapPinned, Wrench, type LucideIcon } from "lucide-react";

export type Slide = {
  title: string;
  body: string;
  icon: LucideIcon;
  /**
   * Optional photo. Export the onboarding photos from Figma into
   * public/onboarding/ and set e.g. image: "/onboarding/repair.jpg".
   */
  image?: string;
  imageAlt?: string;
};

export const slides: Slide[] = [
  {
    title: "Find trusted repair services",
    body: "From leaky faucets to flickering lights, PatchUp connects you with reliable repair pros in just a few taps.",
    icon: Wrench,
  },
  {
    title: "Convenient scheduling",
    body: "Pick the date and time that suits you. Your technician arrives when you need them, with no waiting around all day.",
    icon: CalendarClock,
  },
  {
    title: "Track and review",
    body: "Follow your technician on the way, then rate the job so everyone keeps getting top-notch service.",
    icon: MapPinned,
  },
];
