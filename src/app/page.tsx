import { LogoMark, Wordmark } from "@/components/brand/logo";
import { SplashRedirect } from "./splash-redirect";

// Splash screen. After a moment it moves on to onboarding (first visit)
// or the welcome screen (returning visitor). Signed-in people never see it:
// the proxy (src/proxy.ts) sends them straight to Home.
export default function SplashPage() {
  return (
    <main className="bg-brand-gradient flex min-h-dvh flex-col items-center justify-center px-8 text-center text-white">
      <LogoMark className="size-36 drop-shadow-[0_6px_18px_rgba(0,30,90,0.25)]" />
      <Wordmark className="mt-6 text-5xl" />
      <p className="mt-2 text-lg font-semibold">Fix it fast, fix it right</p>
      <SplashRedirect />
    </main>
  );
}
