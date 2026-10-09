import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enablePushNotifications, SERVICE_WORKER_URL } from "@/lib/push/client";

const PUBLIC_KEY =
  "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
const SUBSCRIPTION_JSON = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  expirationTime: null,
  keys: { p256dh: "p", auth: "a" },
};

function keyBytes() {
  const b64 = PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "=";
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

let permission: NotificationPermission;
let requestPermission: ReturnType<typeof vi.fn>;
let pushManager: { getSubscription: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
let register: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function installBrowserApis() {
  permission = "default";
  requestPermission = vi.fn(async () => {
    permission = "granted";
    return permission;
  });
  const NotificationStub = function Notification() {};
  Object.defineProperty(NotificationStub, "permission", { get: () => permission });
  Object.defineProperty(NotificationStub, "requestPermission", { value: requestPermission });
  vi.stubGlobal("Notification", NotificationStub);
  vi.stubGlobal("PushManager", function PushManager() {});
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });

  const newSubscription = { options: {}, toJSON: () => SUBSCRIPTION_JSON, unsubscribe: vi.fn() };
  pushManager = {
    getSubscription: vi.fn(async () => null),
    subscribe: vi.fn(async () => newSubscription),
  };
  register = vi.fn(async () => ({}));
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, ready: Promise.resolve({ pushManager }) },
  });

  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/push/config") return Response.json({ publicKey: PUBLIC_KEY });
    if (url === "/api/push/subscribe") return Response.json({ ok: true }, { status: 201 });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

beforeEach(installBrowserApis);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // @ts-expect-error test cleanup of a stubbed browser API
  delete navigator.serviceWorker;
  // @ts-expect-error test cleanup of a stubbed browser API
  delete window.isSecureContext;
});

describe("enablePushNotifications", () => {
  it("asks permission, subscribes with the server's VAPID key and registers the subscription", async () => {
    await expect(enablePushNotifications()).resolves.toBe("subscribed");

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(SERVICE_WORKER_URL);
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(),
    });
    const saveCall = fetchMock.mock.calls.find(([url]) => url === "/api/push/subscribe");
    expect(saveCall?.[1]).toMatchObject({ method: "POST" });
    expect(JSON.parse(saveCall?.[1].body)).toEqual(SUBSCRIPTION_JSON);
  });

  it("asks for permission before any network work (keeps the click's user activation)", async () => {
    await enablePushNotifications();
    expect(requestPermission.mock.invocationCallOrder[0]!).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0]!,
    );
  });

  it("reuses an existing subscription made with the same key", async () => {
    const existing = {
      options: { applicationServerKey: keyBytes().buffer },
      toJSON: () => SUBSCRIPTION_JSON,
      unsubscribe: vi.fn(),
    };
    pushManager.getSubscription.mockResolvedValue(existing);
    permission = "granted";

    await expect(enablePushNotifications()).resolves.toBe("subscribed");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(existing.unsubscribe).not.toHaveBeenCalled();
  });

  it("replaces a subscription made with an old VAPID key", async () => {
    const stale = {
      options: { applicationServerKey: new Uint8Array(65).buffer },
      toJSON: () => SUBSCRIPTION_JSON,
      unsubscribe: vi.fn(async () => true),
    };
    pushManager.getSubscription.mockResolvedValue(stale);

    await expect(enablePushNotifications()).resolves.toBe("subscribed");
    expect(stale.unsubscribe).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledOnce();
  });

  it("reports a blocked permission without prompting", async () => {
    permission = "denied";
    await expect(enablePushNotifications()).resolves.toBe("denied");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports when the user denies or dismisses the prompt", async () => {
    requestPermission.mockResolvedValueOnce("denied");
    await expect(enablePushNotifications()).resolves.toBe("denied");
    requestPermission.mockResolvedValueOnce("default");
    await expect(enablePushNotifications()).resolves.toBe("dismissed");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("reports unsupported browsers", async () => {
    vi.stubGlobal("PushManager", undefined);
    // @ts-expect-error simulate a browser without the Push API
    delete window.PushManager;
    await expect(enablePushNotifications()).resolves.toBe("unsupported");
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("tells iPhone users to add Pearli to the Home Screen", async () => {
    // @ts-expect-error simulate iOS Safari outside a Home Screen app
    delete window.PushManager;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1",
    );
    await expect(enablePushNotifications()).resolves.toBe("ios-install-required");
  });

  it("reports when push is not configured on the server", async () => {
    fetchMock.mockImplementation(async () => Response.json({ error: "x" }, { status: 503 }));
    await expect(enablePushNotifications()).resolves.toBe("unavailable");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("handles subscription and network failures gracefully", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    pushManager.subscribe.mockRejectedValueOnce(
      new DOMException("push service error", "AbortError"),
    );
    await expect(enablePushNotifications()).resolves.toBe("error");

    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/push/config") return Response.json({ publicKey: PUBLIC_KEY });
      throw new TypeError("Failed to fetch");
    });
    await expect(enablePushNotifications()).resolves.toBe("error");
  });
});
