// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  broadcastNotification,
  isAuthorizedSender,
  MemorySubscriptionStore,
  notificationSchema,
  pushSubscriptionSchema,
} from "@/lib/push/push-service.server";
import { base64UrlEncode } from "@/lib/push/web-push.server";

const VAPID = {
  publicKey:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  privateKey: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  subject: "mailto:test@example.com",
};
const UA_KEYS = {
  p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};
const ADMIN_TOKEN = "test-admin-token-that-is-long-enough-123";

function record(endpoint: string) {
  return { endpoint, keys: UA_KEYS, createdAt: new Date().toISOString() };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("subscription validation", () => {
  it("accepts a real-shaped browser subscription", () => {
    const result = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      expirationTime: null,
      keys: UA_KEYS,
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ["non-push host (SSRF)", "https://evil.example.com/hook"],
    ["look-alike host", "https://fcm.googleapis.com.evil.example/x"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/abc"],
    ["internal address", "https://169.254.169.254/latest/meta-data"],
  ])("rejects %s endpoints", (_label, endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys: UA_KEYS }).success).toBe(false);
  });

  it("rejects malformed keys", () => {
    const short = base64UrlEncode(new Uint8Array(10));
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc",
        keys: { p256dh: short, auth: UA_KEYS.auth },
      }).success,
    ).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: "https://web.push.apple.com/abc",
        keys: { p256dh: UA_KEYS.p256dh, auth: short },
      }).success,
    ).toBe(false);
  });
});

describe("notification validation", () => {
  it("defaults the click destination to the home page", () => {
    expect(notificationSchema.parse({ title: "Hi" })).toEqual({ title: "Hi", body: "", url: "/" });
  });

  it.each(["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example"])(
    "rejects off-site click destination %s",
    (url) => {
      expect(notificationSchema.safeParse({ title: "Hi", url }).success).toBe(false);
    },
  );
});

describe("sender authorization", () => {
  const req = (auth?: string) =>
    new Request("http://localhost/api/push/send", {
      method: "POST",
      headers: auth ? { authorization: auth } : {},
    });

  it("rejects everyone when PUSH_ADMIN_TOKEN is not set", () => {
    vi.stubEnv("PUSH_ADMIN_TOKEN", "");
    expect(isAuthorizedSender(req("Bearer "))).toBe(false);
  });

  it("rejects a token that is too short to be safe", () => {
    vi.stubEnv("PUSH_ADMIN_TOKEN", "short");
    expect(isAuthorizedSender(req("Bearer short"))).toBe(false);
  });

  it("accepts only the exact bearer token", () => {
    vi.stubEnv("PUSH_ADMIN_TOKEN", ADMIN_TOKEN);
    expect(isAuthorizedSender(req(`Bearer ${ADMIN_TOKEN}`))).toBe(true);
    expect(isAuthorizedSender(req(`Bearer ${ADMIN_TOKEN}x`))).toBe(false);
    expect(isAuthorizedSender(req("Bearer wrong"))).toBe(false);
    expect(isAuthorizedSender(req())).toBe(false);
  });
});

describe("MemorySubscriptionStore", () => {
  it("reports whether a saved subscription is new", async () => {
    const store = new MemorySubscriptionStore();
    await expect(store.save(record("https://fcm.googleapis.com/fcm/send/a"))).resolves.toBe(true);
    await expect(store.save(record("https://fcm.googleapis.com/fcm/send/a"))).resolves.toBe(false);
    expect(await store.list()).toHaveLength(1);
  });
});

describe("broadcastNotification", () => {
  let store: MemorySubscriptionStore;

  beforeEach(async () => {
    store = new MemorySubscriptionStore();
    await store.save(record("https://fcm.googleapis.com/fcm/send/ok"));
    await store.save(record("https://fcm.googleapis.com/fcm/send/expired"));
    await store.save(record("https://fcm.googleapis.com/fcm/send/gone"));
    await store.save(record("https://fcm.googleapis.com/fcm/send/flaky"));
    await store.save(record("https://fcm.googleapis.com/fcm/send/offline"));
  });

  it("delivers to every subscription and prunes expired ones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/ok")) return new Response(null, { status: 201 });
      if (url.endsWith("/expired")) return new Response(null, { status: 410 });
      if (url.endsWith("/gone")) return new Response(null, { status: 404 });
      if (url.endsWith("/flaky")) return new Response(null, { status: 503 });
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await broadcastNotification(
      { title: "New offer", body: "Take a look", url: "/offers" },
      VAPID,
      store,
    );

    expect(result).toEqual({ total: 5, sent: 1, failed: 4, removed: 2 });
    // Transient failures are kept; 404/410 are removed.
    expect((await store.list()).map((s) => s.endpoint.split("/").pop()).sort()).toEqual([
      "flaky",
      "offline",
      "ok",
    ]);

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe("POST");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["TTL"]).toBe("86400");
    expect(headers["Authorization"]).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${VAPID.publicKey}$`),
    );
    // The body is encrypted: the plaintext title must not appear in it.
    const body = new TextDecoder().decode(init?.body as Uint8Array);
    expect(body).not.toContain("New offer");
  });

  it("does nothing when nobody is subscribed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await broadcastNotification(
      { title: "Hi", body: "", url: "/" },
      VAPID,
      new MemorySubscriptionStore(),
    );
    expect(result).toEqual({ total: 0, sent: 0, failed: 0, removed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
