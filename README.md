# Pearli

Create a link in bio type of landing page called Pearli that showcases the web app AudioWallet and a coming soon web app which is Market Notes. On the top right hand corner, create a button called Tip Pearli. When the Tip Pearli button is pressed, it should open a pop up box where users can select an amount, it being £1, £5, £10 and Custom. Create a button called Access discounts from ChatGPT + more. For now the button shouldn’t do anything. Make the colour of the website pearl white and black.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/49fa54be-cdbb-4e07-a66d-356e364e0950).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Push notifications (Web Push)

The "Access discounts from ChatGPT + more" button subscribes the visitor to
browser push notifications using the standard Web Push API and the service
worker in `public/sw.js`. Nothing needs installing: it works in Chrome, Edge,
Firefox and Safari on desktop and Android. On iPhone/iPad (iOS 16.4+) the
visitor must first add Pearli to the Home Screen; the button explains this.

Only active subscriptions are stored. There is no notification history.

### Configuration

Set these as **server-side secrets** (never `VITE_*`, never committed). See
`.env.example`. Generate a key pair and admin token with:

```sh
node scripts/generate-vapid-keys.mjs
```

| Variable            | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | Public key sent to browsers via `GET /api/push/config`    |
| `VAPID_PRIVATE_KEY` | Signs requests to push services. Secret.                  |
| `VAPID_SUBJECT`     | Contact, e.g. `mailto:you@example.com`                    |
| `PUSH_ADMIN_TOKEN`  | Bearer token for `POST /api/push/send` (32+ chars). Secret. |

Use separate keys for development and production. Changing the VAPID key pair
in production invalidates existing subscriptions (browsers re-subscribe the
next time the visitor taps the button).

### Sending a notification

From a trusted server or terminal only:

```sh
curl -X POST https://<your-site>/api/push/send \
  -H "Authorization: Bearer $PUSH_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"New on Pearli","body":"Take a look","url":"/offers"}'
```

`url` must be a path on this site. The response reports
`{ total, sent, failed, removed }`. Subscriptions the push service reports as
expired (404/410) are removed automatically.

### Subscription storage

Subscriptions are stored in the Supabase table `push_subscriptions` (see
`supabase/migrations/`). If `SUPABASE_URL`/`SUPABASE_SECRET_KEY` are not set,
an in-memory store is used instead, which is only suitable for tests.

## Tips (Stripe Checkout)

"Give a tip" opens the amount picker; confirming calls `POST /api/stripe/checkout`,
which creates a Stripe Checkout Session (GBP, £1–£500) and redirects to Stripe.
After paying, the visitor returns to the same page and sees the thank-you screen.

Stripe then calls `POST /api/stripe/webhook`. The signature is verified with
`STRIPE_WEBHOOK_SECRET`, and `checkout.session.completed`,
`checkout.session.async_payment_succeeded` and
`checkout.session.async_payment_failed` events for Pearli tips are recorded in
the Supabase table `tips` (amount, currency, status, test/live mode; no customer
details). Sessions created by other apps on the same Stripe account are ignored.

In the Stripe Dashboard the webhook endpoint should send at least the three
events above to `https://<your-site>/api/stripe/webhook`.

Local webhook testing with the Stripe CLI:

```sh
stripe listen --forward-to localhost:<port>/api/stripe/webhook
# put the whsec_ it prints into .env as STRIPE_WEBHOOK_SECRET, restart `npm run dev`
stripe trigger checkout.session.completed
```

## Database (Supabase)

Schema lives in `supabase/migrations/`. Both tables have row-level security
enabled with no policies and no grants for `anon`/`authenticated`, so they are
only reachable with the server-side secret key. Apply migrations with the
Supabase CLI (`supabase db push`) or the SQL editor.

## Environment variables

See `.env.example`. Locally, `npm run dev` reads `.env`. In production they are
set in Vercel (Project → Settings → Environment Variables).
