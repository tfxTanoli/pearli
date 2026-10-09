// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTipCheckoutSession,
  tipRequestSchema,
  verifyStripeSignature,
  type StripeCheckoutEvent,
} from "@/lib/stripe/stripe.server";
import { recordTip, tipStatusForEvent } from "@/lib/stripe/tips.server";

const SECRET = "whsec_test_secret_for_unit_tests";

async function sign(payload: string, timestamp: number, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function checkoutEvent(
  type: string,
  overrides: Partial<StripeCheckoutEvent["data"]["object"]> = {},
): StripeCheckoutEvent {
  return {
    type,
    livemode: false,
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        amount_total: 500,
        currency: "gbp",
        payment_status: "paid",
        payment_intent: "pi_test_123",
        metadata: { source: "pearli-tip" },
        ...overrides,
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verifyStripeSignature", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_760_000_000_000;
  const t = Math.floor(now / 1000);

  it("accepts a correctly signed, fresh payload", async () => {
    const header = `t=${t},v1=${await sign(payload, t)}`;
    await expect(verifyStripeSignature(payload, header, SECRET, { now })).resolves.toBe(true);
  });

  it("accepts when any of several v1 signatures matches (secret rotation)", async () => {
    const header = `t=${t},v1=${"0".repeat(64)},v1=${await sign(payload, t)},v0=ignored`;
    await expect(verifyStripeSignature(payload, header, SECRET, { now })).resolves.toBe(true);
  });

  it("rejects a tampered body", async () => {
    const header = `t=${t},v1=${await sign(payload, t)}`;
    await expect(
      verifyStripeSignature(payload.replace("evt_1", "evt_2"), header, SECRET, { now }),
    ).resolves.toBe(false);
  });

  it("rejects a signature made with another secret", async () => {
    const header = `t=${t},v1=${await sign(payload, t, "whsec_other")}`;
    await expect(verifyStripeSignature(payload, header, SECRET, { now })).resolves.toBe(false);
  });

  it("rejects replays older than five minutes", async () => {
    const old = t - 301;
    const header = `t=${old},v1=${await sign(payload, old)}`;
    await expect(verifyStripeSignature(payload, header, SECRET, { now })).resolves.toBe(false);
  });

  it.each([null, "", "garbage", `t=${t}`, "v1=abc", `t=abc,v1=${"a".repeat(64)}`])(
    "rejects malformed header %j",
    async (header) => {
      await expect(verifyStripeSignature(payload, header, SECRET, { now })).resolves.toBe(false);
    },
  );
});

describe("tip amounts", () => {
  it.each([
    [1, 100],
    [5, 500],
    [10, 1000],
    [7.5, 750],
    [0.29 + 1, 129],
    [500, 50_000],
  ])("accepts £%s as %i pence", (amount, pence) => {
    expect(tipRequestSchema.parse({ amount }).amount).toBe(pence);
  });

  it.each([0, 0.99, -5, 500.01, 7.555, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects £%s",
    (amount) => {
      expect(tipRequestSchema.safeParse({ amount }).success).toBe(false);
    },
  );

  it("rejects non-numbers", () => {
    expect(tipRequestSchema.safeParse({ amount: "5" }).success).toBe(false);
    expect(tipRequestSchema.safeParse({}).success).toBe(false);
  });

  it("only allows same-site return paths", () => {
    expect(tipRequestSchema.parse({ amount: 5, returnPath: "/offers" }).returnPath).toBe("/offers");
    for (const returnPath of ["https://evil.example", "//evil.example", "/\\evil"]) {
      expect(tipRequestSchema.parse({ amount: 5, returnPath }).returnPath).toBe("/");
    }
  });
});

describe("createTipCheckoutSession", () => {
  it("creates a one-off GBP donation session that returns to the same page", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({ url: "https://checkout.stripe.com/c/pay/cs_test_abc" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const url = await createTipCheckoutSession("sk_test_x", {
      amountPence: 750,
      origin: "https://pearli-pi.vercel.app",
      returnPath: "/offers",
    });

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_abc");
    const [endpoint, init] = fetchMock.mock.calls[0]!;
    expect(endpoint).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe("Bearer sk_test_x");
    const form = init?.body as URLSearchParams;
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("gbp");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("750");
    expect(form.get("metadata[source]")).toBe("pearli-tip");
    expect(form.get("success_url")).toBe(
      "https://pearli-pi.vercel.app/offers?tip=success&amount=7.50",
    );
    expect(form.get("cancel_url")).toBe("https://pearli-pi.vercel.app/offers?tip=cancelled");
  });

  it("surfaces Stripe errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "Invalid API Key" } }, { status: 401 })),
    );
    await expect(
      createTipCheckoutSession("sk_test_bad", {
        amountPence: 100,
        origin: "http://x",
        returnPath: "/",
      }),
    ).rejects.toThrow(/401.*Invalid API Key/);
  });
});

describe("tipStatusForEvent", () => {
  it("maps checkout events to tip statuses", () => {
    expect(tipStatusForEvent(checkoutEvent("checkout.session.completed"))).toBe("paid");
    expect(
      tipStatusForEvent(checkoutEvent("checkout.session.completed", { payment_status: "unpaid" })),
    ).toBe("pending");
    expect(tipStatusForEvent(checkoutEvent("checkout.session.async_payment_succeeded"))).toBe(
      "paid",
    );
    expect(tipStatusForEvent(checkoutEvent("checkout.session.async_payment_failed"))).toBe(
      "failed",
    );
  });

  it("ignores other events and sessions that are not Pearli tips", () => {
    expect(tipStatusForEvent(checkoutEvent("checkout.session.expired"))).toBeNull();
    expect(tipStatusForEvent(checkoutEvent("payment_intent.succeeded"))).toBeNull();
    expect(
      tipStatusForEvent(checkoutEvent("checkout.session.completed", { metadata: {} })),
    ).toBeNull();
    expect(
      tipStatusForEvent(
        checkoutEvent("checkout.session.completed", { metadata: { source: "audiowallet" } }),
      ),
    ).toBeNull();
  });
});

describe("recordTip", () => {
  it("upserts the tip by session id with the secret key", async () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co/");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await recordTip(checkoutEvent("checkout.session.completed"), "paid");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proj.supabase.co/rest/v1/tips?on_conflict=stripe_session_id");
    const headers = init?.headers as Record<string, string>;
    expect(headers["apikey"]).toBe("sb_secret_test");
    expect(headers["Prefer"]).toContain("resolution=merge-duplicates");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stripe_session_id: "cs_test_123",
      stripe_payment_intent: "pi_test_123",
      amount_total: 500,
      currency: "gbp",
      status: "paid",
      livemode: false,
    });
  });

  it("never lets a pending event overwrite a final status", async () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await recordTip(
      checkoutEvent("checkout.session.completed", { payment_status: "unpaid" }),
      "pending",
    );
    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers["Prefer"]).toContain("resolution=ignore-duplicates");
  });

  it("fails loudly (so Stripe retries) when the database rejects the write", async () => {
    vi.stubEnv("SUPABASE_URL", "https://proj.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    await expect(recordTip(checkoutEvent("checkout.session.completed"), "paid")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("fails when Supabase is not configured", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await expect(recordTip(checkoutEvent("checkout.session.completed"), "paid")).rejects.toThrow(
      /not configured/,
    );
  });
});
