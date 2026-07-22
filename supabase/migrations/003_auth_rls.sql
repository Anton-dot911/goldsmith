-- 003_auth_rls.sql — deploy-readiness auth hardening (T5.5).
--
-- Replaces the permissive T1/T2 anon policies with authenticated-only ones.
-- Goldsmith is a single-user tool behind Supabase Auth magic-link login: once
-- logged in, the browser's requests carry an `authenticated` JWT, so the tables
-- only need to admit that role. The bare anon key (shipped in the bundle) can no
-- longer read or write goldsmith data.
--
-- Scope note: this runs against the shared meter-dev project. It only touches
-- the goldsmith tables, the goldsmith storage bucket policies, and adds one tiny
-- keepalive view. It never touches llm_calls / budgets / docflow.
--
-- Idempotent-ish: drops the named policies first so a re-run is safe.

-- ---------------------------------------------------------------------------
-- Core tables: authenticated-only.
-- ---------------------------------------------------------------------------
drop policy if exists goldsmith_all on datasets;
drop policy if exists goldsmith_all on examples;
drop policy if exists goldsmith_all on dataset_versions;

create policy goldsmith_auth on datasets
  for all to authenticated using (true) with check (true);
create policy goldsmith_auth on examples
  for all to authenticated using (true) with check (true);
create policy goldsmith_auth on dataset_versions
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Storage: the goldsmith-inputs bucket is authenticated-only too. Uploads and
-- bucket introspection now require a logged-in session. Preview downloads keep
-- working: they go through short-lived signed URLs (a signed token authorizes
-- the object directly, no anon policy needed), and the ai-draft function reads
-- files with the service role key server-side.
-- ---------------------------------------------------------------------------
drop policy if exists goldsmith_inputs_select on storage.objects;
create policy goldsmith_inputs_select on storage.objects
  for select to authenticated
  using (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_insert on storage.objects;
create policy goldsmith_inputs_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_update on storage.objects;
create policy goldsmith_inputs_update on storage.objects
  for update to authenticated
  using (bucket_id = 'goldsmith-inputs')
  with check (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_delete on storage.objects;
create policy goldsmith_inputs_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_bucket_select on storage.buckets;
create policy goldsmith_inputs_bucket_select on storage.buckets
  for select to authenticated
  using (id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_bucket_insert on storage.buckets;
create policy goldsmith_inputs_bucket_insert on storage.buckets
  for insert to authenticated
  with check (id = 'goldsmith-inputs');

-- ---------------------------------------------------------------------------
-- Keepalive: the GitHub Actions keepalive job (.github/workflows/keepalive.yml)
-- pings the DB every 2 days with the ANON key so the free-tier project never
-- idles into a pause. Now that datasets is authenticated-only, that ping can no
-- longer read it. Rather than punch an anon hole in a real table, expose a tiny
-- constant view the anon role may select — it touches no goldsmith data, so it
-- warms the project without leaking anything. The workflow points at this view.
-- ---------------------------------------------------------------------------
create or replace view public.keepalive as select true as ok;
grant select on public.keepalive to anon, authenticated;
