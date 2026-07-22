import { useState } from "react";
import { sendMagicLink } from "../lib/auth.ts";

// Magic-link login screen (T5.5). Enter an email, get a sign-in link. No
// passwords, no roles — this is a single-user tool; login just gates access and
// gives the browser an authenticated session for RLS (migration 003).
export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      await sendMagicLink(email.trim());
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Goldsmith</h1>
        <p className="mt-1 text-sm text-slate-500">Golden dataset builder — sign in to continue.</p>

        {sent ? (
          <div className="mt-6 rounded bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Check <span className="font-medium">{email}</span> for a sign-in link. You can close
            this tab once you click it.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="rounded border border-slate-300 px-3 py-2"
                autoFocus
              />
            </label>
            {error !== null && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <button
              type="submit"
              disabled={sending || email.trim() === ""}
              className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
