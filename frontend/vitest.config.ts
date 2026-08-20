import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.*", "tests/**/*.spec.*", "tests/**/*.tsx"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "playwright/**"],
  },
});
