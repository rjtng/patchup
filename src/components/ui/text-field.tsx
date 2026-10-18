"use client";

import { Eye, EyeOff, type LucideIcon } from "lucide-react";
import { useId, useState, type ComponentProps } from "react";
import { cn } from "@/lib/cn";

/*
 * Labels sit above the field so they stay visible while typing (in the Figma
 * file some screens used placeholder-only labels that disappear).
 */
type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string;
};

export function TextField({ label, icon: Icon, hint, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-14 items-center gap-3 rounded-field border-2 bg-white px-4 transition-colors focus-within:border-brand-navy",
          error ? "border-danger" : "border-line",
        )}
      >
        {Icon && <Icon aria-hidden className="size-5 shrink-0 text-brand-navy" />}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          {...props}
        />
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn("text-sm", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type TextAreaFieldProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextAreaField({ label, hint, error, className, ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? hintId : undefined}
        className={cn(
          "w-full rounded-field border-2 bg-white px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-brand-navy",
          error ? "border-danger" : "border-line",
        )}
        {...props}
      />
      {(error || hint) && (
        <p id={hintId} className={cn("text-sm", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

type PasswordFieldProps = Omit<TextFieldProps, "type">;

export function PasswordField({ label, icon: Icon, hint, error, className, ...props }: PasswordFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div
        className={cn(
          "flex h-14 items-center gap-3 rounded-field border-2 bg-white pl-4 pr-1 transition-colors focus-within:border-brand-navy",
          error ? "border-danger" : "border-line",
        )}
      >
        {Icon && <Icon aria-hidden className="size-5 shrink-0 text-brand-navy" />}
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? hintId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="grid size-12 shrink-0 place-items-center rounded-full text-muted hover:text-brand-navy"
        >
          {visible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>
      {(error || hint) && (
        <p id={hintId} className={cn("text-sm", error ? "text-danger" : "text-muted")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
