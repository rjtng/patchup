import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/layout/auth-screen";
import { HistoryBack, LegalSection } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of Service" };

// How PatchUp works between customers, technicians and PatchUp. It describes
// what the app does (fees, quotes, cancelling, the first-booking offer): keep
// it in step with it (and see LEGAL for the business details).
export default function TermsPage() {
  return (
    <AuthScreen
      back={<HistoryBack fallback="/signup" />}
      title="Terms of Service"
      subtitle={`Last updated ${LEGAL.updated}`}
    >
      <p className="text-sm leading-relaxed text-ink">
        These terms are an agreement between you and {LEGAL.business} about using PatchUp. By creating an account, you
        agree to them and to our{" "}
        <Link href="/privacy" className="font-semibold text-brand-navy underline">
          Privacy Notice
        </Link>
        .
      </p>

      <div className="mt-6">
        <LegalSection title="What PatchUp is">
          <p>
            PatchUp is an app that connects customers with independent technicians for home repairs in the Philippines.
            Technicians aren&apos;t PatchUp&apos;s employees: they do the work and set the price of a repair. PatchUp
            checks technicians&apos; documents before they can take jobs, and runs the app.
          </p>
        </LegalSection>

        <LegalSection title="Your account">
          <ul>
            <li>You must be 18 or older, and give your real name and details.</li>
            <li>Keep your password to yourself. You&apos;re responsible for what&apos;s done with your account.</li>
            <li>One account per person.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Booking a repair">
          <ul>
            <li>
              The inspection fee shown when you book is what the visit costs. You pay it to the technician in cash,
              after the visit.
            </li>
            <li>
              If something needs fixing, the technician tells you the price in the app before starting. You approve or
              decline it. If you decline, you pay only the inspection fee.
            </li>
            <li>
              Your first booking (not counting ones you cancelled) gets the first-booking offer shown in the app, taken
              off what you pay. It never takes the total below zero.
            </li>
            <li>
              You can cancel for free until the technician arrives. If no technician takes your request by the visit
              time, it&apos;s cancelled and we tell you.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="Doing jobs (technicians)">
          <ul>
            <li>You can take jobs once PatchUp has approved you. Keep your details and documents up to date.</li>
            <li>
              Take only jobs you can do, keep &quot;Taking new jobs&quot; up to date, and tap &quot;I&apos;m on my
              way&quot; when you leave. If you can&apos;t make it, give the job back so another technician can take it.
            </li>
            <li>If you haven&apos;t set off by the visit time, PatchUp may give the job to another technician.</li>
            <li>
              Quote honestly in the app before starting a repair, and collect only the amount the app shows. PatchUp
              pays you back the first-booking offer on your customers&apos; first bookings.
            </li>
            <li>PatchUp doesn&apos;t charge technicians a fee.</li>
          </ul>
        </LegalSection>

        <LegalSection title="Reviews, messages and photos">
          <p>
            Be honest and respectful. Don&apos;t post anything abusive, threatening, discriminatory or misleading, or
            other people&apos;s private information. PatchUp may hide a review or remove a message that breaks these
            terms; we tell you when we hide your review.
          </p>
        </LegalSection>

        <LegalSection title="Our part">
          <p>
            We work to keep PatchUp running and its technicians checked, but each technician is responsible for their
            own work. If something goes wrong with a job, tap &quot;Report a problem&quot; on the booking (or write to{" "}
            {LEGAL.email}): we&apos;ll look into it, help sort it out with the other side, and tell you what we did. To
            the extent the law allows, PatchUp isn&apos;t liable for indirect losses from using the app. Nothing in
            these terms limits your rights under the Consumer Act of the Philippines.
          </p>
        </LegalSection>

        <LegalSection title="Suspending and deleting accounts">
          <p>
            PatchUp may suspend an account that breaks these terms: a suspended customer can&apos;t book new repairs,
            and a suspended technician can&apos;t take new jobs, until it&apos;s lifted. We tell you when we suspend
            your account. You can delete your account at any time from your Profile, once none of your bookings or jobs
            is under way.
          </p>
        </LegalSection>

        <LegalSection title="Changes and the law">
          <p>
            If we change these terms, we&apos;ll update the date above and tell you in the app when the change matters.
            These terms are governed by the laws of the Philippines. Questions: {LEGAL.email}.
          </p>
        </LegalSection>
      </div>
    </AuthScreen>
  );
}
