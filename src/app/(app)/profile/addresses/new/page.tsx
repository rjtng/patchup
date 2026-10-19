import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AddressForm } from "../address-form";

export const metadata: Metadata = { title: "Add an address" };

export default function NewAddressPage() {
  return (
    <main className="pb-6">
      <PageHeader title="Add an address" backHref="/profile" />
      <AddressForm />
    </main>
  );
}
