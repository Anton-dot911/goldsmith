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
