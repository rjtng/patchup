import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type CheckboxProps = Omit<ComponentProps<"input">, "type"> & { children: ReactNode };

export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm text-ink", className)}>
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          type="checkbox"
          className="peer size-5 appearance-none rounded-md border-2 border-line bg-white checked:border-brand-navy checked:bg-brand-navy"
          {...props}
        />
        <Check
          aria-hidden
          strokeWidth={3}
          className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span>{children}</span>
    </label>
  );
}
