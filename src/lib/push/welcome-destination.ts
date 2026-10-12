/**
 * Where the welcome push notification goes when it is clicked. It is the only
 * notification that opens an external site; the service worker (public/sw.js)
 * holds its own copy of this URL and a test keeps the two in sync.
 */
export const WELCOME_NOTIFICATION_URL = "https://efficient.app/deals";
