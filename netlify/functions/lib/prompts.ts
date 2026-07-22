import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Preset } from "./draft.ts";

// Per-preset draft prompts live at repo-root prompts/draft_<preset>.v1.md
// (docs/PLAN.md). At runtime they're read from disk; in a bundled Netlify
// function they ship via `included_files = ["prompts/**"]` in netlify.toml, so
// we probe a few candidate roots and use the first that exists. The `.v1`
// suffix versions the prompt — a wording change means a new file, not an edit.

const HERE = dirname(fileURLToPath(import.meta.url));

function candidateDirs(): string[] {
  const dirs: string[] = [];
  const override = process.env.GOLDSMITH_PROMPTS_DIR;
  if (override !== undefined && override !== "") {
    dirs.push(override);
  }
  // lib/ -> functions/ -> netlify/ -> repo root -> prompts/
  dirs.push(join(HERE, "..", "..", "..", "prompts"));
  dirs.push(join(process.cwd(), "prompts"));
  // Netlify bundles included_files relative to the function root.
  dirs.push(join(HERE, "..", "prompts"));
  dirs.push(join(HERE, "prompts"));
  return dirs;
}

export async function loadPrompt(preset: Preset): Promise<string> {
  const name = `draft_${preset}.v1.md`;
  for (const dir of candidateDirs()) {
    const path = join(dir, name);
    if (existsSync(path)) {
      return await readFile(path, "utf8");
    }
  }
  throw new Error(`prompt file ${name} not found (looked in: ${candidateDirs().join(", ")})`);
}
