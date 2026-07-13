// Derive a URL-safe slug from a dataset title. ASCII-focused: lowercases,
// strips Latin diacritics, turns any run of non-alphanumerics into a single
// hyphen, and trims leading/trailing hyphens. Non-Latin scripts (e.g.
// Cyrillic) collapse away — the create form leaves the slug editable so those
// can be typed by hand.
export function slugify(title: string): string {
  return (
    title
      .normalize("NFKD")
      // Drop combining marks left by NFKD (é -> e).
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}
