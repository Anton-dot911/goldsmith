import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client. Uses the anon key (safe to ship in the bundle);
// RLS on the goldsmith tables confines it, and the meter/docflow tables in the
// shared project stay hidden behind their owner-only RLS. The AI pre-label
// call is the only thing that needs a secret, and it lives server-side in a
// Netlify function (CLAUDE.md rule 5).
//
// Config comes from Vite env at build time:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fail loudly at startup rather than on the first query with a cryptic 401.
if (url === undefined || anonKey === undefined) {
  throw new Error(
    "Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in web/.env",
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey);
