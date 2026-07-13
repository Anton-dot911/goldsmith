import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `@spec` resolves to the repo-root `spec/` dir so the preset JSON Schemas
// (spec/presets/*.schema.json) stay the single source of truth, imported by
// the web app and its tests alike.
const specDir = fileURLToPath(new URL("../spec", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@spec": specDir },
  },
  server: {
    // Allow the dev server to read the repo-root spec/ dir (outside web/).
    fs: { allow: [".", specDir] },
  },
});
