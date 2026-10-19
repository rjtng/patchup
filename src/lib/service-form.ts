// Checking a service an admin adds or edits (Admin → Services), in the
// browser for quick feedback and again on the server before saving. The
// database has its own checks too (see service_categories).

export type ServiceInput = {
  name: string;
  /** Its web address, /services/<slug>; set when it's added, not changed after. */
  slug: string;
  fee: string;
  icon: string;
  shown: boolean;
};

/** What a form sent, as text and a yes/no (a server action can be sent anything). */
export const cleanInput = (input: Partial<Record<keyof ServiceInput, unknown>> | null): ServiceInput => ({
  name: String(input?.name ?? ""),
  slug: String(input?.slug ?? ""),
  fee: String(input?.fee ?? ""),
  icon: String(input?.icon ?? ""),
  shown: input?.shown === true,
});

export type ServiceErrors = Partial<Record<"name" | "slug" | "fee" | "icon" | "form", string>>;

/** "Pest control" -> "pest-control"; "Aircon & ref" -> "aircon-ref" */
export const slugFor = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

/** "₱1,500", "300", "450.50" -> pesos; null if it isn't an amount. */
export function parseFee(text: string) {
  const plain = text.replace(/[₱,\s]/g, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(plain)) return null;
  const pesos = Number(plain);
  return pesos <= 100000 ? pesos : null;
}

export function checkService(input: ServiceInput, icons: string[], { isNew }: { isNew: boolean }) {
  const errors: ServiceErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Enter the service's name.";
  else if (name.length > 60) errors.name = "Keep the name to 60 characters.";
  if (isNew && (input.slug.length > 60 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.slug))) {
    errors.slug = "Use lower-case letters, numbers and dashes, like pest-control.";
  }
  if (parseFee(input.fee) === null) errors.fee = "Enter the fee in pesos, like 300 (up to ₱100,000).";
  if (!icons.includes(input.icon)) errors.icon = "Pick an icon.";
  return errors;
}
