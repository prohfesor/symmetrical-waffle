import * as path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test against @wafflecad/core's source so the tests don't depend on core having been built first.
  resolve: { alias: { "@wafflecad/core": path.resolve(__dirname, "../core/src/index.ts") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
