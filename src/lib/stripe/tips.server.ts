import { getSupabaseConfig, supabaseRest } from "@/lib/supabase.server";
import { TIP_SOURCE, type StripeCheckoutEvent } from "./stripe.server";

export type TipStatus = "pending" | "paid" | "failed";

/** Maps a Checkout webhook event to the tip status it implies, or null to ignore it. */
export function tipStatusForEvent(event: StripeCheckoutEvent): TipStatus | null {
  const session = event.data.object;
  // The Stripe account may serve other apps: only record Pearli tips.
  if (session.object !== "checkout.session" || session.metadata?.["source"] !== TIP_SOURCE) {
    return null;
  }
  switch (event.type) {
    case "checkout.session.completed":
      return session.payment_status === "paid" ? "paid" : "pending";
    case "checkout.session.async_payment_succeeded":
      return "paid";
    case "checkout.session.async_payment_failed":
      return "failed";
    default:
      return null;
  }
}

/**
 * Records a tip idempotently (Stripe may deliver an event more than once).
 * A "pending" event never overwrites a final status that arrived first.
 */
export async function recordTip(event: StripeCheckoutEvent, status: TipStatus): Promise<void> {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SECRET_KEY)");
  const session = event.data.object;
  if (!session.amount_total || !session.currency) {
    throw new Error(`Checkout session ${session.id} has no amount`);
  }

  await supabaseRest(config, "tips?on_conflict=stripe_session_id", {
    method: "POST",
    headers: {
      Prefer: `resolution=${status === "pending" ? "ignore" : "merge"}-duplicates,return=minimal`,
    },
    body: {
      stripe_session_id: session.id,
      stripe_payment_intent: session.payment_intent,
      amount_total: session.amount_total,
      currency: session.currency,
      status,
      livemode: event.livemode,
      updated_at: new Date().toISOString(),
    },
  });
}
