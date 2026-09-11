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
        "packages/engines/poker/src/handEval.ts",
      ),
      "@browser-games/engine-poker": resolve(
        __dirname,
        "packages/engines/poker/src/engine.ts",
      ),
      "@browser-games/engine-sheng-ji": resolve(
        __dirname,
        "packages/engines/sheng-ji/src/engine.ts",
      ),
      "@browser-games/engine-reversi": resolve(
        __dirname,
        "packages/engines/reversi/src/engine.ts",
      ),
      "@browser-games/engine-president": resolve(
        __dirname,
        "packages/engines/president/src/engine.ts",
      ),
      "@browser-games/engine-mahjong-analysis": resolve(
        __dirname,
        "packages/engines/mahjong-analysis/src/index.ts",
      ),
      "@browser-games/engine-mahjong": resolve(
        __dirname,
        "packages/engines/mahjong/src/index.ts",
      ),
      "@browser-games/game-core": resolve(
        __dirname,
        "packages/game-core/src/gateway.ts",
      ),
      "@browser-games/game-client": resolve(
        __dirname,
        "packages/game-client/src",
      ),
      "@portal/shared/version": resolve(__dirname, "packages/shared/src/version.ts"),
      "@portal/shared/validate": resolve(__dirname, "packages/shared/src/validate.ts"),
      "@portal/shared/rateLimit": resolve(__dirname, "packages/shared/src/rateLimit.ts"),
      "@portal/shared/sanitize": resolve(__dirname, "packages/shared/src/sanitize.ts"),
      "@portal/shared/leaderboard": resolve(__dirname, "packages/shared/src/leaderboard.ts"),
      "@portal/shared/identity": resolve(__dirname, "packages/shared/src/identity.ts"),
      "@portal/shared/metrics": resolve(__dirname, "packages/shared/src/metrics.ts"),
      "@portal/shared/severity": resolve(__dirname, "packages/shared/src/severity.ts"),
      "@portal/shared/tiles": resolve(__dirname, "packages/shared/src/tiles/index.ts"),
      "@portal/shared/registry": resolve(__dirname, "packages/shared/src/registry.ts"),
      "@portal/shared": resolve(__dirname, "packages/shared/src/registry.ts"),
    },
  },
  test: {
    // .claude/worktrees holds full checkouts of this repo. Without excluding it
    // vitest collects a second copy of every suite, which doubles the run and
    // produces spurious timeouts.
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**", "**/.claude/**"],
  },
});
