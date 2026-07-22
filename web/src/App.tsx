import { useEffect, useState } from "react";
import type { DatasetRow } from "@goldsmith/shared";
import type { Session } from "@supabase/supabase-js";
import { Login } from "./components/Login.tsx";
import { getSession, onAuthChange, signOut } from "./lib/auth.ts";
import { DatasetDetail } from "./pages/DatasetDetail.tsx";
import { Datasets } from "./pages/Datasets.tsx";
import { Import } from "./pages/Import.tsx";
import { Label } from "./pages/Label.tsx";

// Minimal in-memory navigation: a selected dataset plus a per-dataset view
// (its examples table, the two-pane Label queue, or the Import page). Kept as
// state rather than a URL router — this is a single-user tool and the extra
// dependency buys little; documented in docs/decisions.md (T4).
type View = "detail" | "label" | "import";

function Shell({ email }: { email: string | undefined }) {
  const [selected, setSelected] = useState<DatasetRow | null>(null);
  const [view, setView] = useState<View>("detail");

  let page;
  if (selected === null) {
    page = (
      <Datasets
        onOpen={(d) => {
          setSelected(d);
          setView("detail");
        }}
      />
    );
  } else if (view === "label") {
    page = <Label dataset={selected} onBack={() => setView("detail")} />;
  } else if (view === "import") {
    page = <Import dataset={selected} onBack={() => setView("detail")} />;
  } else {
    page = (
      <DatasetDetail
        dataset={selected}
        onBack={() => setSelected(null)}
        onLabel={() => setView("label")}
        onImport={() => setView("import")}
      />
    );
  }

  return (
    <>
      {/* Slim account bar: who's signed in + sign out. Fixed so it overlays the
          pages without restructuring their full-screen layouts (T5.5). */}
      <div className="fixed right-3 top-3 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-500 shadow-sm backdrop-blur">
        {email !== undefined && <span className="max-w-[16rem] truncate">{email}</span>}
        <button
          onClick={() => void signOut()}
          className="rounded px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100"
        >
          Sign out
        </button>
      </div>
      {page}
    </>
  );
}

export function App() {
  // undefined = still resolving the session; null = signed out.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null));
    return onAuthChange(setSession);
  }, []);

  if (session === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Loading…
      </main>
    );
  }
  if (session === null) {
    return <Login />;
  }
  return <Shell email={session.user.email ?? undefined} />;
}
