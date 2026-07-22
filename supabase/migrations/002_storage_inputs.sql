-- 002_storage_inputs.sql — the private input-files bucket for T4.
--
-- File inputs (extraction datasets) are stored as {"file_ref":
-- "storage://goldsmith-inputs/<dataset>/<ulid>.<ext>"} and previewed through
-- short-lived signed URLs. The bytes live in a PRIVATE Storage bucket named
-- goldsmith-inputs.
--
-- Like 001_init.sql, the browser talks to Storage with the anon key, so this
-- migration mirrors that file's RLS model: it confines the anon/authenticated
-- roles to THIS bucket only. The shared project's other bucket(s) (e.g.
-- docflow's `documents`) keep their own owner-only policies and stay invisible
-- to the goldsmith anon key. See docs/decisions.md (T4).
--
-- Idempotent: safe to re-run. Storage's `storage.buckets` / `storage.objects`
-- tables already exist and already have RLS enabled by Supabase; we only add
-- the bucket row and the goldsmith-scoped policies.

-- The bucket (private: public = false). on conflict keeps a re-run harmless.
insert into storage.buckets (id, name, public)
values ('goldsmith-inputs', 'goldsmith-inputs', false)
on conflict (id) do nothing;

-- storage.objects policies, scoped to bucket_id = 'goldsmith-inputs'. Full
-- access (read/insert/update/delete) for the single-user anon key; signed-URL
-- creation and preview both require select, uploads require insert.
drop policy if exists goldsmith_inputs_select on storage.objects;
create policy goldsmith_inputs_select on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_insert on storage.objects;
create policy goldsmith_inputs_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_update on storage.objects;
create policy goldsmith_inputs_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'goldsmith-inputs')
  with check (bucket_id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_delete on storage.objects;
create policy goldsmith_inputs_delete on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'goldsmith-inputs');

-- storage.buckets policies, scoped to the same id. `select` lets the app's
-- ensureInputsBucket() see the bucket already exists; `insert` lets it
-- "create programmatically if absent" (T4) on a fresh project — both confined
-- to the goldsmith-inputs id so the anon key can neither see nor create other
-- buckets.
drop policy if exists goldsmith_inputs_bucket_select on storage.buckets;
create policy goldsmith_inputs_bucket_select on storage.buckets
  for select to anon, authenticated
  using (id = 'goldsmith-inputs');

drop policy if exists goldsmith_inputs_bucket_insert on storage.buckets;
create policy goldsmith_inputs_bucket_insert on storage.buckets
  for insert to anon, authenticated
  with check (id = 'goldsmith-inputs');
