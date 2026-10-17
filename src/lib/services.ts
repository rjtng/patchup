import {
  Drill,
  Ellipsis,
  Hammer,
  PaintRoller,
  PlugZap,
  ShowerHead,
  SprayCan,
  Toolbox,
  type LucideIcon,
} from "lucide-react";

export type ServiceCategory = {
  slug: string;
  name: string;
  icon: LucideIcon;
};

// The service categories from the Figma Home screen.
// TODO: load these from the database once Supabase is connected.
export const serviceCategories: ServiceCategory[] = [
  { slug: "plumbing", name: "Plumbing", icon: ShowerHead },
  { slug: "repairing", name: "Repairing", icon: Drill },
  { slug: "electrical", name: "Electrical", icon: PlugZap },
  { slug: "carpentry", name: "Carpentry", icon: Hammer },
  { slug: "cleaning", name: "Cleaning", icon: SprayCan },
  { slug: "painting", name: "Painting", icon: PaintRoller },
  { slug: "handyman", name: "Handyman", icon: Toolbox },
  { slug: "more", name: "More", icon: Ellipsis },
];

export function getCategory(slug: string) {
  return serviceCategories.find((c) => c.slug === slug);
}
