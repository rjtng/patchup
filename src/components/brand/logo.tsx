import { useId } from "react";
import { cn } from "@/lib/cn";

/*
 * PatchUp mark: a gear with a wrench through it, drawn as plain SVG so it stays
 * sharp at any size. To use the exact logo from Figma instead, export it as SVG
 * (select the logo → Export → SVG) and swap it into public/logo.svg.
 */

const TEETH = 8;
const OUTER = 46;
const ROOT = 37;
const HOLE = 19;

function gearPath() {
  const pts: string[] = [];
  const step = (Math.PI * 2) / TEETH;
  const halfRoot = step * 0.3;
  const halfTip = step * 0.2;
  for (let i = 0; i < TEETH; i++) {
    const a = i * step - Math.PI / 2;
    const corners: Array<[number, number]> = [
      [a - halfRoot, ROOT],
      [a - halfTip, OUTER],
      [a + halfTip, OUTER],
      [a + halfRoot, ROOT],
    ];
    for (const [ang, r] of corners) {
      pts.push(`${(50 + r * Math.cos(ang)).toFixed(2)} ${(50 + r * Math.sin(ang)).toFixed(2)}`);
    }
  }
  const ring = `M${pts.join(" L")} Z`;
  const hole = `M${50 + HOLE} 50 A${HOLE} ${HOLE} 0 1 0 ${50 - HOLE} 50 A${HOLE} ${HOLE} 0 1 0 ${50 + HOLE} 50 Z`;
  return `${ring} ${hole}`;
}

const GEAR = gearPath();

// Open-end wrench pointing up-right, centered on the gear.
const WRENCH =
  "M71 14 a13 13 0 0 0 -15.5 16.5 L28 58 a6 6 0 0 0 8.5 8.5 L64 39 a13 13 0 0 0 16.5 -15.5 l-8 8 l-7 -1.5 l-1.5 -7 Z";

type LogoMarkProps = {
  /** The mark uses the current text color, e.g. className="text-white size-24". */
  className?: string;
  title?: string;
};

export function LogoMark({ className, title = "PatchUp" }: LogoMarkProps) {
  // The mask cuts a gap in the gear around the wrench so both shapes read
  // clearly in a single color.
  const maskId = `patchup-mark-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label={title}
      className={cn("shrink-0", className)}
      fill="currentColor"
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="#fff" />
          <path
            d={WRENCH}
            fill="#000"
            stroke="#000"
            strokeWidth="7"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <path d={GEAR} fillRule="evenodd" mask={`url(#${maskId})`} />
      <path d={WRENCH} />
    </svg>
  );
}
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-bold tracking-tight", className)}>PatchUp</span>
  );
}
