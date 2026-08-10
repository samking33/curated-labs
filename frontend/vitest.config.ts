import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@curated-labs/shared": dir("../shared/src/index.ts"),
      "@": dir("."),
    },
  },
  test: { environment: "node", include: ["features/**/*.test.ts", "lib/**/*.test.ts"] },
});
