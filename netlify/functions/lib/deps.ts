import { DEFAULT_MODEL, makeAnthropic, makeCallModel } from "./anthropic.ts";
import type { DraftDeps } from "./draft.ts";
import { loadPrompt } from "./prompts.ts";
import { fetchFile, loadDataset, makeAdmin, meter } from "./supabase-admin.ts";

// Wires the real Anthropic + Supabase clients into the pure `draftExpected`
// core. The handler calls this; unit tests build their own fake DraftDeps.
export function makeRealDeps(): DraftDeps {
  const admin = makeAdmin();
  const client = makeAnthropic();
  const model = process.env.DRAFT_MODEL ?? DEFAULT_MODEL;
  return {
    model,
    loadDataset: (id) => loadDataset(admin, id),
    loadPrompt,
    fetchFile: (ref) => fetchFile(admin, ref),
    callModel: makeCallModel(client, model),
    meter: (record) => meter(admin, record),
  };
}
