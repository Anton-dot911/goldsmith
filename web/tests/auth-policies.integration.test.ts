// @vitest-environment node
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Auth-policy integration test for T5.5. After migration 003 replaces the
// permissive anon policies with authenticated-only ones, this asserts both
// halves: an authenticated session can read/write the goldsmith tables, and the
// bare anon key cannot. Opt-in (needs the service role key to mint a throwaway
// user), so the default `pnpm test` and CI stay offline:
//   GOLDSMITH_AUTH_TEST=1 SUPABASE_URL=... SUPABASE_ANON_KEY=... \
//     SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter ./web test
//
// NOTE: this only passes once migration 003 is applied. Before 003 the anon key
// still has full access (the permissive T1 policy), so the "anon rejected"
// assertions will fail — that failure is exactly the state 003 fixes.
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const enabled =
  process.env.GOLDSMITH_AUTH_TEST === "1" &&
  Boolean(url) &&
  Boolean(anonKey) &&
  Boolean(serviceKey);

describe.skipIf(!enabled)("RLS: authenticated ok, anon rejected (post-003)", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let authed: SupabaseClient;
  const email = `authtest-${Date.now()}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  let userId: string | null = null;
  const anonSlug = `anon-${Date.now()}`;
  const authedSlug = `authed-${Date.now()}`;
  let authedDatasetId: string | null = null;

  beforeAll(async () => {
    admin = createClient(url as string, serviceKey as string, {
      auth: { persistSession: false },
    });
    anon = createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    });

    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    userId = created.data.user?.id ?? null;

    authed = createClient(url as string, anonKey as string, {
      auth: { persistSession: false },
    });
    const signIn = await authed.auth.signInWithPassword({ email, password });
    expect(signIn.error).toBeNull();
    expect(signIn.data.session).not.toBeNull();
  });

  afterAll(async () => {
    if (authedDatasetId !== null) {
      await admin.from("datasets").delete().eq("id", authedDatasetId);
    }
    await admin.from("datasets").delete().eq("slug", anonSlug);
    if (userId !== null) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("anon cannot insert into datasets (RLS blocks the write)", async () => {
    const { error } = await anon.from("datasets").insert({
      slug: anonSlug,
      title: "anon should fail",
      preset: "qa",
      json_schema: { type: "object" },
    });
    expect(error).not.toBeNull();
  });

  it("anon reads zero rows from datasets (RLS hides them)", async () => {
    const { data, error } = await anon.from("datasets").select("id").limit(5);
    // RLS returns an empty set (200), not an error.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("an authenticated session can insert and read back a dataset", async () => {
    const insert = await authed
      .from("datasets")
      .insert({
        slug: authedSlug,
        title: "authed ok",
        preset: "qa",
        json_schema: { type: "object", properties: { answerable: { type: "boolean" } } },
      })
      .select("id, slug")
      .single();
    expect(insert.error).toBeNull();
    authedDatasetId = insert.data?.id ?? null;
    expect(insert.data?.slug).toBe(authedSlug);

    const read = await authed.from("datasets").select("id").eq("slug", authedSlug).single();
    expect(read.error).toBeNull();
    expect(read.data?.id).toBe(authedDatasetId);
  });

  it("the keepalive view is readable by anon (project stays warm without exposing data)", async () => {
    const { data, error } = await anon.from("keepalive").select("ok").limit(1);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length).toBe(1);
  });
});
