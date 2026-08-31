-- Parking Pass Tracker — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).

-- ---------------------------------------------------------------------------
-- passes: one row per physical parking pass (001 .. 050)
-- ---------------------------------------------------------------------------
create table if not exists public.passes (
  id               text primary key,
  status           text not null default 'available'
                     check (status in ('available', 'out')),
  holder_name      text,
  holder_email     text,
  holder_type      text check (holder_type in ('regular', 'occasional')),
  issued_at        timestamptz,
  reminder_count   integer not null default 0,
  last_reminded_at timestamptz,
  notes            text
);

-- ---------------------------------------------------------------------------
-- transactions: append-only log of every issue / return / reminder
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id             uuid primary key default gen_random_uuid(),
  pass_id        text not null references public.passes(id),
  action         text not null
                   check (action in ('issued', 'returned', 'reminded')),
  holder_name    text,
  holder_email   text,
  holder_type    text,
  issued_at      timestamptz,
  returned_at    timestamptz,
  duration_hours double precision,
  created_at     timestamptz not null default now()
);

create index if not exists transactions_pass_id_idx  on public.transactions (pass_id);
create index if not exists transactions_action_idx   on public.transactions (action);
create index if not exists transactions_created_idx  on public.transactions (created_at desc);
create index if not exists passes_status_idx         on public.passes (status);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- All access goes through Next.js API routes using the service role key,
-- which bypasses RLS. We enable RLS with no policies so the anon key
-- cannot read or write these tables directly.
-- ---------------------------------------------------------------------------
alter table public.passes       enable row level security;
alter table public.transactions enable row level security;

-- ---------------------------------------------------------------------------
-- Seed passes 001 .. 050 as available
-- ---------------------------------------------------------------------------
insert into public.passes (id, status)
select lpad(g::text, 3, '0'), 'available'
from generate_series(1, 50) as g
on conflict (id) do nothing;
