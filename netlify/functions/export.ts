import type { Context } from "@netlify/functions";
import { assembleExport, toJsonl } from "./lib/export-line.ts";
import { loadDatasetBySlug, loadExamplesForExport, makeAdmin } from "./lib/supabase-admin.ts";

// GET /.netlify/functions/export?dataset=<slug>&version=<n>
// Auth: bearer token from env EXPORT_TOKEN, as `Authorization: Bearer <token>`
// or `?token=<token>` (good enough for a personal tool — docs/PLAN.md). Returns
// the active examples of the requested version as JSONL, in the export contract
// shape (spec/export.schema.json). Reads Supabase server-side (service role).

function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain" } });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== "GET") {
    return text("method not allowed", 405);
  }

  const expected = process.env.EXPORT_TOKEN;
  if (expected === undefined || expected === "") {
    return text("export endpoint not configured (EXPORT_TOKEN unset)", 500);
  }

  const url = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : url.searchParams.get("token");
  if (bearer !== expected) {
    return text("unauthorized", 401);
  }

  const slug = url.searchParams.get("dataset");
  if (slug === null || slug === "") {
    return text("dataset (slug) query param is required", 400);
  }

  const admin = makeAdmin();
  const dataset = await loadDatasetBySlug(admin, slug);
  if (dataset === null) {
    return text(`dataset ${slug} not found`, 404);
  }

  const versionRaw = url.searchParams.get("version");
  const version = versionRaw === null ? dataset.current_version : Number(versionRaw);
  if (!Number.isInteger(version) || version < 1) {
    return text("invalid version", 400);
  }

  const examples = await loadExamplesForExport(admin, dataset.id);
  const jsonl = toJsonl(assembleExport(examples, dataset.slug, version));

  return new Response(jsonl, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson",
      "content-disposition": `attachment; filename="${slug}.v${version}.jsonl"`,
    },
  });
};
