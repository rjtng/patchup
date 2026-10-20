import type { Metadata } from "next";
import Link from "next/link";
import { AuthScreen } from "@/components/layout/auth-screen";
import { HistoryBack, LegalSection } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy Notice" };

// What PatchUp collects, why, who sees it and for how long, as the Data
// Privacy Act asks. It describes what the app and database actually do: keep
// it in step with them (and see LEGAL for the business details).
export default function PrivacyPage() {
  return (
    <AuthScreen
      back={<HistoryBack fallback="/signup" />}
      title="Privacy Notice"
      subtitle={`Last updated ${LEGAL.updated}`}
    >
      <p className="text-sm leading-relaxed text-ink">
        PatchUp connects people in the Philippines with technicians for home repairs. This notice explains what personal
        information we collect, why, who sees it, how long we keep it, and your rights under the Data Privacy Act of
        2012 (Republic Act No. 10173).
      </p>

      <div className="mt-6">
        <LegalSection title="Who we are">
          <p>
            {LEGAL.business}, {LEGAL.address}, is responsible for your information. Our Data Protection Officer is{" "}
            {LEGAL.dpo}. Write to {LEGAL.email} with any question or request about your information.
          </p>
        </LegalSection>

        <LegalSection title="What we collect">
          <ul>
            <li>
              <strong>Everyone:</strong> your name, email address and password (stored scrambled, so nobody can read
              it), whether you&apos;re a customer or a technician, and your mobile number if you add it.
            </li>
            <li>
              <strong>Customers:</strong> your saved addresses and map pins; what you book (the service, the item, its
              brand, the problem, the visit time and the address); photos of the problem you add; the quotes you approve
              or decline; what you pay; and the reviews you write.
            </li>
            <li>
              <strong>Technicians:</strong> your city, experience, description and services; whether you&apos;re taking
              jobs; your government ID, NBI clearance and certificates; your location while you&apos;re on the way to a
              job; your jobs, quotes and the cash you collect; and PatchUp&apos;s payments to you, with their reference.
            </li>
            <li>The messages a customer and their technician send each other.</li>
            <li>
              The notifications we send you and, if you turn on phone notifications, the address your browser gives us
              to reach your phone.
            </li>
            <li>
              A cookie that keeps you signed in, and the records our hosting providers keep (such as IP addresses) to
              run and protect the service.
            </li>
          </ul>
          <p>We don&apos;t collect card or bank details: customers pay technicians in cash.</p>
        </LegalSection>

        <LegalSection title="Why we use it">
          <ul>
            <li>To run your bookings and jobs, as our Terms of Service describe.</li>
            <li>
              To check technicians before customers can book them. Government IDs are sensitive personal information:
              technicians give their consent by sending them, and only PatchUp&apos;s admins see them.
            </li>
            <li>
              To keep you up to date: notifications, reminders before a visit, and follow-ups when something is late.
            </li>
            <li>
              To show a technician&apos;s location to their customer while they&apos;re on the way. It starts when the
              technician taps &quot;I&apos;m on my way&quot;, and stops and is deleted when they arrive.
            </li>
            <li>To keep PatchUp safe and fair, and to keep records of bookings, payments and payouts.</li>
          </ul>
          <p>We don&apos;t sell your information or use it for advertising.</p>
        </LegalSection>

        <LegalSection title="Who sees it">
          <ul>
            <li>
              <strong>The other side of your booking.</strong> Before taking a request, technicians who could take it
              see the service, the item, the problem, any photos and the area (barangay and city), but not your street
              address. The technician who takes it sees your name, address and map pin. While the job is under way you
              can call each other if you&apos;ve added your number, and the customer can follow the technician on a map
              while they&apos;re on the way.
            </li>
            <li>
              <strong>Everyone:</strong> an approved technician&apos;s profile (name, city, experience, description,
              services, rating, and reviews with the reviewer&apos;s first name).
            </li>
            <li>
              <strong>PatchUp&apos;s admins:</strong> what they need to run PatchUp, including technicians&apos;
              documents and everyone&apos;s email address.
            </li>
            <li>
              <strong>Our service providers</strong>, who handle information for us: Supabase (database, sign-in and
              file storage, in Singapore), Vercel (hosting the app), MapTiler and OpenStreetMap (map images), and
              Google, Mozilla, Apple or Microsoft (delivering phone notifications to your browser). Some are outside the
              Philippines; we choose providers that protect information to a standard comparable to the Data Privacy
              Act.
            </li>
            <li>Authorities, when the law requires it.</li>
          </ul>
        </LegalSection>

        <LegalSection title="How long we keep it">
          <p>
            We keep your information while you have an account. A technician&apos;s location is kept only while
            they&apos;re on the way to a job.
          </p>
          <p>
            When you delete your account (Profile, then Delete my account), we delete your name, email, password, mobile
            number, saved addresses, photos, documents, the messages you sent and your notifications. We keep finished
            and cancelled bookings, quotes, payments and star ratings, without anything that identifies you, for our
            records and for the other side&apos;s history.
          </p>
        </LegalSection>

        <LegalSection title="Your rights">
          <p>Under the Data Privacy Act, you have the right to:</p>
          <ul>
            <li>be told how your information is used (this notice);</li>
            <li>see the information we have about you;</li>
            <li>correct it (most of it is on your Profile);</li>
            <li>object to how we use it;</li>
            <li>have it deleted or blocked (you can delete your account yourself);</li>
            <li>get a copy of it;</li>
            <li>be compensated for damage caused by its misuse; and</li>
            <li>
              complain to the National Privacy Commission (
              <a href="https://privacy.gov.ph" className="font-semibold text-brand-navy underline">
                privacy.gov.ph
              </a>
              ).
            </li>
          </ul>
          <p>To use them, write to {LEGAL.email}. We may ask you to confirm it&apos;s you.</p>
        </LegalSection>

        <LegalSection title="How we protect it">
          <p>
            Connections to PatchUp are encrypted. Rules in our database decide who can see and change what. Photos and
            documents are private, and shared only through links that expire within an hour. Passwords are stored
            scrambled.
          </p>
        </LegalSection>

        <LegalSection title="Children">
          <p>PatchUp is for people 18 and older.</p>
        </LegalSection>

        <LegalSection title="Changes">
          <p>
            If we change this notice, we&apos;ll update the date above, and tell you in the app when the change matters.
            See also our{" "}
            <Link href="/terms" className="font-semibold text-brand-navy underline">
              Terms of Service
            </Link>
            .
          </p>
        </LegalSection>
      </div>
    </AuthScreen>
  );
}
