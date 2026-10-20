// Reporting a problem with a booking (see the reports migration): what went
// wrong, as the customer or the technician would say it, and as admins read
// it (private.report_reason in the database).

export type ReportReason = "no_show" | "work" | "price" | "payment" | "damage" | "behaviour" | "review" | "other";

export const CUSTOMER_REASONS: { value: ReportReason; label: string }[] = [
  { value: "no_show", label: "The technician didn't come" },
  { value: "work", label: "The repair wasn't done right" },
  { value: "price", label: "I was charged more than agreed" },
  { value: "damage", label: "Something was damaged" },
  { value: "behaviour", label: "Rude, unsafe or inappropriate behaviour" },
  { value: "other", label: "Something else" },
];

export const TECHNICIAN_REASONS: { value: ReportReason; label: string }[] = [
  { value: "no_show", label: "The customer wasn't there" },
  { value: "payment", label: "The customer didn't pay" },
  { value: "behaviour", label: "Rude, unsafe or inappropriate behaviour" },
  { value: "review", label: "An unfair or abusive review" },
  { value: "other", label: "Something else" },
];

export const ADMIN_REASON: Record<ReportReason, string> = {
  no_show: "Didn't show up",
  work: "Repair not done right",
  price: "Charged more than agreed",
  payment: "Didn't pay",
  damage: "Something was damaged",
  behaviour: "Rude, unsafe or inappropriate",
  review: "Unfair or abusive review",
  other: "Something else",
};

export type Report = {
  id: string;
  reason: string;
  details: string;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
};

/** A reason's label as the reporter chose it. */
export const reasonLabel = (reason: string, technician: boolean) =>
  (technician ? TECHNICIAN_REASONS : CUSTOMER_REASONS).find((r) => r.value === reason)?.label ??
  ADMIN_REASON[reason as ReportReason] ??
  reason;
