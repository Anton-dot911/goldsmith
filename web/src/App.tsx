import { useState } from "react";
import type { DatasetRow } from "@goldsmith/shared";
import { DatasetDetail } from "./pages/DatasetDetail.tsx";
import { Datasets } from "./pages/Datasets.tsx";
import { Import } from "./pages/Import.tsx";
import { Label } from "./pages/Label.tsx";

// Minimal in-memory navigation: a selected dataset plus a per-dataset view
// (its examples table, the two-pane Label queue, or the Import page). Kept as
// state rather than a URL router — this is a single-user tool and the extra
// dependency buys little; documented in docs/decisions.md (T4).
type View = "detail" | "label" | "import";

export function App() {
  const [selected, setSelected] = useState<DatasetRow | null>(null);
  const [view, setView] = useState<View>("detail");

  if (selected === null) {
    return (
      <Datasets
        onOpen={(d) => {
          setSelected(d);
          setView("detail");
        }}
      />
    );
  }

  if (view === "label") {
    return <Label dataset={selected} onBack={() => setView("detail")} />;
  }
  if (view === "import") {
    return <Import dataset={selected} onBack={() => setView("detail")} />;
  }
  return (
    <DatasetDetail
      dataset={selected}
      onBack={() => setSelected(null)}
      onLabel={() => setView("label")}
      onImport={() => setView("import")}
    />
  );
}
