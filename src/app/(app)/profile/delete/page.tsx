import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { formatPeso } from "@/lib/bookings";
import { owedByTechnician } from "@/lib/payouts";
import { isTechnician } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Delete my account" };

// What deleting an account removes and keeps (as the Privacy Notice says),
// what stops it for now, and the button.
export default function DeleteAccountPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Delete my account" backHref="/profile" />
      <Suspense fallback={<CardsSkeleton count={2} />}>
        <DeleteDetails />
      </Suspense>
    </main>
  );
}

async function DeleteDetails() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const technician = isTechnician(auth?.claims);
  const [{ data: blocker }, { data: paybacks }] = await Promise.all([
    supabase.rpc("account_deletion_blocker"),
    technician ? supabase.rpc("paybacks") : Promise.resolve({ data: [] }),
  ]);
  const owed = owedByTechnician(paybacks ?? [])[0]?.amount ?? 0;

  return (
    <div className="flex flex-col gap-4 px-6 pt-6">
      <section aria-labelledby="deleted" className="rounded-card bg-white p-5 text-sm shadow-sm">
        <h2 id="deleted" className="text-base font-bold text-ink">
          What&apos;s deleted
        </h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink">
          <li>Your name, email and password: you won&apos;t be able to log in again</li>
          <li>Your mobile number{technician ? "" : " and saved addresses"}</li>
          {technician ? (
            <li>Your documents, and your profile as customers see it</li>
          ) : (
            <li>The photos you added to your bookings</li>
          )}
          <li>The messages you sent, and your notifications</li>
        </ul>
        <h2 className="mt-4 text-base font-bold text-ink">What&apos;s kept, without your name</h2>
        <p className="mt-2 text-muted">
          {technician
            ? "Your finished jobs, their quotes and what was paid, and PatchUp's payments to you, for our records."
            : "Your finished and cancelled bookings, what was paid, and your reviews' star ratings, for our records and your technicians' history."}{" "}
          See the{" "}
          <Link href="/privacy" className="font-semibold text-brand-navy underline">
            Privacy Notice
          </Link>
          .
        </p>
      </section>

      {owed > 0 && (
        <p role="status" className="rounded-field bg-brand-yellow/30 px-4 py-3 text-sm text-ink">
          PatchUp still owes you {formatPeso(owed)} for first-booking offers. Ask PatchUp to pay you before you delete
          your account: afterwards we can&apos;t reach you.
        </p>
      )}

      {blocker ? (
        <section aria-label="Not yet" className="rounded-card bg-white p-5 text-sm shadow-sm">
          <p className="font-semibold text-ink">You can&apos;t delete your account yet</p>
          <p className="mt-1 text-muted">{blocker}</p>
          {!blocker.startsWith("Admins") && (
            <Link
              href={technician ? "/jobs" : "/bookings"}
              className="mt-3 inline-block font-semibold text-brand-navy underline"
            >
              {technician ? "Go to Jobs" : "Go to Bookings"}
            </Link>
          )}
        </section>
      ) : (
        <DeleteAccount />
      )}
    </div>
  );
}
