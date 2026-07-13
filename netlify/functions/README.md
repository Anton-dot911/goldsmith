# netlify/functions

Server-side functions. This directory replaces the scaffolder's Fastify
`service/` (see `docs/decisions.md`). Per CLAUDE.md, Netlify Functions exist
**only** for work that must keep a secret off the browser:

- `ai-draft.ts` — POST `{dataset_id, input}` → drafted `expected` (metered,
  project `goldsmith`). Added in **T5**.
- `export.ts` — CI read endpoint for the JSONL export. Added in **T5**.

Datasets/examples CRUD does **not** go through a function — the browser talks
to Supabase directly with the anon key, and RLS confines access.

No functions exist yet (T1 is scaffold + datasets page only).
