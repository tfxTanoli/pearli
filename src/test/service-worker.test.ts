// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isExternalLink, isSitePath } from "@/lib/push/push-service.server";
import { WELCOME_NOTIFICATION_URL } from "@/lib/push/welcome-destination";

// Runs the real public/sw.js against a fake ServiceWorkerGlobalScope.
const source = readFileSync(path.resolve(__dirname, "../../public/sw.js"), "utf8");
const ORIGIN = "https://pearli.example";

type Listener = (event: Record<string, unknown>) => void;

function loadServiceWorker(windows: { url: string; focus: () => unknown }[] = []) {
  const listeners: Record<string, Listener> = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Listener) => (listeners[type] = fn),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => windows),
      openWindow: vi.fn(async () => null),
    },
  };
  new Function("self", source)(self);

  async function fire(type: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> = Promise.resolve();
    listeners[type]!({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }
  return { self, fire };
}

const pushData = (value: unknown) => ({
  json: () => (typeof value === "string" ? JSON.parse(value) : value),
  text: () => String(value),
});

describe("service worker", () => {
  let sw: ReturnType<typeof loadServiceWorker>;
  beforeEach(() => {
    sw = loadServiceWorker();
  });

  it("shows the pushed title, body and icon, keeping the click destination", async () => {
    await sw.fire("push", {
      data: pushData({ title: "New offer", body: "Take a look", url: "/offers" }),
    });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith("New offer", {
      body: "Take a look",
      icon: "/icon-256.png",
      data: { url: "/offers" },
    });
  });

  it("falls back to sensible defaults for empty or non-JSON pushes", async () => {
    await sw.fire("push", { data: null });
    expect(sw.self.registration.showNotification).toHaveBeenLastCalledWith("Pearli", {
      body: "",
      icon: "/icon-256.png",
      data: { url: "/" },
    });

    await sw.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("not json");
        },
        text: () => "plain text",
      },
    });
    expect(sw.self.registration.showNotification).toHaveBeenLastCalledWith("Pearli", {
      body: "plain text",
      icon: "/icon-256.png",
      data: { url: "/" },
    });
  });

  it("sends anything that is not a Pearli page or an https link to the home page", async () => {
    for (const url of [
      "//evil.example",
      "http://evil.example",
      "javascript:alert(1)",
      "data:text/html,x",
      "https://user:pass@evil.example",
      "https://localhost/x",
      "example.com",
      42,
      null,
    ]) {
      await sw.fire("push", { data: pushData({ title: "x", url }) });
    }
    const calls = sw.self.registration.showNotification.mock.calls as unknown[][];
    expect(calls).toHaveLength(9);
    for (const call of calls) expect(call[1]).toMatchObject({ data: { url: "/" } });
  });

  it("opens the notification's page when clicked", async () => {
    const close = vi.fn();
    await sw.fire("notificationclick", { notification: { close, data: { url: "/offers" } } });
    expect(close).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/offers`);
  });

  it("focuses an already-open tab on that page instead of opening another", async () => {
    const focus = vi.fn();
    sw = loadServiceWorker([
      { url: `${ORIGIN}/`, focus: vi.fn() },
      { url: `${ORIGIN}/offers`, focus },
    ]);
    await sw.fire("notificationclick", {
      notification: { close: vi.fn(), data: { url: "/offers" } },
    });
    expect(focus).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens the home page for a notification without a destination", async () => {
    await sw.fire("notificationclick", { notification: { close: vi.fn(), data: null } });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });
});

describe("service worker: welcome notification", () => {
  let sw: ReturnType<typeof loadServiceWorker>;
  beforeEach(() => {
    sw = loadServiceWorker();
  });

  const welcomePush = {
    title: "Welcome to Pearli",
    body: "You’re subscribed.",
    url: "/",
    welcome: true,
  };
  const lastNotificationData = () =>
    (sw.self.registration.showNotification.mock.calls.at(-1) as unknown[])[1] as {
      data: { url: string };
    };

  it("uses the same external URL as the shared constant", () => {
    expect(WELCOME_NOTIFICATION_URL).toBe("https://efficient.app/deals");
    expect(source).toContain(`const WELCOME_URL = "${WELCOME_NOTIFICATION_URL}";`);
  });

  it("shows the welcome normally and only stores its destination (no navigation on receipt)", async () => {
    await sw.fire("push", { data: pushData(welcomePush) });

    expect(sw.self.registration.showNotification).toHaveBeenCalledWith("Welcome to Pearli", {
      body: "You’re subscribed.",
      icon: "/icon-256.png",
      data: { url: WELCOME_NOTIFICATION_URL },
    });
    // Receiving the push must not open or focus anything.
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
    expect(sw.self.clients.matchAll).not.toHaveBeenCalled();
  });

  it("opens the external URL when the welcome notification is clicked", async () => {
    await sw.fire("push", { data: pushData(welcomePush) });
    const close = vi.fn();
    await sw.fire("notificationclick", {
      notification: { close, data: lastNotificationData().data },
    });

    expect(close).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledOnce();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("https://efficient.app/deals");
  });

  it("opens the external site even when Pearli tabs are already open", async () => {
    const focus = vi.fn();
    sw = loadServiceWorker([{ url: `${ORIGIN}/`, focus }]);
    await sw.fire("notificationclick", {
      notification: { close: vi.fn(), data: { url: WELCOME_NOTIFICATION_URL } },
    });
    expect(focus).not.toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(WELCOME_NOTIFICATION_URL);
  });

  it("sends the welcome to the deals page whatever link its payload carries", async () => {
    for (const url of ["/", "/offers", "https://other.example/page", undefined]) {
      await sw.fire("push", { data: pushData({ title: "Welcome", url, welcome: true }) });
      expect(lastNotificationData().data).toEqual({ url: WELCOME_NOTIFICATION_URL });
    }
  });

  it.each([
    ["no marker", { title: "x", url: "/offers" }],
    ["marker false", { title: "x", url: "/offers", welcome: false }],
    ["marker as a string", { title: "x", url: "/offers", welcome: "true" }],
    ["marker as a number", { title: "x", url: "/offers", welcome: 1 }],
  ])("does not treat a push with %s as the welcome", async (_label, payload) => {
    await sw.fire("push", { data: pushData(payload) });
    expect(lastNotificationData().data).toEqual({ url: "/offers" });
  });

  it("keeps other notifications on their own Pearli page", async () => {
    await sw.fire("push", {
      data: pushData({ title: "New offer", body: "Take a look", url: "/offers" }),
    });
    expect(lastNotificationData().data).toEqual({ url: "/offers" });
    await sw.fire("notificationclick", {
      notification: { close: vi.fn(), data: lastNotificationData().data },
    });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/offers`);
  });
});

describe("service worker: external links chosen by the admin", () => {
  let sw: ReturnType<typeof loadServiceWorker>;
  beforeEach(() => {
    sw = loadServiceWorker();
  });
  const storedUrl = () =>
    (
      (sw.self.registration.showNotification.mock.calls.at(-1) as unknown[])[1] as {
        data: { url: string };
      }
    ).data.url;

  it("stores an https link and opens exactly that site when clicked", async () => {
    await sw.fire("push", {
      data: pushData({
        title: "Deal of the day",
        body: "20% off",
        url: "https://www.audiowallet.co.uk/offers?ref=push",
      }),
    });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith("Deal of the day", {
      body: "20% off",
      icon: "/icon-256.png",
      data: { url: "https://www.audiowallet.co.uk/offers?ref=push" },
    });
    // Nothing opens until the notification is clicked.
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();

    const close = vi.fn();
    await sw.fire("notificationclick", { notification: { close, data: { url: storedUrl() } } });
    expect(close).toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledOnce();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(
      "https://www.audiowallet.co.uk/offers?ref=push",
    );
  });

  it("opens the external site even when Pearli tabs are open, without focusing them", async () => {
    const focus = vi.fn();
    sw = loadServiceWorker([{ url: `${ORIGIN}/`, focus }]);
    await sw.fire("notificationclick", {
      notification: { close: vi.fn(), data: { url: "https://example.com/deal" } },
    });
    expect(focus).not.toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith("https://example.com/deal");
  });

  it.each([
    "http://example.com/deal",
    "javascript:alert(1)",
    "https://user:pass@example.com/",
    "https://localhost/x",
    "//example.com",
  ])("falls back to the Pearli home page when a stored link is unsafe (%s)", async (url) => {
    await sw.fire("notificationclick", { notification: { close: vi.fn(), data: { url } } });
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it("agrees with the server about which links are allowed", async () => {
    const cases = [
      "/",
      "/offers",
      "/blog/post?x=1",
      "https://efficient.app/deals",
      "https://example.com",
      "HTTPS://Example.com/A",
      "http://example.com",
      "//example.com",
      "javascript:alert(1)",
      "https://user:pass@example.com",
      "https://localhost/x",
      "example.com",
      "ftp://example.com",
    ];
    for (const url of cases) {
      await sw.fire("push", { data: pushData({ title: "x", url }) });
      const stored = storedUrl();
      if (isExternalLink(url)) expect(stored).toBe(new URL(url).href);
      else if (isSitePath(url)) expect(stored).toBe(url);
      else expect(stored).toBe("/");
    }
  });
});
