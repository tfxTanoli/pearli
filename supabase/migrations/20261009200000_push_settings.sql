-- Pearli: editable welcome notification, sent once to each new push subscriber.
-- A single settings row (id = 1), edited from /admin/notifications. Like the
-- other tables it is reachable only with the server-side secret key.

create table if not exists public.push_settings (
  id smallint primary key default 1 check (id = 1),
  welcome_enabled boolean not null default true,
  welcome_title text not null check (char_length(welcome_title) between 1 and 100),
  welcome_body text not null default '' check (char_length(welcome_body) <= 300),
  welcome_url text not null default '/',
  updated_at timestamptz not null default now()
);

insert into public.push_settings (id, welcome_title, welcome_body, welcome_url)
values (
  1,
  'Welcome to Pearli',
  'You’re subscribed. We’ll let you know when there’s something new from Pearli.',
  '/'
)
on conflict (id) do nothing;

alter table public.push_settings enable row level security;
revoke all on table public.push_settings from anon, authenticated;
