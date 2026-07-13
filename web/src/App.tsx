import { useState } from "react";
import type { DatasetRow } from "@goldsmith/shared";
import { DatasetDetail } from "./pages/DatasetDetail.tsx";
import { Datasets } from "./pages/Datasets.tsx";

// Minimal in-memory navigation: a selected dataset opens its detail page.
// A real router lands with the Label/Import routes in later tasks.
export function App() {
  const [selected, setSelected] = useState<DatasetRow | null>(null);

  if (selected !== null) {
    return <DatasetDetail dataset={selected} onBack={() => setSelected(null)} />;
  }
  return <Datasets onOpen={setSelected} />;
}
