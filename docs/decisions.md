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

---

## T5 — AI pre-label + export (2026-07-22)

### Export contract — `spec/export.schema.json` first defined here (rule 1)

The export line format existed only as prose in `docs/PLAN.md`; T5 promotes it to
the machine-checkable contract `spec/export.schema.json` (draft-07), the public
shape other repos' eval scripts read. It is **verbatim** the PLAN.md shape —
`{id, input, expected, tags, provenance, dataset, dataset_version}`, all seven
required, `additionalProperties:false`, `provenance` enum, `dataset` = the slug,
`dataset_version` = the exported version, `id` matching `^ex_[0-9A-Z]{26}$`. This
is its first definition; per rule 1 any future change needs a version bump + a
note here. The contract test (`netlify/tests/export.test.ts`) validates
every assembled line against this schema **and** parses the JSONL with the exact
Python reference reader from PLAN.md via `python3`, so both the schema and the
copied reader snippet are exercised.

### Export selection semantics: `active && version_added <= version`

"Export takes active examples of the chosen version." Implemented at the assembly
boundary (`lib/export-line.ts`): a line is emitted when `active` is true **and**
`version_added <= version`. `active` excludes both deactivated rows and the
unlabeled import queue (`active=false`); `version_added <= version` means an
example added at v2 belongs to v2, v3, … until deactivated — which is what keeps a
frozen version's export stable while new examples land in later versions (the T6
property, satisfied here at the export layer without T6's freeze UI). Each line's
`dataset_version` is the **requested** export version, not the row's
`version_added`.

### `ai-draft` function structure: pure core + injected deps

The metered pre-label call is split so it unit-tests without network: the pure
core `lib/draft.ts` (`draftExpected`) takes a `DraftDeps` (load schema, load
prompt, fetch file, call model, meter), and `lib/deps.ts` wires the real
Anthropic + Supabase clients. Mocked-LLM tests drive the core with fakes (schema
wiring, metering, file-vs-text branch, error path); the `@llm` smoke drives it
with real clients. Draft = the `tool_use` input of a single forced tool
`record_expected` whose `input_schema` **is** the dataset's JSON Schema
(structured output). The function never writes the example — a human save is
always required (rule 4).

### Draft model: default Haiku 4.5, `DRAFT_MODEL`-overridable, conditional temperature

Default `claude-haiku-4-5-20251001` — the model the shared meter-dev project
already standardized on (`llm_calls`), cheap (≈$0.0027/draft observed), and — key
point — it still accepts `temperature`, which the T5 contract fixes at **0**. The
newer high-vision tiers (Opus 4.7/4.8, Sonnet 5, Fable 5) **reject** sampling
params with a 400, so `lib/anthropic.ts` sends `temperature:0` only on the models
that accept it (Haiku 4.5, Sonnet 4.6, Opus 4.6) and omits it on the newer ones —
which keeps `DRAFT_MODEL` swappable to a stronger model without a 400. Empirically
Haiku drafts **text** invoices near-perfectly; the sample **PDF** (RahunokFopPDF)
is a genuine hard case — Sonnet 4.6 also returned `<UNKNOWN>`/`0` on it — so the
draft supplies structure and the human-correction diff is captured as the
hard-cases signal, which is the point.

### Metering: `llm_calls` row per call, `ts` set client-side, non-fatal

Every draft records one `llm_calls` row (`project:"goldsmith"`,
`component:"draft_<preset>"`) with tokens, `cost_usd` (from a per-model price
table; null for an unpriced model), latency, status, and `request_id` — via the
service-role key server-side (the table is owner-only RLS; the browser anon key
gets a 401, as asserted in the T1 integration test). The shared schema's `ts`
column is NOT NULL with no default, so the meter sets it explicitly. A metering
insert failure is logged, never thrown — it must not sink a draft already
produced and paid for.

### File inputs: fetched server-side, passed as document/image

For an extraction dataset whose input is `{"file_ref": "storage://..."}`, the
function signs a short-lived URL with the service key, fetches the bytes
server-side, and passes them to Claude as a `document` block (PDF) or `image`
block (png/jpg/…). The browser never needs the file for drafting.

### "Draft with AI" UI + the hard-cases diff (rule 4)

The Label page's "✨ Draft with AI" button POSTs `{dataset_id, input}` to the
function, fills the expected form with the draft, and keeps the raw draft in
component state. On save, provenance flips to `ai_drafted+human_verified` and the
raw draft is stored in `ai_draft`; the human save is mandatory (the AI never
auto-confirms). `web/src/lib/draft-diff.ts` (`changedFields`) computes which
top-level fields the human changed from the draft, rendered as subtle amber
badges — the hard-cases signal. `example-model.ts` carries the optional
`provenance`/`ai_draft` on an edit and defaults them to the existing values, so a
plain human edit never disturbs provenance and a re-edit of an ai-drafted example
keeps its mark.

### Acceptance run (DoD)

10 inputs (5 text + 5 sample PDFs), each drafted → corrected → saved. Measured:
AI draft avg **2.06 s/ex**, cost avg **$0.0027/ex**; with a conservative human
verify/correct model (text 25 s, PDF 75 s) the run projects to **~35 min for 40
examples — well under the 2 h DoD**. Text drafts needed 1–2 field corrections;
the hard PDFs needed 3–5. Full table in the T5 DoD report.

---

## T5.5 — Auth + deploy readiness (2026-07-22)

### Magic-link auth gate

Supabase Auth `signInWithOtp` (email magic link). `App.tsx` resolves the session
on load and subscribes to `onAuthStateChange`: no session → `Login` screen; session
→ the app with a slim account bar (email + Sign out). supabase-js persists the
session and (with `detectSessionInUrl`, default on) consumes the magic-link tokens
from the URL hash on the click-through. Still single-user, no roles (rule 7) —
login only gates access and supplies an `authenticated` JWT for RLS.

### Migration 003 — authenticated-only RLS (deviation flagged, applied out-of-band)

`003_auth_rls.sql` drops the permissive `goldsmith_all` policies and recreates
them `to authenticated`, and moves the `goldsmith-inputs` storage policies from
anon to authenticated. Like 001/002 this is DDL against the shared meter-dev
project; it was **output for approval and applied out of session** (the pause-for-
"applied" workflow), never silently. Signed-URL previews keep working after the
change (a signed token authorizes the object directly, no anon policy needed), and
the ai-draft function reads files with the service role key.

### Keepalive after authenticated-only RLS: a constant view

The keepalive workflow pings the DB every 2 days with the **anon** key so the
free-tier project never idles into a pause. Once `datasets` became authenticated-
only, that ping could no longer read it. Rather than punch an anon hole in a real
table, 003 adds `create view public.keepalive as select true as ok` with
`grant select ... to anon` — a constant view that touches no goldsmith data, so
the ping still warms the DB without leaking anything. `keepalive.yml` now selects
`/rest/v1/keepalive` instead of `/rest/v1/datasets`.

### Deploy readiness

Root `.env.example` documents every deploy var, split build-time (browser, anon
key) vs runtime (functions-only secrets: `ANTHROPIC_API_KEY`, `EXPORT_TOKEN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `DRAFT_MODEL`).
`netlify.toml` declares the esbuild functions bundler and
`included_files = ["prompts/**"]` so the draft prompts ship with the function.
`README.md` gains a "Deploy" section with the exact Netlify steps. The functions
package (`@goldsmith/functions`) is a new workspace member with its own CI job
(typecheck + offline tests).

---

## Functions-bundling fix — config/tests moved out of `netlify/functions/` (2026-07-24)

### Problem

The Netlify deploy failed at **Functions bundling**:

```
The following serverless functions failed to deploy: vitest.config
— change the function names to contain only alphanumeric characters,
hyphens or underscores
```

Netlify treats **every top-level file** in the `functions` directory
(`netlify/functions/`, per `netlify.toml`) as a serverless function entrypoint.
The `@goldsmith/functions` workspace kept its `package.json`, `tsconfig.json`,
`vitest.config.ts`, and `tests/` **inside** that directory, so Netlify tried to
bundle `vitest.config.ts` as a function — and `vitest.config` is not a legal
function name (the `.` breaks the alphanumeric/hyphen/underscore rule).

### Fix — move the workspace scaffolding up one level to `netlify/`

The `functions` directory in `netlify.toml` is unchanged (`netlify/functions`);
what changed is that **only the two entrypoints and their `lib/` helpers** now
live in it. Everything Netlify shouldn't bundle moved up to `netlify/`:

- `netlify/functions/package.json` → `netlify/package.json`
- `netlify/functions/tsconfig.json` → `netlify/tsconfig.json`
- `netlify/functions/vitest.config.ts` → `netlify/vitest.config.ts`
- `netlify/functions/tests/` → `netlify/tests/`
- `netlify/functions/README.md` → `netlify/README.md`

`netlify/functions/` top level now contains only `ai-draft.ts`, `export.ts`, and
`lib/`. The `@goldsmith/functions` package name and its CI job are unchanged;
only its on-disk root moved.

Paths updated to match the new roots:

- `pnpm-workspace.yaml`: member `netlify/functions` → `netlify`.
- `netlify/tsconfig.json`: `extends ../tsconfig.base.json`, `@spec` → `../spec/*`,
  `include` now `functions/lib`, `functions/ai-draft.ts`, `functions/export.ts`,
  `tests`, `vitest.config.ts`.
- `netlify/vitest.config.ts`: `@spec` alias `../spec` (was `../../spec`); the
  `tests/**` include is unchanged (tests are now `netlify/tests/`).
- `netlify/tests/*`: imports of function code `../lib/…`, `../export.ts` →
  `../functions/lib/…`, `../functions/export.ts`.
- `README.md`: opt-in test commands `pnpm --filter ./netlify/functions` →
  `pnpm --filter ./netlify`.

`netlify.toml` needed no change (the `functions` dir and `included_files` are the
same), and `lib/prompts.ts`'s prompt-dir probing is unchanged because `lib/`
stayed at `netlify/functions/lib/`. `pnpm lint`, `typecheck`, `test`, and `build`
all pass from the new layout.
