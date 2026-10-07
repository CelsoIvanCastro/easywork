import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": resolve("src"), "server-only": resolve("tests/empty.ts") },
  },
  test: {
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/env.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
