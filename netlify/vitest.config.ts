import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `@spec` resolves to the repo-root `spec/` dir so the export-contract test
// imports the same export.schema.json the app and consumers rely on.
const specDir = fileURLToPath(new URL("../spec", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@spec": specDir },
  },
  test: {
    // Server-side function code: no DOM needed. The @llm smoke and the auth
    // integration tests are opt-in (guarded on env) so the default run stays
    // offline and green.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Real-model smokes and live-DB integration tests can take a while.
    testTimeout: 120_000,
  },
});
