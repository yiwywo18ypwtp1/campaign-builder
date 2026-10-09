import path from "node:path";
import { defineConfig } from "vitest/config";

// Core needs only unit tests of pure code (schemas, URL params, money, cursor),
// so the default Node environment is enough. jsdom + RTL come with Advanced.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
