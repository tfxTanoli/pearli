import { createFileRoute } from "@tanstack/react-router";
import {
  createTipCheckoutSession,
  getStripeSecretKey,
  tipRequestSchema,
} from "@/lib/stripe/stripe.server";

/** POST /api/stripe/checkout — starts Stripe Checkout for a tip; returns { url }. */
export const Route = createFileRoute("/api/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secretKey = getStripeSecretKey();
        if (!secretKey) {
          return Response.json({ error: "Tipping is not available right now" }, { status: 503 });
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          body = undefined;
        }
        const parsed = tipRequestSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.issues[0]?.message ?? "Invalid tip" },
            { status: 400 },
          );
        }

        try {
          const url = await createTipCheckoutSession(secretKey, {
            amountPence: parsed.data.amount,
            origin: new URL(request.url).origin,
            returnPath: parsed.data.returnPath,
          });
          return Response.json({ url });
        } catch (error) {
          console.error("[stripe] checkout session failed", error);
          return Response.json({ error: "Could not start checkout" }, { status: 502 });
        }
      },
    },
  },
});
