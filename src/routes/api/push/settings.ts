import { createFileRoute } from "@tanstack/react-router";
import { getSubscriptionStore, isAuthorizedSender } from "@/lib/push/push-service.server";
import { getStorageStatus } from "@/lib/supabase.server";
import {
  getWelcomeSettings,
  saveWelcomeSettings,
  welcomeSettingsSchema,
} from "@/lib/push/welcome.server";

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Admin-only (Authorization: Bearer <PUSH_ADMIN_TOKEN>), used by /admin/notifications.
 * GET — subscriber count, welcome notification settings and storage status.
 * PUT — update the welcome notification.
 */
export const Route = createFileRoute("/api/push/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthorizedSender(request)) return unauthorized();
        const [subscriptions, welcome] = await Promise.all([
          getSubscriptionStore().list(),
          getWelcomeSettings(),
        ]);
        return Response.json(
          { subscribers: subscriptions.length, welcome, storage: getStorageStatus() },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
      PUT: async ({ request }) => {
        if (!isAuthorizedSender(request)) return unauthorized();
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          body = undefined;
        }
        const parsed = welcomeSettingsSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid welcome notification" },
            { status: 400 },
          );
        }
        await saveWelcomeSettings(parsed.data);
        return Response.json({ welcome: parsed.data });
      },
    },
  },
});
