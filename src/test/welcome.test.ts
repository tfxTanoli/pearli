// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemorySubscriptionStore } from "@/lib/push/push-service.server";
import {
  DEFAULT_WELCOME,
  getWelcomeSettings,
  saveWelcomeSettings,
  welcomeNewSubscriber,
  welcomeSettingsSchema,
} from "@/lib/push/welcome.server";

const VAPID = {
  VAPID_PUBLIC_KEY:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  VAPID_PRIVATE_KEY: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  VAPID_SUBJECT: "https://pearli.example",
};
const TARGET = {
  endpoint: "https://fcm.googleapis.com/fcm/send/new-subscriber",
  keys: {
    p256dh:
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    auth: "BTBZMqHH6r4Tts7J_aSIgg",
  },
};

beforeEach(() => {
  for (const [k, v] of Object.entries(VAPID)) vi.stubEnv(k, v);
  // No Supabase: settings use the in-memory fallback.
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  delete (globalThis as { __pearliWelcome?: unknown }).__pearliWelcome;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("welcomeNewSubscriber", () => {
  it("sends the welcome notification to the new subscriber only", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(TARGET.endpoint);
  });

  it("uses the saved welcome text", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await saveWelcomeSettings({
      enabled: true,
      title: "Hi from Miva",
      body: "Thanks!",
      url: "/offers",
    });
    expect(await getWelcomeSettings()).toEqual({
      enabled: true,
      title: "Hi from Miva",
      body: "Thanks!",
      url: "/offers",
    });
    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe("sent");
  });

  it("does nothing when the welcome notification is switched off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await saveWelcomeSettings({ ...DEFAULT_WELCOME, enabled: false });
    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe(
      "disabled",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when push is not configured", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe(
      "not-configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("removes a subscription the push service says is gone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 410 })),
    );
    const store = new MemorySubscriptionStore();
    await store.save({ ...TARGET, createdAt: "" });
    await expect(welcomeNewSubscriber(TARGET, store)).resolves.toBe("gone");
    expect(await store.list()).toEqual([]);
  });

  it("never throws, so a failed welcome cannot undo the subscription", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe(
      "failed",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    await expect(welcomeNewSubscriber(TARGET, new MemorySubscriptionStore())).resolves.toBe(
      "failed",
    );
  });
});

describe("welcome settings", () => {
  it("defaults to an enabled welcome that promises nothing specific", async () => {
    expect(await getWelcomeSettings()).toEqual(DEFAULT_WELCOME);
    expect(DEFAULT_WELCOME.enabled).toBe(true);
    expect(DEFAULT_WELCOME.body.toLowerCase()).not.toContain("discount");
  });

  it("validates like any notification (title required, on-site link only)", () => {
    expect(welcomeSettingsSchema.safeParse({ ...DEFAULT_WELCOME, title: " " }).success).toBe(false);
    expect(
      welcomeSettingsSchema.safeParse({ ...DEFAULT_WELCOME, url: "https://evil.example" }).success,
    ).toBe(false);
    expect(welcomeSettingsSchema.safeParse({ ...DEFAULT_WELCOME, enabled: "yes" }).success).toBe(
      false,
    );
  });

  it("reads and writes the single settings row in Supabase", async () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "GET") {
        return Response.json([
          {
            welcome_enabled: false,
            welcome_title: "Stored title",
            welcome_body: "Stored body",
            welcome_url: "/blog",
          },
        ]);
      }
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getWelcomeSettings()).toEqual({
      enabled: false,
      title: "Stored title",
      body: "Stored body",
      url: "/blog",
    });
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/rest/v1/push_settings?id=eq.1");

    await saveWelcomeSettings({ enabled: true, title: "New", body: "", url: "/" });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(String(url)).toBe("https://proj.supabase.co/rest/v1/push_settings?on_conflict=id");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      id: 1,
      welcome_enabled: true,
      welcome_title: "New",
      welcome_body: "",
      welcome_url: "/",
    });
  });
});
