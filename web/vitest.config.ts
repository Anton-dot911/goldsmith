import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the `@spec` alias from vite.config.ts so tests import the same preset
// JSON Schemas the app does.
const specDir = fileURLToPath(new URL("../spec", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@spec": specDir },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    // Component tests (T3 preset renderers) need a DOM; the pure unit and
    // Supabase integration tests don't care which environment they run in.
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
  },
});
