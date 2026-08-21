import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.*", "tests/**/*.spec.*", "tests/**/*.tsx"],
    exclude: ["node_modules/**", "e2e/**", ".next/**", "playwright/**"],
  },
});
