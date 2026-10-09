import { createFileRoute } from "@tanstack/react-router";
import {
  broadcastNotification,
  getVapidConfig,
  isAuthorizedSender,
  notificationSchema,
} from "@/lib/push/push-service.server";

/**
 * POST /api/push/send — broadcast a notification to every active subscription.
 * Requires `Authorization: Bearer <PUSH_ADMIN_TOKEN>`; never call this from
 * browser code.
 */
export const Route = createFileRoute("/api/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedSender(request)) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const vapid = getVapidConfig();
        if (!vapid) {
          return Response.json({ error: "Push notifications are not configured" }, { status: 503 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          body = undefined;
        }
        const parsed = notificationSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: "Invalid notification", issues: parsed.error.issues },
            { status: 400 },
          );
        }

        const result = await broadcastNotification(parsed.data, vapid);
        return Response.json(result);
      },
    },
  },
});
