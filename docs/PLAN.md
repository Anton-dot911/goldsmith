# PLAN.md — Goldsmith Implementation Plan

One task = one session. T1–T5 = MVP needed for DocFlow's dataset; T6–T7 = quality-of-life.

---

## Contracts

### Export line format (`spec/export.schema.json`) — JSONL, one object per line

```jsonc
{
  "id": "ex_01J...",                 // ulid, stable across versions
  "input": { },                      // preset-specific (see below) or free-form
  "expected": { },                   // validated against dataset schema
  "tags": ["scan", "multipage"],
  "provenance": "ai_drafted+human_verified",   // or "human_only"
  "dataset": "docflow-invoices",
  "dataset_version": 3
}
```

Reference reader (copied into consumer repos' eval scripts):
```python
import json
def load_golden(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]
```

> `spec/export.schema.json` is the canonical, machine-checkable form of this
> shape (added in T5); the contract test validates every export line against it
> AND parses it with the reader above. Per hard rule 1 it changes only with a
> version bump and a note in `docs/decisions.md` — the jsonc above is
> illustrative, the schema file is authoritative.

### Input conventions per preset
- `extraction`: `{"file_ref": "storage://.../doc.pdf"}` or `{"text": "..."}`; expected = target Pydantic-mirrored schema (e.g. DocFlow InvoiceData JSON Schema pasted at dataset creation)
- `routing`: `{"question": "..."}`; expected = `{"routes": ["sql"], "clarify_ok": false}`
- `qa`: `{"question": "..."}`; expected = `{"answerable": true, "answer": "...", "source_hint": "..."}`
- `classification`: `{"text": "..."}`; expected = `{"label": "..."}` with enum from dataset schema

### DDL (`supabase/migrations/001_init.sql`)

```sql
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
```

> This is the initial `001_init.sql` contract (tables only). The migrations that
> followed are `002_storage_inputs.sql` (private `goldsmith-inputs` bucket +
> storage RLS) and `003_auth_rls.sql` (authenticated-only RLS on the three tables
> and the bucket, plus the `public.keepalive` view) — see `supabase/migrations/`
> and `docs/decisions.md`. Per `docs/LESSONS.md` rule 7 the agent never applies
> DDL: it outputs the full SQL and I run it in the Supabase SQL Editor, then it
> verifies via REST.

### AI draft function
`POST /.netlify/functions/ai-draft` body `{dataset_id, input}` →
`{draft: <expected-shaped object>, model, cost_usd}`.
Implementation: dataset schema + preset-specific prompt (`prompts/draft_<preset>.v1.md`), structured output, temperature 0, metered (project "goldsmith", component `draft_<preset>`).

### Export endpoints
- UI download: current active examples of selected version → `.jsonl`
- CI read: `GET /.netlify/functions/export?dataset=<slug>&version=<n>&token=<env token>` → jsonl body (simple bearer-style token from env, good enough for a personal tool)

---

## Tasks

**T1. Scaffold + schema.** ✅ (#1)
Generate from ts-fullstack (adapt to Netlify functions), output the init migration SQL for me to apply (LESSONS rule 7 — the agent never applies DDL), datasets CRUD page (create with preset pick + schema paste/preset default).
DoD: create dataset of each preset; schema stored; lint/tests green.

**T2. Examples core + validation.** ✅ (#2)
Examples table page, manual add form (raw JSON for now), ajv validation on save (rule 2), revisions + deactivate (rule 3), ulid ids, tags.
DoD: invalid expected rejected with readable errors; edit creates revision; unit tests for validation and revisioning.

**T3. Preset form renderers.** ✅ (#3)
Custom renderers for the four presets (schema-driven fields, enum selects, arrays for routing); fallback raw JSON editor for `custom`.
DoD: component tests: value round-trip per preset; labeling an example without touching raw JSON.

**T4. Two-pane labeling + file inputs.** ✅ (#4)
Label page: left input (text render or file preview via Storage — pdf/image), right expected form; keyboard next/prev; upload inputs (single + bulk file drop); CSV/JSONL bulk import of inputs.
DoD: label 10 fixture examples fluidly; bulk import creates unlabeled examples queue.

**T5. AI pre-label + export.** ✅ (+ T5.5 auth + deploy readiness)
`ai-draft` function + "Draft with AI" button (fills form, marks provenance, stores ai_draft); export download + CI endpoint; contract test with reference reader.
DoD: drafted-then-corrected example stores diff; exported file passes `export.schema.json` for every line; DocFlow-shaped dataset (40 examples) built as acceptance run — timed, target ≤ 2h. **Met: acceptance run projects ~35 min for 40 (see docs/decisions.md T5).**
T5.5: Supabase Auth magic-link login + authenticated-only RLS (migration 003); netlify.toml finalized, .env.example + README Deploy.

**T6. Versioning UX.**
Freeze version (snapshot note), bump current, export by version; version badge on examples.
DoD: frozen version export is stable while new examples land in next version.

**T7. Diff review mode (v1.1).**
Import eval-run results JSONL (`{id, actual}`); side-by-side expected vs actual with quick "fix expected" action (new revision).
DoD: mismatches list renders; one-click correction works; used once on a real DocFlow eval run.

---

## Session prompt template
> Read CLAUDE.md, docs/LESSONS.md, and docs/PLAN.md. Implement task T<N> only. Contracts are verbatim — ask before deviating. Finish with tests green and a short summary.
>
> Required DoD line for every task: **update CLAUDE.md "Current state" to match merged reality** (file tree, functions, auth/RLS shape) — the INVARIANTS stay put; only the point-in-time section moves.
