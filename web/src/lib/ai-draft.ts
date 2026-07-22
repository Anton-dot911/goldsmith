// Browser client for the AI pre-label function (T5). The actual model call is
// server-side (the Netlify function holds the Anthropic key — CLAUDE.md rule 5);
// this just POSTs {dataset_id, input} and returns the draft for the human to
// verify. The endpoint path is relative so it works under `netlify dev` and in
// production alike.

export interface DraftResult {
  draft: unknown;
  model: string;
  cost_usd: number | null;
}

const ENDPOINT = "/.netlify/functions/ai-draft";

export async function requestDraft(datasetId: string, input: unknown): Promise<DraftResult> {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataset_id: datasetId, input }),
  });
  if (!resp.ok) {
    let message = `AI draft failed (HTTP ${resp.status})`;
    try {
      const body = (await resp.json()) as { error?: string };
      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message);
  }
  return (await resp.json()) as DraftResult;
}
