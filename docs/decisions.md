# Decisions

Running log of non-obvious choices. Rule 1: the export format
(`spec/export.schema.json`) changes only with a version bump and a note here.

---

## T1 — Scaffold + schema (2026-07-12)

### Scaffold source

Generated with `npx github:Anton-dot911/Project-Scaffolder goldsmith
--template ts-fullstack`. The template produces a pnpm workspace of
`web/` (React 18 + Vite + TS strict + Tailwind), `shared/` (zod wire
contracts, source-only), and `service/` (Fastify + a metered Anthropic
`llm/` layer).

### Adaptations from the `ts-fullstack` template → goldsmith structure

These are the friction points between the template's shape and this project's
CLAUDE.md structure. They feed Scaffolder T8 (a possible `web + supabase +
netlify` template variant).

1. **Dropped `service/` (Fastify), added `netlify/functions/`.** CLAUDE.md
   puts all backend code in Netlify Functions and only for the AI pre-label
   call (rule 5). The whole Fastify package — `app.ts`, `index.ts`, health
   route, its tests and vitest configs — was removed. The metered-Anthropic
   `llm/client.ts` pattern the template shipped is the pattern the T5
   `ai-draft.ts` function will follow (Meter, project `goldsmith`), so it was
   dropped now and will be reintroduced inside the function in T5.
   - `pnpm-workspace.yaml`: removed `service`, kept `shared` + `web`.
   - Root `package.json`: removed `meter-ts` from `onlyBuiltDependencies`
     (it came in via the service dep).
   - Removed the `service` job from `.github/workflows/ci.yml`.
   - `netlify.toml` added at the root (build = web, functions dir declared,
     SPA redirect). `netlify/functions/README.md` documents what lands there
     in T5. No function exists yet — T1 is scaffold + datasets page only.

2. **`shared/` repurposed.** The template's `healthResponseSchema` (the
   web↔service demo contract) was replaced with goldsmith domain types:
   `presetSchema`, `datasetInputSchema`, `datasetRowSchema`, `provenanceSchema`.
   `shared/` stays source-only, zod-only.

3. **Web talks to Supabase directly.** Datasets CRUD uses `@supabase/supabase-js`
   with the anon key from the browser (`web/src/lib/supabase.ts`); no function
   is involved. Added deps to `web/`: `@supabase/supabase-js`, `ajv`,
   `ajv-formats`, and `@types/node` (the vite config and integration test use
   node built-ins / `process.env`). Removed the template's `/health` Vite proxy
   and the `lib/api.ts` + `tests/api.test.ts` demo.

4. **`@spec` alias.** The four preset JSON Schemas live in `spec/presets/`
   (canonical, per CLAUDE.md) and are imported by the web app and its tests via
   a `@spec` → repo-root `spec/` alias, wired in `web/vite.config.ts`,
   `web/vitest.config.ts`, and `web/tsconfig.json` (`paths` + `resolveJsonModule`
   - `esModuleInterop` for ajv's CJS default import). `server.fs.allow` lets the
     dev server read `spec/` (outside `web/`).

### Migration RLS — deviation from the PLAN.md DDL, flagged

`supabase/migrations/001_init.sql` reproduces the three `create table`
statements **verbatim** from the PLAN.md DDL contract. It then **appends** an
RLS block that is not in that DDL: `enable row level security` on all three
tables plus a permissive `for all to anon, authenticated` policy on each.

Reason: CLAUDE.md rule 7 requires RLS, and the T1 DoD requires "RLS confines
it", but the PLAN.md DDL block itself carries no RLS. Since this is a
single-user tool with no login (rule 7: "no auth complexity"), the only
coherent model is: the browser's anon key gets full access to the three
goldsmith tables, while the shared meter-dev project's `llm_calls` / `budgets`
/ docflow tables keep their existing owner-only RLS — so the same anon key is
confined away from them. The integration test asserts both halves (goldsmith
row round-trips; `llm_calls` returns `[]` under anon).

This is the one place the migration is more than the verbatim DDL. Surfaced at
the migration-approval pause rather than changed silently.

### Preset default schemas

`spec/presets/{extraction,routing,qa,classification}.schema.json` are draft-07
JSON Schemas matching the input/expected conventions in PLAN.md. `extraction`
ships an invoice-shaped placeholder the user replaces with their real
extractor schema; `routing`/`qa`/`classification` encode their fixed expected
shapes. `custom` has no preset file — the form prefills a minimal open object.

---

## T2 — Examples core + validation (2026-07-13)

### Revisioning model: one row per id, `revision` bumped in place

The task offered two ways to satisfy rule 3 ("edits create a new revision"):
keep one row per example id and bump `revision` in place, or keep revision
history rows. **Chose in-place bump** — the simpler option that the existing
schema already dictates:

- `examples.id` is `text primary key` in the 001 DDL — one row per id. History
  rows would need a composite key or a separate table, i.e. a migration, and
  the T2 brief says no migration is expected.
- The export contract consumes _active examples of a version_, not history, so
  prior revision bodies are never exported. Keeping them would be dead weight.

What this preserves: the example `id` is stable forever (rule 3, export
contract), an edit is always a _new revision of the same id_ (`revision + 1`,
`updated_at` bumped, other identity fields untouched), and "delete" is
`active=false` with symmetric reactivation — a row is never removed. The
trade-off consciously accepted: the _previous expected value_ is overwritten in
place rather than retained. The hard-cases signal that rule 4 cares about (AI
draft vs final) is captured separately in `ai_draft` (T5), not in revision
history, so nothing of eval value is lost. `revision` is the count of human
edits, and the `updated_at`/`revision` pair is the audit trail.

Implementation split: the rules are pure functions in
`web/src/lib/example-model.ts` (`newExampleInsert`, `reviseExample`,
`setActive`, `activeExamples`) so they unit-test without a database;
`web/src/lib/examples.ts` maps them onto Supabase calls. On an edit-update we
set `revision` and `updated_at` explicitly — the DDL `now()` default only fires
on insert.

### Example ids: `ex_` + ULID

Ids are `ex_` followed by a 26-char Crockford-base32 ULID
(`web/src/lib/ulid.ts`), matching the export contract's `"id": "ex_01J..."`.
ULID (time-ordered + random) gives stable, sortable, collision-free ids
generated client-side at creation — no DB round-trip, stable across versions.
Kept dependency-free (small pure module) rather than adding the `ulid` package.

### Save-gate errors (rule 2)

`web/src/lib/validate.ts` compiles the dataset's `json_schema` with the same
ajv config as `lib/schema.ts` (`strict:false`, `allErrors:true`, formats) and
maps each `ErrorObject` to a `{ path, message }` row. For `required` /
`additionalProperties` the offending property name is folded into the path so a
missing `amount` reads as path `amount` (not the parent). This gives the
human-readable list the form renders — never a JSON dump. The null-vs-missing
distinction falls out of JSON Schema semantics: a missing required field yields
a `required` error, whereas `field: null` yields a `type` error (present but
wrong type), and both are asserted in `web/tests/validate.test.ts`.

### Provenance / version stamping

Manual adds are `human_only` (rule 4; the AI path is T5). `version_added` is
stamped from the dataset's `current_version` at insert. `active`, `revision`,
`ai_draft`, and timestamps ride the DDL defaults on insert.

### Navigation

No router added yet — `App.tsx` holds a single `selected: DatasetRow | null` in
state; clicking a dataset row opens `DatasetDetail`. A real router lands with
the Label/Import routes in T4.

---

## T4 — Two-pane labeling + file inputs (2026-07-22)

### Unlabeled marker: `active=false` + empty `expected` (no schema/contract change)

Bulk import creates _unlabeled_ examples (input set, no expected yet). The one
hard requirement — an unlabeled row must **never** leak into an export — is
carried entirely by **`active=false`**: the export takes only _active_ examples
of a version (rule 3 / `activeExamples`), so it can never emit an unlabeled row
no matter what its `expected` holds. That keeps the export contract
(`spec/export.schema.json`) and the DDL untouched — no migration, no new column.

`examples.expected` is `jsonb NOT NULL` (001 DDL), so "no expected yet" is
stored as an **empty object `{}`**, not JSON null (PostgREST maps JSON `null` →
SQL NULL, which the column rejects). `isUnlabeled(row) = !active &&
expected == {}` is therefore the queue marker. This is used **only for UI
classification** (label-queue ordering, the "unlabeled" badge/count, and the
label-vs-revise branch in `saveLabel`); export-safety does not depend on it.

- The only ambiguity: a `custom`-preset example legitimately labeled `{}` and
  then deactivated would read as "unlabeled" in the label queue. It is a display
  quirk, never an export risk (still `active=false`). The four real presets
  require fields, and the ajv save-gate blocks an empty label, so a non-custom
  labeled row is never `{}`.
- **Reactivate is hidden for unlabeled rows** on the dataset page: an unlabeled
  row is turned active _only_ by labeling it (which writes a schema-valid
  `expected` via the rule-2 gate), never by a raw reactivate that would push an
  empty `expected` into a future export. Labeling keeps `revision` at 1 (it is
  the first real save, not an edit); subsequent edits bump revision (rule 3).

### File inputs: `file_ref` convention + private bucket

A file input is stored as `{"file_ref":
"storage://goldsmith-inputs/<dataset-slug>/<ulid>.<ext>"}` — the extraction
preset's file convention (PLAN.md). Bytes live in a **private** Storage bucket
`goldsmith-inputs`; previews use short-lived **signed URLs** (1 h TTL), never a
public bucket. The ref/path shape is a pure module (`web/src/lib/file-ref.ts`)
so it unit-tests without a network; the Supabase calls live in
`web/src/lib/storage.ts`. Object names are a fresh ULID (no `ex_` prefix) so two
uploads of the same filename never collide.

### Storage bucket + RLS — migration `002_storage_inputs.sql`

Like 001, the browser talks to Storage with the anon key, so the bucket needs
RLS that confines anon/authenticated to **this bucket only** (the shared
project's `documents` bucket keeps its own owner-only policies). `002` creates
the private bucket and adds `storage.objects` policies (select/insert/update/
delete scoped to `bucket_id = 'goldsmith-inputs'`) plus `storage.buckets`
select/insert policies so the app's `ensureInputsBucket()` can "create
programmatically if absent" on a fresh project. The app also ensures the bucket
at runtime (idempotent, best-effort) — belt to the migration's suspenders.

**Deviation flagged:** the storage RLS in `002` is DDL. It was written as the
source-of-truth migration but **not applied from this session** — the session
had only the REST anon/service keys (no DDL path; the Supabase MCP was
declined). It must be applied like `001` was. The bucket itself was created
programmatically (service key) and the live/opt-in verification below ran with
the **service-role key** (which bypasses RLS); once `002` is applied the same
paths work with the browser anon key. Empirically confirmed this session: with
no policies, the anon key gets `new row violates row-level security policy` on
both upload and bucket-create — exactly what `002` grants.

### Navigation

Still no URL router (superseding the T2 note that one would land in T4). `App`
holds `{ selected, view }` where view ∈ `detail | label | import`; the extra
dependency and route wiring buy little for a single-user tool. "Route per
dataset" is satisfied as an in-app view keyed to the selected dataset. A real
router can arrive later without touching the page components.

### Bulk import parsing

`web/src/lib/bulk-import.ts` parses CSV and JSONL of text inputs into input
objects keyed by the preset (`text` for extraction/classification/custom,
`question` for routing/qa; PLAN.md conventions). Malformed lines are **reported
with their line number, never dropped** — a JSONL parse failure / non-string-
non-object value, or a CSV empty cell / missing column, becomes an error row the
Import page lists; only the good rows are imported. A JSONL line that is already
an object is trusted as a full input shape (so `{"file_ref": ...}` /
`{"question": ...}` pass through). CSV uses a small RFC-4180 tokenizer (quoted
fields with commas, newlines, and `""` escapes) and a header row when it names a
known column, else treats the first column as the text.

### Keep-alive workflow

`.github/workflows/keepalive.yml` runs one REST `select` against Supabase every
2 days (`cron: "0 6 */2 * *"`, plus `workflow_dispatch`) so the free-tier
project never idles into a pause again. It reads two repo secrets (see the DoD
report for exact names/format): `SUPABASE_KEEPALIVE_URL` (project URL) and
`SUPABASE_KEEPALIVE_KEY` (anon key). Standard `${{ secrets.* }}` syntax is used
— the ci.yml "avoid `$`-expressions" note is a _scaffolder-template_ constraint,
not a rule for this generated repo.

### Integration test environment

`web/tests/storage.integration.test.ts` is pinned to `// @vitest-environment
node`: Storage multipart uploads and signed-URL fetches hang under the suite's
default jsdom networking. It stays opt-in (`GOLDSMITH_INTEGRATION=1`) so the
default `pnpm test` and CI remain offline and green.
