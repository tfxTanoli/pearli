import { createFileRoute } from "@tanstack/react-router";
import {
  getStripeWebhookSecret,
  verifyStripeSignature,
  type StripeCheckoutEvent,
} from "@/lib/stripe/stripe.server";
import { recordTip, tipStatusForEvent } from "@/lib/stripe/tips.server";

/**
 * POST /api/stripe/webhook — receives Stripe events. Only signed requests are
 * accepted; a non-2xx response makes Stripe retry, so failures to record a tip
 * return 500.
 */
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = getStripeWebhookSecret();
        if (!secret) {
          console.error("[stripe] STRIPE_WEBHOOK_SECRET is not set");
          return Response.json({ error: "Webhook not configured" }, { status: 503 });
        }

        // The signature covers the exact raw bytes, so read text, not JSON.
        const rawBody = await request.text();
        const valid = await verifyStripeSignature(
          rawBody,
          request.headers.get("stripe-signature"),
          secret,
        );
        if (!valid) return Response.json({ error: "Invalid signature" }, { status: 400 });

        let event: StripeCheckoutEvent;
        try {
          event = JSON.parse(rawBody) as StripeCheckoutEvent;
        } catch {
          return Response.json({ error: "Invalid payload" }, { status: 400 });
        }

        const status = tipStatusForEvent(event);
        if (status) {
          try {
            await recordTip(event, status);
          } catch (error) {
            console.error("[stripe] failed to record tip", event.data.object.id, error);
            return Response.json({ error: "Could not record tip" }, { status: 500 });
          }
        }
        return Response.json({ received: true });
      },
    },
  },
});
