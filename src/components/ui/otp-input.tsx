"use client";

import { useRef, type ClipboardEvent, type FocusEvent, type KeyboardEvent } from "react";

/** Six separate digit boxes with auto-advance, backspace, paste and autofill support. */
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
  // Set while this component moves focus itself, so handleFocus only
  // redirects focus the user moved (a tap or Tab).
  const movingFocus = useRef(false);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const focus = (i: number) => {
    movingFocus.current = true;
    refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();
    movingFocus.current = false;
  };

  const setDigit = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join("").slice(0, length));
  };

  // Writes digits from box i onwards. Paste, SMS autofill and keyboard
  // suggestions deliver several at once; a full-length run is the whole code.
  const insert = (i: number, run: string) => {
    const at = Math.min(i, value.length);
    const next = run.length >= length ? run : value.slice(0, at) + run + value.slice(at + run.length);
    onChange(next.slice(0, length));
    focus(at + run.length);
  };

  const handleInput = (i: number, raw: string) => {
    if (!raw) {
      setDigit(i, "");
      return;
    }
    // With the caret beside the existing digit instead of selecting it, the
    // box now holds that digit plus what was typed: keep only the new part.
    // (Exactly `length` characters means a whole code replaced the digit.)
    const old = digits[i];
    let added = raw;
    if (old && raw.length > 1 && raw.length !== length) {
      if (raw.startsWith(old)) added = raw.slice(1);
      else if (raw.endsWith(old)) added = raw.slice(0, -1);
    }
    const typed = added.replace(/\D/g, "");
    if (typed) insert(i, typed);
  };

  const handleKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[i]) {
      e.preventDefault();
      setDigit(i - 1, "");
      focus(i - 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focus(i - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focus(i + 1);
    }
  };

  // Digits fill from the left, so focusing an empty box past the first empty
  // one goes to that first empty box: the next digit typed lands there.
  const handleFocus = (i: number, e: FocusEvent<HTMLInputElement>) => {
    if (!movingFocus.current && i > value.length) focus(value.length);
    else e.target.select();
  };

  const handlePaste = (i: number, e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    e.preventDefault();
    insert(i, pasted);
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
            onPaste={(e) => handlePaste(i, e)}
            onFocus={(e) => handleFocus(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1} of ${length}`}
            className="h-14 w-full min-w-0 rounded-field border-2 border-line bg-white text-center text-xl font-bold text-ink outline-none transition-colors focus:border-brand-navy"
          />
        ))}
      </div>
    </fieldset>
  );
}
