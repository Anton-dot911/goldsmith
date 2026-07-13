# goldsmith

Golden dataset builder. Input example + verified expected output → versioned
JSONL export that feeds eval scripts in other projects (DocFlow, Insight,
Conveyor). Spec: `docs/TZ.md`. Plan: `docs/PLAN.md`.

## Architecture

pnpm workspace. `shared/` holds the domain/wire contracts imported by both the
web app and (from T5) the Netlify functions.

```
shared/            # zod domain types (presets, dataset row), source-only
web/               # React 18 + Vite + TS(strict) + Tailwind frontend
netlify/functions/ # server-side AI pre-label + export (T5); keeps the API key off the browser
spec/presets/      # the four preset JSON Schemas (extraction/routing/qa/classification)
supabase/migrations/  # 001_init.sql: datasets, examples, dataset_versions (+ RLS)
```

Datasets/examples CRUD talks to Supabase directly from the browser with the
anon key (RLS confines it). Only the AI pre-label call runs server-side.

## Setup

Requires Node >= 22.18 and pnpm.

```
pnpm install
cp web/.env.example web/.env   # add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
pnpm dev        # vite dev server
pnpm test       # vitest in every package
pnpm lint       # eslint + prettier over the whole workspace
pnpm typecheck  # tsc --noEmit in every package
pnpm build      # production build (web)
```

The live-Supabase integration test is opt-in:

```
GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm --filter ./web test
```

## Design decisions

See `docs/decisions.md` (export format is a versioned public contract — it
changes only with a version bump and a note there).
