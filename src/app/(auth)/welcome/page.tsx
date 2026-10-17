import type { Metadata } from "next";
import { LogoMark, Wordmark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Get started" };

// "Get started" screen. Sign up is the primary action here because most
// people reaching this screen have just finished onboarding as new users.
export default function WelcomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white">
      <div className="bg-brand-gradient flex flex-1 flex-col items-center justify-center px-8 pb-12 text-white">
        <LogoMark className="size-28" />
        <Wordmark className="mt-4 text-4xl" />
        <p className="mt-1 font-semibold">Booking repair services made easy</p>
      </div>
      <section className="-mt-8 rounded-t-[2rem] bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-8">
        <h1 className="text-[1.75rem] font-bold leading-tight text-brand-navy">
          Get started with PatchUp
        </h1>
        <p className="mt-2 text-muted">Create an account to book your first repair.</p>
        <div className="mt-8 flex flex-col gap-3">
          <ButtonLink href="/signup">Sign up</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Log in
          </ButtonLink>
        </div>
      </section>
    </main>
  );
}
