import type { Database } from "@/lib/supabase/database.types";

// Paying technicians back for the first-booking offer (see the payouts migration).

/** A completed job's payback, as paybacks() lists it; payout_id and paid_at are null until it's paid. */
export type Payback = Database["public"]["Functions"]["paybacks"]["Returns"][number];

/** Adds up peso amounts to the centavo, as the database does. */
export const sumPesos = (amounts: number[]) => Math.round(amounts.reduce((sum, a) => sum + Number(a) * 100, 0)) / 100;

export const jobsLabel = (count: number) => (count === 1 ? "1 job" : `${count} jobs`);

/** What's not yet paid back, for each technician owed something, most owed first. */
export function owedByTechnician(paybacks: Payback[]) {
  const owed = new Map<string, { technicianId: string; name: string; jobs: Payback[] }>();
  for (const payback of paybacks) {
    if (payback.payout_id) continue;
    const group = owed.get(payback.technician_id) ?? {
      technicianId: payback.technician_id,
      name: payback.technician_name,
      jobs: [],
    };
    group.jobs.push(payback);
    owed.set(payback.technician_id, group);
  }
  return [...owed.values()]
    .map((group) => ({ ...group, amount: sumPesos(group.jobs.map((j) => j.amount)) }))
    .sort((a, b) => b.amount - a.amount);
}
