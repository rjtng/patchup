// PatchUp's service worker: shows phone notifications (Web Push) even when
// the app is closed, and opens the right screen when one is tapped. The
// messages come from the send-push function (supabase/functions/send-push).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    (async () => {
      // Someone already looking at that screen (say, the chat the message is
      // in) sees it there. Safari requires a notification for every push, so
      // there it always shows.
      if (data.url && !showsEveryPush()) {
        const windows = await self.clients.matchAll({ type: "window" });
        const looking = windows.some(
          (c) => c.focused && c.visibilityState === "visible" && new URL(c.url).pathname === data.url,
        );
        if (looking) return;
      }
      await self.registration.showNotification(data.title || "PatchUp", {
        body: data.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        // A newer notification for the same screen (a booking's updates, a
        // chat's messages) replaces the older one, and still buzzes.
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/notifications" },
      });
    })(),
  );
});

function showsEveryPush() {
  const ua = self.navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Safari\//.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua));
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/notifications", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open PatchUp window if there is one.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          return client.navigate(url);
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
