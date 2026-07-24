# netlify/ (the `@goldsmith/functions` workspace)

Server-side code. This workspace replaces the scaffolder's Fastify `service/`
(see `docs/decisions.md`). Per CLAUDE.md, Netlify Functions exist **only** for
work that must keep a secret off the browser.

Layout:

- `functions/` — the function entrypoints and their `lib/` helpers. Netlify
  bundles **every** top-level file in this dir as a serverless function, so it
  contains _only_ the two entrypoints (plus `lib/`); all config and tests live
  one level up here in `netlify/` (see `docs/decisions.md`).
  - `functions/ai-draft.ts` — POST `{dataset_id, input}` → drafted `expected`
    (metered, project `goldsmith`). Added in **T5**.
  - `functions/export.ts` — CI read endpoint for the JSONL export. Added in
    **T5**.
- `tests/` — vitest suites for the function code.
- `package.json`, `tsconfig.json`, `vitest.config.ts` — workspace config,
  deliberately kept out of `functions/` so Netlify doesn't treat them as
  functions.

Datasets/examples CRUD does **not** go through a function — the browser talks
to Supabase directly with the anon key, and RLS confines access.
