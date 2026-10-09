/**
 * Browser side of Web Push: permission, service worker registration and
 * subscription. Call `enablePushNotifications` from a click handler — browsers
 * only allow the permission prompt after a user gesture.
 */

export type PushOptInResult =
  | "subscribed"
  | "unsupported"
  | "ios-install-required"
  | "denied"
  | "dismissed"
  | "unavailable"
  | "error";

export const SERVICE_WORKER_URL = "/sw.js";

function isIOS(): boolean {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.length) return false;
  const view = new Uint8Array(a);
  return view.every((byte, i) => byte === b[i]);
}

export async function enablePushNotifications(): Promise<PushOptInResult> {
  if (!isPushSupported()) {
    // iOS/iPadOS only expose Web Push to sites added to the Home Screen.
    return typeof navigator !== "undefined" && isIOS() ? "ios-install-required" : "unsupported";
  }
  if (Notification.permission === "denied") return "denied";

  try {
    // Ask first, while the click's user activation is still fresh (Safari and
    // Firefox reject prompts that follow other awaited work).
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "denied") return "denied";
    if (permission !== "granted") return "dismissed";

    const configResponse = await fetch("/api/push/config");
    if (!configResponse.ok) return "unavailable";
    const { publicKey } = (await configResponse.json()) as { publicKey?: string };
    if (!publicKey) return "unavailable";
    const applicationServerKey = base64UrlToBytes(publicKey);

    await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
      // Subscribed under an old VAPID key: replace it.
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const saveResponse = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    return saveResponse.ok ? "subscribed" : "error";
  } catch (error) {
    console.error("[push] could not enable notifications", error);
    return "error";
  }
}
