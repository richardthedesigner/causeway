import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@causeway/graph": r("./packages/graph/src/index.ts"),
      "@causeway/profile": r("./packages/profile/src/index.ts"),
      "@causeway/router": r("./packages/router/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
