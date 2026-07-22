import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit tests only. The Playwright E2E suite under e2e/ is run separately via
// `npm run test:e2e` and must not be collected by vitest.
//
// The workspace packages (@browser-games/*, @portal/*) are resolved here by
// alias so suites that import the gateway/adapters run without relying on
// node_modules symlinks being present in every checkout.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@browser-games/engine-poker/handEval": resolve(
        __dirname,
        "packages/engines/poker/src/handEval.js",
      ),
      "@browser-games/engine-poker": resolve(
        __dirname,
        "packages/engines/poker/src/engine.js",
      ),
      "@browser-games/engine-sheng-ji": resolve(
        __dirname,
        "packages/engines/sheng-ji/src/engine.js",
      ),
      "@browser-games/engine-reversi": resolve(
        __dirname,
        "packages/engines/reversi/src/engine.js",
      ),
      "@portal/shared/version": resolve(__dirname, "packages/shared/src/version.js"),
      "@portal/shared/validate": resolve(__dirname, "packages/shared/src/validate.js"),
      "@portal/shared/rateLimit": resolve(__dirname, "packages/shared/src/rateLimit.js"),
      "@portal/shared/sanitize": resolve(__dirname, "packages/shared/src/sanitize.js"),
      "@portal/shared/leaderboard": resolve(__dirname, "packages/shared/src/leaderboard.js"),
      "@portal/shared/identity": resolve(__dirname, "packages/shared/src/identity.js"),
      "@portal/shared/metrics": resolve(__dirname, "packages/shared/src/metrics.js"),
      "@portal/shared/registry": resolve(__dirname, "packages/shared/src/registry.js"),
      "@portal/shared": resolve(__dirname, "packages/shared/src/registry.js"),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
  },
});
