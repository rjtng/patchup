import type { Metadata } from "next";
import { ListLink } from "../../list-link";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Add a service" };

export default function NewServicePage() {
  return (
    <main className="flex flex-col gap-4 px-6 pb-6 pt-3">
      <ListLink href="/admin/services">All services</ListLink>
      <h2 className="text-xl font-bold text-ink">Add a service</h2>
      <p className="-mt-2 text-sm text-muted">
        It goes at the end of the list; move it from there. Technicians who do it can then tick it on their profile.
      </p>
      <ServiceForm />
    </main>
  );
}
