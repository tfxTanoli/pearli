-- Pearli: tips recorded from Stripe webhooks, and active Web Push subscriptions.
-- Both tables are written only by the server using the Supabase secret key
-- (which bypasses RLS). RLS is on with no policies, and the public API roles
-- have no grants, so the publishable/anon key can neither read nor write them.

create table if not exists public.tips (
  stripe_session_id text primary key,
  stripe_payment_intent text,
  amount_total integer not null check (amount_total > 0),
  currency text not null,
  status text not null check (status in ('pending', 'paid', 'failed')),
  livemode boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Active subscriptions only; there is deliberately no notification history.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tips enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.tips from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
