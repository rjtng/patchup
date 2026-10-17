"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

/** Six separate digit boxes with auto-advance, backspace and paste support. */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label = "Verification code",
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label?: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const setDigit = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, length));
  };

  const handleInput = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "").slice(-1);
    setDigit(i, d);
    if (d) focus(i + 1);
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i]) {
      e.preventDefault();
      setDigit(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      focus(i + 1);
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focus(pasted.length);
  };

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-ink">{label}</legend>
      <div className="flex justify-between gap-2">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.target.select()}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            maxLength={1}
            className="h-14 w-full min-w-0 rounded-field border-2 border-line bg-white text-center text-xl font-bold text-ink outline-none transition-colors focus:border-brand-navy"
          />
        ))}
      </div>
    </fieldset>
  );
}
