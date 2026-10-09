import path from "node:path";
import { defineConfig } from "vitest/config";

// Core needs only unit tests of pure code (schemas, URL params, money, cursor, server rules),
// so the default Node environment is enough. jsdom + RTL come with Advanced.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server bundle; tests are server code, so use its empty build.
      "server-only": path.resolve(import.meta.dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // Each test file gets a fresh in-memory SQLite database, seeded on first use.
    env: { DATABASE_PATH: ":memory:" },
  },
});
