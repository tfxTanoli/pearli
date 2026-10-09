import { createFileRoute } from "@tanstack/react-router";
import { getVapidConfig } from "@/lib/push/push-service.server";

/** GET /api/push/config — the public VAPID key browsers need to subscribe. */
export const Route = createFileRoute("/api/push/config")({
  server: {
    handlers: {
      GET: async () => {
        const vapid = getVapidConfig();
        if (!vapid) {
          return Response.json({ error: "Push notifications are not configured" }, { status: 503 });
        }
        return Response.json(
          { publicKey: vapid.publicKey },
          { headers: { "Cache-Control": "no-store" } },
        );
      },
    },
  },
});
