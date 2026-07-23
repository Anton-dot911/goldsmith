# CLAUDE.md — Goldsmith (Golden Dataset Builder)

## What this project is

Personal labeling tool for building golden datasets that feed eval scripts in my
other projects (DocFlow extraction, Insight router/sql/rag, Conveyor agents).
Input example + verified expected output → versioned JSONL export. Spec:
`docs/TZ.md`. Plan: `docs/PLAN.md`. Operational rules: `docs/LESSONS.md` (read it
after this file).

This file has two halves. **INVARIANTS** are the rules and contracts — they
change only by a deliberate decision (with a note in `docs/decisions.md`).
**Current state** is point-in-time fact — the file tree, which functions exist,
the auth/RLS shape — and is expected to drift as tasks land; each task updates it
to match merged reality (see the PLAN session-prompt DoD).

---

# INVARIANTS (change only by decision)

## Stack

- Frontend: React 18 + Vite + TS(strict) + Tailwind (Netlify)
- Backend: Supabase (Postgres + Storage for input files); Netlify Functions hold
  the server-side secrets — the AI pre-label call and the CI export — so the
  Anthropic key, export token, and service-role key never reach the browser
- Generated from scaffolder `ts-fullstack` template (web + shared; service
  replaced by Netlify functions dir)
- Tests: vitest

## Hard rules

1. The export format is a public contract consumed by other repos' eval scripts.
   Its shape (`spec/export.schema.json`) changes only with a version bump and a
   note in `docs/decisions.md`.
2. Every example is validated against its dataset's JSON Schema on save. Invalid
   expected-output cannot be saved, period.
3. Examples are never deleted or mutated destructively: edits create a new
   revision, "delete" sets `active=false`. Export takes active examples of the
   chosen dataset version.
4. Every example carries provenance: `human_only` or `ai_drafted+human_verified`.
   The AI pre-label flow may never auto-confirm — a human save is always
   required, and the diff between AI draft and final value is stored (it's my
   hard-cases signal).
5. AI pre-label calls go through the Netlify function using the metered client
   pattern (Meter, project="goldsmith"); never from the browser.
6. Schema-driven forms: prefer the simple custom renderer for the four presets
   over a generic JSON-Schema form library; fall back to raw JSON editor with
   validation for exotic schemas.
7. Single-user tool: one account, no roles, no multi-tenancy. Access is gated by
   Supabase Auth magic-link login, and RLS admits only the `authenticated` role
   (migration 003). Keep it there — no roles, orgs, sharing, or per-row
   ownership; the login is the whole of the auth model.

## Testing conventions

- Validation logic (ajv wrappers, export assembly) — pure unit tests.
- Preset form renderers — component tests: schema in → fields out → value
  round-trip.
- The export contract test: fixture dataset → export → validate every line
  against `export.schema.json` AND parse with the reference reader snippet that
  other projects copy.

## Commands

- Dev: `pnpm dev` (vite + netlify dev) · Tests: `pnpm test` · Lint: `pnpm lint` ·
  Typecheck: `pnpm typecheck`

---

# Current state (point-in-time — update to match merged reality each task)

_As of T5 + T5.5 merged (PR #5)._

## Structure

```
web/src/
  pages/            # Datasets, DatasetDetail (examples table + Export .jsonl), Label (two-pane), Import
  components/       # Login (magic-link), ExampleDialog, InputPane
  components/forms/ # preset renderers: extraction | routing | qa | classification
  lib/              # schema.ts (ajv + preset registry), validate, examples, datasets,
                    # storage, file-ref, ai-draft (client), draft-diff, export, auth, supabase
netlify/functions/  # own workspace package (@goldsmith/functions)
  ai-draft.ts       # POST {dataset_id, input} -> {draft, model, cost_usd} (metered)
  export.ts         # GET CI export (EXPORT_TOKEN bearer) -> jsonl
  lib/              # draft (pure core + deps), anthropic, supabase-admin, export-line, prices, prompts
prompts/            # draft_<preset>.v1.md — per-preset draft prompts, shipped with the functions
spec/
  export.schema.json
  presets/*.schema.json
supabase/migrations/ # 001 init · 002 storage · 003 authenticated-only RLS + keepalive view
```

## Server functions

- `ai-draft.ts` — the metered AI pre-label call. Default model
  `claude-haiku-4-5-20251001` (overridable via `DRAFT_MODEL`); structured output
  via a forced `record_expected` tool bound to the dataset schema.
- `export.ts` — the CI read endpoint, bearer-gated on `EXPORT_TOKEN`.

## Auth / RLS

- Supabase Auth magic-link login gates the whole app; the browser holds an
  `authenticated` session (single user).
- RLS is authenticated-only on `datasets` / `examples` / `dataset_versions` and
  the `goldsmith-inputs` storage bucket (migration 003). The anon key can read
  only the constant `public.keepalive` view (so the keepalive workflow still
  warms the DB without exposing data).
