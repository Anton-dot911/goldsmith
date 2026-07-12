# CLAUDE.md — Goldsmith (Golden Dataset Builder)

## What this project is
Personal labeling tool for building golden datasets that feed eval scripts in my other projects (DocFlow extraction, Insight router/sql/rag, Conveyor agents). Input example + verified expected output → versioned JSONL export. Spec: `docs/TZ.md`. Plan: `docs/PLAN.md` — one task per session.

## Stack
- Frontend: React 18 + Vite + TS(strict) + Tailwind (Netlify)
- Backend: Supabase (Postgres + Storage for input files); Netlify Functions ONLY for the AI pre-label call (API key server-side)
- Generated from scaffolder `ts-fullstack` template (web + shared; service replaced by Netlify functions dir)
- Tests: vitest

## Hard rules
1. The export format is a public contract consumed by other repos' eval scripts. Its shape (`spec/export.schema.json`) changes only with a version bump and a note in `docs/decisions.md`.
2. Every example is validated against its dataset's JSON Schema on save. Invalid expected-output cannot be saved, period.
3. Examples are never deleted or mutated destructively: edits create a new revision, "delete" sets `active=false`. Export takes active examples of the chosen dataset version.
4. Every example carries provenance: `human_only` or `ai_drafted+human_verified`. The AI pre-label flow may never auto-confirm — a human save is always required, and the diff between AI draft and final value is stored (it's my hard-cases signal).
5. AI pre-label calls go through the Netlify function using the metered client pattern (Meter, project="goldsmith"); never from the browser.
6. Schema-driven forms: prefer the simple custom renderer for the four presets over a generic JSON-Schema form library; fall back to raw JSON editor with validation for exotic schemas.
7. This is a single-user tool: no roles, no multi-tenancy, RLS pins everything to my account. Do not add auth complexity.

## Structure
```
web/src/
  pages/            # Datasets, DatasetDetail (examples table), Label (two-pane), Import
  components/forms/ # preset renderers: extraction | routing | qa | classification
  lib/schema.ts     # ajv validation, preset registry
netlify/functions/
  ai-draft.ts       # POST: {dataset_id, input} -> draft expected (metered)
spec/
  export.schema.json
  presets/*.schema.json
supabase/migrations/
```

## Commands
- Dev: `pnpm dev` (vite + netlify dev) · Tests: `pnpm test` · Lint: `pnpm lint` · Typecheck: `pnpm typecheck`

## Testing conventions
- Validation logic (ajv wrappers, export assembly) — pure unit tests.
- Preset form renderers — component tests: schema in → fields out → value round-trip.
- The export contract test: fixture dataset → export → validate every line against `export.schema.json` AND parse with the reference reader snippet that other projects copy.
