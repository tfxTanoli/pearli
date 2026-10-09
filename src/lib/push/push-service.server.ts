import { z } from "zod";
import { getSupabaseConfig } from "@/lib/supabase.server";
import { SupabaseSubscriptionStore } from "./supabase-subscription-store.server";
import { base64UrlDecode, sendWebPush, type VapidConfig } from "./web-push.server";

/**
 * Server-side Web Push plumbing: subscription validation, storage, admin auth
 * and broadcast. Only active subscriptions are stored — there is deliberately
 * no notification history.
 */

// Push services operated by the browser vendors. Restricting endpoints to these
// stops the subscribe API from being used to make the server POST to arbitrary
// URLs (SSRF).
const PUSH_SERVICE_HOST_SUFFIXES = [
  "fcm.googleapis.com", // Chrome, Edge (Android), Opera, Samsung Internet
  "android.googleapis.com",
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari (macOS, iOS/iPadOS home-screen apps)
  "notify.windows.com", // Edge (Windows)
];

function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    return PUSH_SERVICE_HOST_SUFFIXES.some(
      (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function base64UrlOfLength(length: number, check?: (bytes: Uint8Array) => boolean) {
  return z.string().refine((value) => {
    if (!/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return false;
    try {
      const bytes = base64UrlDecode(value.replace(/=+$/, ""));
      return bytes.length === length && (check?.(bytes) ?? true);
    } catch {
      return false;
    }
  });
}

/** Shape of `PushSubscription.toJSON()` as sent by the browser. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(isAllowedPushEndpoint, "Unsupported push endpoint"),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: base64UrlOfLength(65, (b) => b[0] === 0x04),
    auth: base64UrlOfLength(16),
  }),
});

export const unsubscribeSchema = z.object({
  endpoint: z.string().max(2048),
});

/** A notification to broadcast. `url` must be a same-origin path. */
export const notificationSchema = z.object({
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().max(300).default(""),
  url: z
    .string()
    .default("/")
    .refine((u) => u.startsWith("/") && !u.startsWith("//") && !u.includes("\\"), {
      message: "url must be a path on this site, e.g. /offers",
    }),
});

export type NotificationMessage = z.infer<typeof notificationSchema>;

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export interface SubscriptionStore {
  save(record: PushSubscriptionRecord): Promise<void>;
  remove(endpoint: string): Promise<boolean>;
  list(): Promise<PushSubscriptionRecord[]>;
}

/**
 * In-memory fallback used when Supabase is not configured (tests, quick local
 * runs). Records vanish on restart and are not shared between server
 * instances, so production uses the Supabase store.
 */
export class MemorySubscriptionStore implements SubscriptionStore {
  private records = new Map<string, PushSubscriptionRecord>();

  async save(record: PushSubscriptionRecord) {
    this.records.set(record.endpoint, record);
  }

  async remove(endpoint: string) {
    return this.records.delete(endpoint);
  }

  async list() {
    return [...this.records.values()];
  }
}

// Kept on globalThis so Vite's dev-server module reloads don't drop subscriptions.
const globalForPush = globalThis as typeof globalThis & {
  __pearliPushStore?: SubscriptionStore;
};

export function getSubscriptionStore(): SubscriptionStore {
  if (!globalForPush.__pearliPushStore) {
    const supabase = getSupabaseConfig();
    if (!supabase && process.env["NODE_ENV"] === "production") {
      console.warn(
        "[push] SUPABASE_URL/SUPABASE_SECRET_KEY missing: subscriptions are in memory only",
      );
    }
    globalForPush.__pearliPushStore = supabase
      ? new SupabaseSubscriptionStore(supabase)
      : new MemorySubscriptionStore();
  }
  return globalForPush.__pearliPushStore;
}

export function setSubscriptionStore(store: SubscriptionStore) {
  globalForPush.__pearliPushStore = store;
}

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"];
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < Math.max(aBytes.length, bBytes.length); i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

/**
 * Only callers holding PUSH_ADMIN_TOKEN (a server-side secret) may send. If the
 * token is not configured, sending is disabled entirely.
 */
export function isAuthorizedSender(request: Request): boolean {
  const expected = process.env["PUSH_ADMIN_TOKEN"];
  if (!expected || expected.length < 32) return false;
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  return token != null && timingSafeEqual(token, expected);
}

export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  removed: number;
}

export async function broadcastNotification(
  message: NotificationMessage,
  vapid: VapidConfig,
  store: SubscriptionStore = getSubscriptionStore(),
): Promise<BroadcastResult> {
  const payload = JSON.stringify(message);
  const subscriptions = await store.list();
  const result: BroadcastResult = { total: subscriptions.length, sent: 0, failed: 0, removed: 0 };

  const outcomes = await Promise.allSettled(
    subscriptions.map((sub) => sendWebPush(sub, payload, vapid)),
  );

  await Promise.all(
    outcomes.map(async (outcome, i) => {
      const subscription = subscriptions[i]!;
      if (
        outcome.status === "fulfilled" &&
        outcome.value.status >= 200 &&
        outcome.value.status < 300
      ) {
        result.sent++;
        return;
      }
      result.failed++;
      if (outcome.status === "fulfilled" && outcome.value.gone) {
        // Expired or unsubscribed in the browser: stop sending to it.
        if (await store.remove(subscription.endpoint)) result.removed++;
      } else {
        // Network errors carry the useful detail (DNS, TLS, reset) in `cause`.
        const reason =
          outcome.status === "rejected"
            ? (outcome.reason?.cause ?? outcome.reason)
            : `HTTP ${outcome.value.status}`;
        console.warn("[push] delivery failed", new URL(subscription.endpoint).host, reason);
      }
    }),
  );

  return result;
}
