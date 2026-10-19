import { MapPin } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { AddressForm } from "../address-form";

export const metadata: Metadata = { title: "Edit address" };

export default function EditAddressPage({ params }: PageProps<"/profile/addresses/[id]">) {
  return (
    <main className="pb-6">
      <PageHeader title="Edit address" backHref="/profile" />
      <Suspense fallback={<CardsSkeleton count={3} />}>
        <SavedAddress params={params} />
      </Suspense>
    </main>
  );
}

async function SavedAddress({ params }: { params: PageProps<"/profile/addresses/[id]">["params"] }) {
  const { id } = await params;
  const supabase = await createClient();
  // The access rules return only the signed-in person's own addresses.
  const { data: address } = await supabase
    .from("addresses")
    .select("id, label, street, barangay, city, province, landmark, latitude, longitude")
    .eq("id", id)
    .maybeSingle();
  if (!address) {
    return (
      <EmptyState icon={MapPin} title="Address not found">
        It may have been deleted.
      </EmptyState>
    );
  }
  return <AddressForm address={address} />;
}
