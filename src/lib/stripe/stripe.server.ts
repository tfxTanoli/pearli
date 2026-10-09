import { z } from "zod";

/**
 * Server-only Stripe helpers: Checkout Session creation for tips and webhook
 * signature verification. Talks to Stripe's REST API with fetch and verifies
 * signatures with Web Crypto, so no SDK is needed.
 */

export const TIP_SOURCE = "pearli-tip";
export const MIN_TIP_PENCE = 100; // £1
export const MAX_TIP_PENCE = 50_000; // £500

export function getStripeSecretKey(): string | null {
  return process.env["STRIPE_SECRET_KEY"] || null;
}

export function getStripeWebhookSecret(): string | null {
  return process.env["STRIPE_WEBHOOK_SECRET"] || null;
}

/** Same-origin path the visitor returns to after Checkout. */
const returnPathSchema = z
  .string()
  .max(200)
  .refine((p) => p.startsWith("/") && !p.startsWith("//") && !p.includes("\\"))
  .catch("/");

export const tipRequestSchema = z.object({
  /** Amount in pounds, e.g. 5 or 7.50. */
  amount: z
    .number()
    .finite()
    // Whole pence only (tolerates float noise such as 0.29 * 100 = 28.999…).
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "At most 2 decimals")
    .transform((n) => Math.round(n * 100))
    .refine((pence) => pence >= MIN_TIP_PENCE && pence <= MAX_TIP_PENCE, {
      message: `Tips must be between £${MIN_TIP_PENCE / 100} and £${MAX_TIP_PENCE / 100}`,
    }),
  returnPath: returnPathSchema.optional().default("/"),
});

export type TipRequest = z.infer<typeof tipRequestSchema>;

/** Creates a Stripe Checkout Session for one tip and returns its hosted URL. */
export async function createTipCheckoutSession(
  secretKey: string,
  { amountPence, origin, returnPath }: { amountPence: number; origin: string; returnPath: string },
): Promise<string> {
  const pounds = amountPence / 100;
  const display = Number.isInteger(pounds) ? String(pounds) : pounds.toFixed(2);
  const returnUrl = new URL(returnPath, origin);

  const success = new URL(returnUrl);
  success.searchParams.set("tip", "success");
  success.searchParams.set("amount", display);
  const cancel = new URL(returnUrl);
  cancel.searchParams.set("tip", "cancelled");

  const form = new URLSearchParams({
    mode: "payment",
    submit_type: "donate",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "gbp",
    "line_items[0][price_data][unit_amount]": String(amountPence),
    "line_items[0][price_data][product_data][name]": "Tip for Pearli",
    "metadata[source]": TIP_SOURCE,
    "payment_intent_data[metadata][source]": TIP_SOURCE,
    success_url: success.toString(),
    cancel_url: cancel.toString(),
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });
  const body = (await response.json()) as { url?: string; error?: { message?: string } };
  if (!response.ok || !body.url) {
    throw new Error(`Stripe Checkout failed (HTTP ${response.status}): ${body.error?.message}`);
  }
  return body.url;
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verifies a `Stripe-Signature` header (scheme v1: HMAC-SHA256 over
 * "<timestamp>.<raw body>"). Rejects stale timestamps to stop replays.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  { toleranceSeconds = 300, now = Date.now() } = {},
): Promise<boolean> {
  if (!header) return false;
  let timestamp: string | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s.trim());
    if (key === "t") timestamp = value;
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)),
  );
  return signatures.some((sig) => timingSafeEqualHex(sig, expected));
}

/** The parts of a Stripe event this app reads. */
export interface StripeCheckoutEvent {
  type: string;
  livemode: boolean;
  data: {
    object: {
      id: string;
      object: string;
      amount_total: number | null;
      currency: string | null;
      payment_status: string;
      payment_intent: string | null;
      metadata: Record<string, string> | null;
    };
  };
}
