// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("never carries an off-site click destination", async () => {
    await sw.fire("push", { data: pushData({ title: "x", url: "https://evil.example" }) });
    await sw.fire("push", { data: pushData({ title: "x", url: "//evil.example" }) });
    for (const call of sw.self.registration.showNotification.mock.calls as unknown[][]) {
      expect(call[1]).toMatchObject({ data: { url: "/" } });
    }
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
