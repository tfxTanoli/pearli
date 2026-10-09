import { z } from "zod";
import { getSupabaseConfig, supabaseRest } from "@/lib/supabase.server";
import {
  getSubscriptionStore,
  getVapidConfig,
  notificationSchema,
  type SubscriptionStore,
} from "./push-service.server";
import { sendWebPush, type PushTarget } from "./web-push.server";

/** The welcome notification sent once to each new subscriber. */
export const welcomeSettingsSchema = notificationSchema.extend({ enabled: z.boolean() });

export type WelcomeSettings = z.infer<typeof welcomeSettingsSchema>;

export const DEFAULT_WELCOME: WelcomeSettings = {
  enabled: true,
  title: "Welcome to Pearli",
  body: "You’re subscribed. We’ll let you know when there’s something new from Pearli.",
  url: "/",
};

interface Row {
  welcome_enabled: boolean;
  welcome_title: string;
  welcome_body: string;
  welcome_url: string;
}

// Fallback when Supabase is not configured (tests, quick local runs).
const globalForWelcome = globalThis as typeof globalThis & { __pearliWelcome?: WelcomeSettings };

export async function getWelcomeSettings(): Promise<WelcomeSettings> {
  const config = getSupabaseConfig();
  if (!config) return globalForWelcome.__pearliWelcome ?? DEFAULT_WELCOME;
  const rows = await supabaseRest<Row[]>(
    config,
    "push_settings?id=eq.1&select=welcome_enabled,welcome_title,welcome_body,welcome_url",
  );
  const row = rows?.[0];
  if (!row) return DEFAULT_WELCOME;
  return {
    enabled: row.welcome_enabled,
    title: row.welcome_title,
    body: row.welcome_body,
    url: row.welcome_url,
  };
}

export async function saveWelcomeSettings(settings: WelcomeSettings): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) {
    globalForWelcome.__pearliWelcome = settings;
    return;
  }
  await supabaseRest(config, "push_settings?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: {
      id: 1,
      welcome_enabled: settings.enabled,
      welcome_title: settings.title,
      welcome_body: settings.body,
      welcome_url: settings.url,
      updated_at: new Date().toISOString(),
    },
  });
}

export type WelcomeOutcome = "sent" | "disabled" | "not-configured" | "gone" | "failed";

/**
 * Sends the welcome notification to one new subscriber. Never throws: a failed
 * welcome must not undo the subscription itself.
 */
export async function welcomeNewSubscriber(
  target: PushTarget,
  store: SubscriptionStore = getSubscriptionStore(),
): Promise<WelcomeOutcome> {
  try {
    const vapid = getVapidConfig();
    if (!vapid) return "not-configured";
    const welcome = await getWelcomeSettings();
    if (!welcome.enabled) return "disabled";

    const { title, body, url } = welcome;
    const result = await sendWebPush(target, JSON.stringify({ title, body, url }), vapid);
    if (result.gone) {
      await store.remove(target.endpoint);
      return "gone";
    }
    if (result.status >= 200 && result.status < 300) return "sent";
    console.warn("[push] welcome notification rejected", `HTTP ${result.status}`);
    return "failed";
  } catch (error) {
    console.warn("[push] welcome notification failed", error);
    return "failed";
  }
}
