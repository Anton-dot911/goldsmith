import { datasetRowSchema, type DatasetInput, type DatasetRow } from "@goldsmith/shared";
import { supabase } from "./supabase.ts";

// Data access for the `datasets` table. The browser talks to Supabase
// directly (anon key + RLS); no Netlify function is involved in CRUD.

export async function listDatasets(): Promise<DatasetRow[]> {
  const { data, error } = await supabase
    .from("datasets")
    .select("id, slug, title, preset, json_schema, current_version, created_at")
    .order("created_at", { ascending: false });
  if (error !== null) {
    throw new Error(error.message);
  }
  return datasetRowSchema.array().parse(data);
}

export async function createDataset(input: DatasetInput): Promise<DatasetRow> {
  const { data, error } = await supabase
    .from("datasets")
    .insert(input)
    .select("id, slug, title, preset, json_schema, current_version, created_at")
    .single();
  if (error !== null) {
    throw new Error(error.message);
  }
  return datasetRowSchema.parse(data);
}
