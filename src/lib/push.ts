import { fromBase64Url } from "@/lib/base64url";
import { createClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/database.types";

// Phone notifications (Web Push) on this device. The browser gives us a
// subscription; the database keeps it for the signed-in person, and the
// send-push function uses it (see supabase/functions/send-push).

export type PushState =
  | "unsupported" // this browser can't (or, on iPhone, only once PatchUp is on the Home Screen)
  | "denied" // blocked in the browser's settings
  | "unavailable" // the sender isn't set up yet
  | "off"
  | "on";

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

function supported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** Where this device stands. A subscription found here is (re)saved for whoever is signed in now. */
export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const subscription = await (await registration()).pushManager.getSubscription();
  if (subscription) {
    // Someone else may have used this browser before: the notifications follow the person signed in.
    await createClient().rpc("save_push_subscription", { subscription: subscription.toJSON() as Json });
    return "on";
  }
  const { data: key } = await createClient().rpc("push_public_key");
  return key ? "off" : "unavailable";
}

/** Asks the browser for permission and subscribes. Returns the new state. */
export async function turnOnPush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const supabase = createClient();
  const { data: key } = await supabase.rpc("push_public_key");
  if (!key) return "unavailable";
  if ((await Notification.requestPermission()) !== "granted") {
    return Notification.permission === "denied" ? "denied" : "off";
  }
  const subscription = await (await registration()).pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(key),
  });
  const { error } = await supabase.rpc("save_push_subscription", { subscription: subscription.toJSON() as Json });
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return "on";
}

/** Stops phone notifications on this device (also when logging out). */
export async function turnOffPush(): Promise<void> {
  if (!supported()) return;
  const subscription = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
  if (!subscription) return;
  await createClient().rpc("remove_push_subscription", { endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}
