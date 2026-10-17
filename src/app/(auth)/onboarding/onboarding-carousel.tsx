"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { markOnboardingSeen } from "@/lib/onboarding";
import { slides } from "./slides";

export function OnboardingCarousel() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = slides[index];
  const isLast = index === slides.length - 1;
  const Icon = slide.icon;

  const finish = () => {
    markOnboardingSeen();
    router.push("/welcome");
  };

  return (
    <main className="flex min-h-dvh flex-col bg-white">
      {/* Illustration area */}
      <div className="relative flex flex-[1.15] items-center justify-center overflow-hidden bg-brand-gradient">
        {slide.image ? (
          <Image
            key={slide.image}
            src={slide.image}
            alt={slide.imageAlt ?? ""}
            fill
            priority
            sizes="430px"
            className="object-cover"
          />
        ) : (
          <div
            key={index}
            className="grid size-52 place-items-center rounded-full bg-white/15 ring-[18px] ring-white/10 motion-safe:animate-[fadeIn_400ms_ease-out]"
          >
            <Icon aria-hidden className="size-24 text-white" strokeWidth={1.75} />
          </div>
        )}
        <Link
          href="/welcome"
          onClick={markOnboardingSeen}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-white"
        >
          Skip
        </Link>
      </div>

      {/* Text and controls */}
      <section
        aria-roledescription="carousel"
        aria-label="Introduction"
        className="relative z-10 -mt-8 flex flex-1 flex-col rounded-t-[2rem] bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6"
      >
        <div className="flex gap-2">
          {slides.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-current={i === index ? "step" : undefined}
              aria-label={`Go to slide ${i + 1} of ${slides.length}`}
              onClick={() => setIndex(i)}
              className="flex h-6 items-center"
            >
              <span
                className={cn(
                  "block h-2 rounded-full transition-all",
                  i === index ? "w-8 bg-brand-navy" : "w-2 bg-line",
                )}
              />
            </button>
          ))}
        </div>

        <div aria-live="polite" className="mt-4">
          <h1 className="text-[1.75rem] font-bold leading-tight text-brand-navy">{slide.title}</h1>
          <p className="mt-3 text-base leading-relaxed text-muted">{slide.body}</p>
        </div>

        <div className="mt-auto flex items-center gap-3 pt-8">
          {index > 0 && (
            <Button variant="secondary" className="w-auto flex-1" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button
            className="flex-[2]"
            onClick={() => (isLast ? finish() : setIndex(index + 1))}
          >
            {isLast ? "Get started" : "Next"}
          </Button>
        </div>
      </section>
    </main>
  );
}
