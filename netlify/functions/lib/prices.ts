import type { Usage } from "./draft.ts";

// Per-model token pricing (USD per 1M tokens), keyed by model-id prefix so a
// dated snapshot like "claude-haiku-4-5-20251001" matches "claude-haiku-4-5".
// Used only to fill the `cost_usd` column of the meter row; an unknown model
// yields null (recorded, cost unknown) rather than a wrong number.
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1.0, out: 5.0 },
  "claude-opus-4-8": { in: 5.0, out: 25.0 },
  "claude-opus-4-7": { in: 5.0, out: 25.0 },
  "claude-opus-4-6": { in: 5.0, out: 25.0 },
  "claude-sonnet-5": { in: 3.0, out: 15.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
};

export function costUsd(model: string, usage: Usage): number | null {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  if (key === undefined) {
    return null;
  }
  const price = PRICES[key]!;
  const usd = (usage.input_tokens / 1e6) * price.in + (usage.output_tokens / 1e6) * price.out;
  // Six decimals is enough for sub-cent per-call costs without float noise.
  return Number(usd.toFixed(6));
}
