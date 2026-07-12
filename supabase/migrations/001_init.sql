-- 001_init.sql — goldsmith core tables.
--
-- Tables are reproduced verbatim from the DDL contract in docs/PLAN.md
-- (datasets, examples, dataset_versions). The RLS block at the end is NOT in
-- that DDL block; it is required by CLAUDE.md rule 7 ("RLS pins everything to
-- my account") and by the T1 DoD ("RLS confines it"). See docs/decisions.md.
--
-- This runs against the shared meter-dev project. It only CREATEs the three
-- new goldsmith tables; it never touches llm_calls, budgets, or docflow tables.

create table datasets (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,             -- "docflow-invoices"
  title text not null,
  preset text not null check (preset in ('extraction','routing','qa','classification','custom')),
  json_schema jsonb not null,            -- schema for `expected`
  current_version int not null default 1,
  created_at timestamptz not null default now()
);

create table examples (
  id text primary key,                   -- ulid
  dataset_id uuid not null references datasets(id) on delete cascade,
  version_added int not null,
  active boolean not null default true,
  input jsonb not null,
  expected jsonb not null,
  tags text[] not null default '{}',
  provenance text not null check (provenance in ('human_only','ai_drafted+human_verified')),
  ai_draft jsonb,                        -- original AI proposal, if any
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index on examples (dataset_id, active);

create table dataset_versions (
  dataset_id uuid references datasets(id) on delete cascade,
  version int not null,
  note text,
  frozen_at timestamptz,
  primary key (dataset_id, version)
);

-- Row-level security. This is a single-user tool with no login: the browser
-- uses the anon key (CLAUDE.md rule 7, "no auth complexity"). Enabling RLS and
-- granting the anon/authenticated roles full access to *these three tables
-- only* confines the anon key to goldsmith data — the shared project's
-- llm_calls / budgets / docflow tables keep their own owner-only RLS, so the
-- same anon key sees nothing there.
alter table datasets enable row level security;
alter table examples enable row level security;
alter table dataset_versions enable row level security;

create policy goldsmith_all on datasets
  for all to anon, authenticated using (true) with check (true);
create policy goldsmith_all on examples
  for all to anon, authenticated using (true) with check (true);
create policy goldsmith_all on dataset_versions
  for all to anon, authenticated using (true) with check (true);
