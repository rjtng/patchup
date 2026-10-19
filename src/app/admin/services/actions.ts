"use server";

import { revalidatePath, updateTag } from "next/cache";
import { SERVICE_ICON_NAMES } from "@/components/services/service-icon";
import { checkService, cleanInput, parseFee, type ServiceErrors, type ServiceInput } from "@/lib/service-form";
import { SERVICES_TAG } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";

// Admins adding, changing and moving services. These run on the server as the
// signed-in admin, so the database's rules still decide (only admins may
// change services); then the cached list of services is refreshed, so Home,
// All services and Search show the change right away.

type Result = { errors?: ServiceErrors; id?: string };

// After a change: the cached list (Home, All services, Search), and each
// service's own pages, which are kept per service and with the tag alone
// still showed the old version on their next visit.
function refreshServices() {
  updateTag(SERVICES_TAG);
  revalidatePath("/services/[slug]", "layout");
}

const TRY_AGAIN = "That didn't save. Check your connection and try again.";
const ADMINS_ONLY = "Only PatchUp admins can change services.";

export async function addService(sent: ServiceInput): Promise<Result> {
  const input = cleanInput(sent);
  const errors = checkService(input, SERVICE_ICON_NAMES, { isNew: true });
  if (Object.keys(errors).length > 0) return { errors };

  const supabase = await createClient();
  // New services go last; they can be moved from the list.
  const { data: last } = await supabase
    .from("service_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("service_categories")
    .insert({
      slug: input.slug,
      name: input.name.trim(),
      inspection_fee: parseFee(input.fee)!,
      icon: input.icon,
      is_active: input.shown,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { errors: { slug: "Another service has this web address. Pick another." } };
    return { errors: { form: error.code === "42501" ? ADMINS_ONLY : TRY_AGAIN } };
  }
  refreshServices();
  return { id: data.id };
}

export async function saveService(id: string, sent: ServiceInput): Promise<Result> {
  const input = cleanInput(sent);
  const errors = checkService(input, SERVICE_ICON_NAMES, { isNew: false });
  if (Object.keys(errors).length > 0) return { errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_categories")
    .update({ name: input.name.trim(), inspection_fee: parseFee(input.fee)!, icon: input.icon, is_active: input.shown })
    .eq("id", id)
    .select("id");
  if (error) return { errors: { form: TRY_AGAIN } };
  // Nothing changed: not an admin (the rules hide the row from them), or it's gone.
  if (data.length === 0) return { errors: { form: ADMINS_ONLY } };
  refreshServices();
  return { id };
}

/** Moves a service one place up or down the list (and so on Home). */
export async function moveService(id: string, direction: "up" | "down"): Promise<Result> {
  const supabase = await createClient();
  const { data: services, error } = await supabase
    .from("service_categories")
    .select("id, sort_order")
    .order("sort_order")
    .order("name");
  if (error) return { errors: { form: TRY_AGAIN } };
  const from = services.findIndex((s) => s.id === id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= services.length) return {};

  // Number them 1, 2, 3… in the new order, saving only those whose number
  // changes (usually just the two swapped).
  const order = services.map((s) => s.id);
  [order[from], order[to]] = [order[to], order[from]];
  const changes = order.flatMap((serviceId, i) =>
    services.find((s) => s.id === serviceId)!.sort_order === i + 1 ? [] : [{ id: serviceId, sort_order: i + 1 }],
  );
  const results = await Promise.all(
    changes.map((change) =>
      supabase.from("service_categories").update({ sort_order: change.sort_order }).eq("id", change.id).select("id"),
    ),
  );
  if (results.some((r) => r.error)) return { errors: { form: TRY_AGAIN } };
  if (results.some((r) => r.data?.length === 0)) return { errors: { form: ADMINS_ONLY } };
  refreshServices();
  return {};
}
