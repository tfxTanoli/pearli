import { useState, type ReactNode } from "react";
import { enablePushNotifications, type PushOptInResult } from "@/lib/push/client";

const MESSAGES: Record<PushOptInResult, string> = {
  subscribed: "You’re in. Pearli will send you a notification when there’s something new.",
  unsupported: "This browser doesn’t support push notifications.",
  "ios-install-required":
    "On iPhone or iPad, add Pearli to your Home Screen (Share → Add to Home Screen), open it from there and tap again.",
  denied: "Notifications are blocked for this site. You can allow them in your browser settings.",
  dismissed: "No problem. Tap again whenever you’d like notifications.",
  unavailable: "Notifications aren’t available right now. Please try again later.",
  error: "Something went wrong turning on notifications. Please try again.",
};

/**
 * Opt-in button for push notifications. Styling is passed in by the page so
 * the button looks exactly as it did before it was wired up.
 */
export function PushOptInButton({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PushOptInResult | null>(null);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    setResult(await enablePushNotifications());
    setBusy(false);
  };

  return (
    <>
      <button type="button" onClick={onClick} aria-busy={busy} className={className}>
        {children}
      </button>
      <p
        role="status"
        className="mt-3 px-2 text-center text-xs leading-relaxed text-muted-foreground empty:hidden"
      >
        {result ? MESSAGES[result] : ""}
      </p>
    </>
  );
}
