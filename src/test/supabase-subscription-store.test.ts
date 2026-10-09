// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupabaseSubscriptionStore } from "@/lib/push/supabase-subscription-store.server";

const CONFIG = { url: "https://proj.supabase.co", secretKey: "sb_secret_test" };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc:def";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(handler: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    handler(String(url), init ?? {}),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("SupabaseSubscriptionStore", () => {
  const store = new SupabaseSubscriptionStore(CONFIG);

  const record = {
    endpoint: ENDPOINT,
    keys: { p256dh: "pub", auth: "sec" },
    createdAt: "2026-01-01T00:00:00Z",
  };

  it("inserts a new subscription and reports it as new", async () => {
    const fetchMock = mockFetch(() => Response.json([{ endpoint: ENDPOINT }], { status: 201 }));
    await expect(store.save(record)).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://proj.supabase.co/rest/v1/push_subscriptions?on_conflict=endpoint&select=endpoint",
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("sb_secret_test");
    expect(headers["Prefer"]).toContain("resolution=ignore-duplicates");
    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: ENDPOINT,
      p256dh: "pub",
      auth: "sec",
    });
  });

  it("refreshes an existing subscription and reports it as not new", async () => {
    const fetchMock = mockFetch((_url, init) =>
      init.method === "POST"
        ? Response.json([], { status: 201 })
        : new Response(null, { status: 204 }),
    );
    await expect(store.save(record)).resolves.toBe(false);

    const [url, init] = fetchMock.mock.calls[1]!;
    expect(init?.method).toBe("PATCH");
    expect(url).toBe(
      `https://proj.supabase.co/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ENDPOINT)}`,
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({ p256dh: "pub", auth: "sec" });
  });

  it("deletes by exact, URL-encoded endpoint and reports whether a row was removed", async () => {
    const fetchMock = mockFetch(() => Response.json([{ endpoint: ENDPOINT }]));
    await expect(store.remove(ENDPOINT)).resolves.toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      `https://proj.supabase.co/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ENDPOINT)}&select=endpoint`,
    );
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("DELETE");

    mockFetch(() => Response.json([]));
    await expect(store.remove(ENDPOINT)).resolves.toBe(false);
  });

  it("pages through more than 1000 subscriptions", async () => {
    const rows = (n: number, offset: number) =>
      Array.from({ length: n }, (_, i) => ({
        endpoint: `https://fcm.googleapis.com/fcm/send/${offset + i}`,
        p256dh: "p",
        auth: "a",
        created_at: "2026-01-01T00:00:00Z",
      }));
    const fetchMock = mockFetch((_url, init) => {
      const range = (init.headers as Record<string, string>)["Range"];
      return Response.json(range === "0-999" ? rows(1000, 0) : rows(3, 1000));
    });

    const list = await store.list();
    expect(list).toHaveLength(1003);
    expect(list[1002]).toEqual({
      endpoint: "https://fcm.googleapis.com/fcm/send/1002",
      keys: { p256dh: "p", auth: "a" },
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("surfaces database errors", async () => {
    mockFetch(() => new Response('{"message":"permission denied"}', { status: 401 }));
    await expect(store.list()).rejects.toThrow(/HTTP 401/);
  });
});
