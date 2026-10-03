import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test against @pcad/core's source so the tests don't depend on core having been built first.
  resolve: { alias: { "@pcad/core": path.resolve(__dirname, "../core/src/index.ts") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
