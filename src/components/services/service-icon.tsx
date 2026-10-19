import {
  AirVent,
  Bath,
  BrickWall,
  Bug,
  Cctv,
  CookingPot,
  DoorOpen,
  Drill,
  Droplets,
  Fan,
  Flame,
  Hammer,
  KeyRound,
  Lightbulb,
  Microwave,
  PaintRoller,
  PlugZap,
  Refrigerator,
  ShowerHead,
  Sofa,
  SprayCan,
  Sprout,
  Toolbox,
  Truck,
  Tv,
  WashingMachine,
  Wifi,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// The icons a service can have, by the name in service_categories.icon.
const ICONS: Record<string, LucideIcon> = {
  "air-vent": AirVent,
  bath: Bath,
  "brick-wall": BrickWall,
  bug: Bug,
  cctv: Cctv,
  "cooking-pot": CookingPot,
  "door-open": DoorOpen,
  drill: Drill,
  droplets: Droplets,
  fan: Fan,
  flame: Flame,
  hammer: Hammer,
  "key-round": KeyRound,
  lightbulb: Lightbulb,
  microwave: Microwave,
  "paint-roller": PaintRoller,
  "plug-zap": PlugZap,
  refrigerator: Refrigerator,
  "shower-head": ShowerHead,
  sofa: Sofa,
  "spray-can": SprayCan,
  sprout: Sprout,
  toolbox: Toolbox,
  truck: Truck,
  tv: Tv,
  "washing-machine": WashingMachine,
  wifi: Wifi,
  wrench: Wrench,
};

/** The icons a service can have, by name ("air-vent"), in the order Admin offers them. */
export const SERVICE_ICON_NAMES = Object.keys(ICONS);

/** "air-vent" -> "Air vent" */
export const iconLabel = (name: string) => (name.charAt(0).toUpperCase() + name.slice(1)).replaceAll("-", " ");

/** A service's icon, by its name; one the app doesn't have shows a wrench. */
export function ServiceIcon({ name, ...props }: LucideProps & { name: string }) {
  const Icon = ICONS[name] ?? Wrench;
  return <Icon aria-hidden {...props} />;
}
