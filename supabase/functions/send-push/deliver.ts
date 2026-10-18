import { generateVapidKeys, sendPush, type Subscription, type VapidKeys } from "./webpush.ts";

// The push services browsers use (Chrome and Android, Firefox, Safari, Edge).
// Messages only go to these, so a subscription can't make the sender call
// anything else.
const PUSH_HOSTS = ["fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isPushService(endpoint: string, extraHosts: string[] = []) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      [...PUSH_HOSTS, ...extraHosts].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    );
  } catch {
    return false;
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
type Delivery = { title: string; body: string; url: string; tag: string; subscriptions: Subscription[]; vapid: VapidKeys | null };

/**
 * One call from the database (see the notifications migration):
 * - { notification_id }: send that notification to the person's devices, once,
 *   and forget devices the push services say are gone;
 * - {}: set up, making sure there's a signing key pair (only the public half
 *   comes back).
 */
export async function handle(
  request: { notification_id?: unknown },
  { rpc, subject, extraHosts = [], fetchImpl }: { rpc: Rpc; subject: string; extraHosts?: string[]; fetchImpl?: typeof fetch },
) {
  if (typeof request.notification_id !== "string") {
    const keys = await generateVapidKeys();
    const { data, error } = await rpc("push_store_keys", { public_key: keys.public_key, private_jwk: keys.private_jwk });
    if (error) throw error;
    return { public_key: data };
  }

  const { data, error } = await rpc("push_take_delivery", { notification_id: request.notification_id });
  if (error) throw error;
  const delivery = data as Delivery | null;
  if (!delivery || !delivery.vapid) return { sent: 0, gone: 0 };

  const message = JSON.stringify({ title: delivery.title, body: delivery.body, url: delivery.url, tag: delivery.tag });
  const statuses = await Promise.all(
    delivery.subscriptions.map(async (subscription) => {
      if (!isPushService(subscription.endpoint, extraHosts)) return "invalid";
      try {
        return await sendPush(subscription, message, delivery.vapid!, subject, fetchImpl);
      } catch {
        return "failed"; // a network hiccup: keep the device
      }
    }),
  );
  const gone = delivery.subscriptions
    .filter((_, i) => statuses[i] === "invalid" || statuses[i] === 404 || statuses[i] === 410)
    .map((s) => s.endpoint);
  if (gone.length > 0) {
    const { error: forgetError } = await rpc("push_forget", { endpoints: gone });
    if (forgetError) console.error("Couldn't forget gone devices:", forgetError); // they'll be tried, and found gone, again
  }
  return { sent: statuses.filter((s) => typeof s === "number" && s >= 200 && s < 300).length, gone: gone.length };
}
