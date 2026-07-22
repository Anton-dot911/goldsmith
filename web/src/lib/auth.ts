import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";

// Supabase Auth (magic-link) session helpers (T5.5). Goldsmith is single-user:
// login gates access to the tool, and RLS (migration 003) admits only the
// authenticated role. supabase-js persists the session in localStorage and, with
// detectSessionInUrl (default on), consumes the magic-link tokens from the URL
// hash on load — so a click-through lands back here already signed in.

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Subscribe to sign-in/out; returns an unsubscribe.
export function onAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error !== null) {
    throw new Error(error.message);
  }
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
