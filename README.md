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
netlify/functions/ # server-side AI pre-label + CI export; keeps the API key/token off the browser
prompts/           # per-preset draft prompts (draft_<preset>.v1.md), shipped with the functions
spec/              # export.schema.json (the export contract) + presets/*.schema.json
supabase/migrations/  # 001 init, 002 storage, 003 authenticated-only RLS + keepalive view
```

Datasets/examples CRUD talks to Supabase directly from the browser with the anon
key, behind Supabase Auth (magic-link login) + authenticated-only RLS. The
AI pre-label call and the CI export run server-side (Netlify Functions), holding
the Anthropic key, the export token, and the Supabase service-role key.

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

### Opt-in tests (live Supabase / real model)

The default `pnpm test` and CI stay offline. Live tests are env-gated:

```
# Supabase CRUD (anon key + RLS)
GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm --filter ./web test

# Storage (uploads + signed URLs)
GOLDSMITH_INTEGRATION=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... pnpm --filter ./web test tests/storage.integration.test.ts

# Auth policies — authenticated ok, anon rejected (needs migration 003 applied)
GOLDSMITH_AUTH_TEST=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./web test tests/auth-policies.integration.test.ts

# ai-draft real-model smoke (text + PDF file_ref)
GOLDSMITH_LLM=1 ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./netlify/functions test tests/draft.smoke.test.ts

# export endpoint (live, bearer auth)
GOLDSMITH_EXPORT=1 EXPORT_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./netlify/functions test tests/export-live.smoke.test.ts

# acceptance / DoD timing run (10 inputs, drafted + saved)
GOLDSMITH_ACCEPTANCE=1 ANTHROPIC_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./netlify/functions test tests/acceptance.smoke.test.ts
```

## Deploy (Netlify)

Goldsmith deploys as a Netlify site: the Vite app is the published frontend and
`netlify/functions/` holds the two server-side endpoints (`ai-draft`, `export`).

1. **Apply the Supabase migrations** (in order) to your project:
   `supabase/migrations/001_init.sql`, `002_storage_inputs.sql`,
   `003_auth_rls.sql`. 003 makes the goldsmith tables authenticated-only and adds
   the `public.keepalive` view.
2. **Enable Supabase Auth email (magic link)**: Authentication → Providers →
   Email (magic link on). Add your Netlify site URL under Authentication → URL
   Configuration → Site URL / Redirect URLs so the magic link returns to the app.
3. **Create the site from this repo.** Build settings come from `netlify.toml`
   (build `pnpm install --no-frozen-lockfile && pnpm --filter ./web build`,
   publish `web/dist`, functions `netlify/functions`, prompts shipped via
   `included_files`). Node 22.
4. **Set environment variables** (Site settings → Environment variables — see
   `.env.example`):
   - Build-time / browser: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Runtime / functions only: `ANTHROPIC_API_KEY`, `EXPORT_TOKEN`,
     `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `DRAFT_MODEL`
     (default `claude-haiku-4-5-20251001`).
5. **Deploy.** Then verify:
   - Visit the site → magic-link login → create/label a dataset, click
     **✨ Draft with AI**, save, and **Export .jsonl**.
   - CI export: `curl -H "Authorization: Bearer $EXPORT_TOKEN" \
"https://<site>/.netlify/functions/export?dataset=<slug>&version=<n>"`.
6. **Keepalive (optional).** The `.github/workflows/keepalive.yml` GitHub Action
   pings the DB every 2 days so the free tier never idles into a pause. Set repo
   secrets `SUPABASE_KEEPALIVE_URL` (project URL) and `SUPABASE_KEEPALIVE_KEY`
   (anon key).

Local dev with functions: `netlify dev` (loads a repo-root `.env`) runs the Vite
app and the functions together. Plain `pnpm dev` runs the frontend only.

## Design decisions

See `docs/decisions.md` (export format is a versioned public contract — it
changes only with a version bump and a note there).
