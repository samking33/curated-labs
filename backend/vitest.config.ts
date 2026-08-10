import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@curated-labs/shared": resolve(__dirname, "../shared/src/index.ts") } },
  test: { environment: "node", include: ["tests/**/*.test.ts", "src/**/*.test.ts"] },
});
