import type { Context } from "@netlify/functions";
import { draftExpected } from "./lib/draft.ts";
import { makeRealDeps } from "./lib/deps.ts";

// POST /.netlify/functions/ai-draft
// Body: {dataset_id, input} -> {draft, model, cost_usd}
// The metered AI pre-label call (CLAUDE.md rule 5). All secrets (ANTHROPIC key,
// Supabase service role) stay server-side; the browser only sees the draft.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const { dataset_id, input } = (body as { dataset_id?: unknown; input?: unknown } | null) ?? {};
  if (typeof dataset_id !== "string" || input === undefined) {
    return json({ error: "dataset_id (string) and input are required" }, 400);
  }

  try {
    const out = await draftExpected({ dataset_id, input }, makeRealDeps());
    return json(out, 200);
  } catch (cause) {
    return json({ error: cause instanceof Error ? cause.message : String(cause) }, 500);
  }
};
