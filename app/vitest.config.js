import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "scripts/**/*.test.js", "scripts/**/*.test.cjs"],
    // Each test file runs in isolation so module-level singletons (cardIndex,
    // rulingsIndex) cannot bleed between files.
    isolate: true,
  },
});
