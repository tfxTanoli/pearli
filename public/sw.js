/*
 * Pearli service worker — Web Push only.
 * There is intentionally no fetch handler: pages and assets load exactly as
 * they do without a service worker (no offline cache).
 */

const DEFAULT_ICON = "/icon-256.png";

// The welcome notification is the only one that opens an external site, and
// this is the only external URL a notification click can ever open.
// Keep in sync with src/lib/push/welcome-destination.ts.
const WELCOME_URL = "https://efficient.app/deals";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Only same-origin paths may be opened from a notification. */
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

/** Full URL a clicked notification opens: the welcome URL, or a page on this site. */
function clickTarget(url) {
  return url === WELCOME_URL ? WELCOME_URL : new URL(safePath(url), self.location.origin).href;
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Pearli", {
      body: data.body || "",
      icon: DEFAULT_ICON,
      // Only a push the server marked as the welcome gets the external URL;
      // an external URL sent any other way falls back to the home page.
      data: { url: data.welcome === true ? WELCOME_URL : safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = clickTarget(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((client) => client.url === target);
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    })(),
  );
});

// The browser rotated the subscription (e.g. it expired): re-register it.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      const subscription =
        event.newSubscription ||
        (event.oldSubscription &&
          (await self.registration.pushManager.subscribe(event.oldSubscription.options)));
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
      }
      if (oldEndpoint && (!subscription || subscription.endpoint !== oldEndpoint)) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: oldEndpoint }),
        });
      }
    })(),
  );
});
