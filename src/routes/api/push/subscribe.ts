import { createFileRoute } from "@tanstack/react-router";
import {
  getSubscriptionStore,
  pushSubscriptionSchema,
  unsubscribeSchema,
} from "@/lib/push/push-service.server";

const MAX_BODY_BYTES = 4096;

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * POST   /api/push/subscribe — register (or refresh) a browser push subscription.
 * DELETE /api/push/subscribe — forget one, by endpoint.
 */
export const Route = createFileRoute("/api/push/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = pushSubscriptionSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return Response.json({ error: "Invalid push subscription" }, { status: 400 });
        }
        const { endpoint, keys } = parsed.data;
        await getSubscriptionStore().save({
          endpoint,
          keys,
          createdAt: new Date().toISOString(),
        });
        return Response.json({ ok: true }, { status: 201 });
      },
      DELETE: async ({ request }) => {
        const parsed = unsubscribeSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }
        await getSubscriptionStore().remove(parsed.data.endpoint);
        return new Response(null, { status: 204 });
      },
    },
  },
});
