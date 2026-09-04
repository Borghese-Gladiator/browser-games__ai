import { defineConfig } from "@playwright/test";

// Boots the single game gateway and the Vite dev server, then runs the E2E
// spec. Per-context video/trace recording is configured in the spec so all four
// player streams are captured independently.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  outputDir: "e2e/artifacts",
  webServer: [
    {
      // Point persistence at a throwaway dir so each run starts from clean
      // state (no leftover rooms, outcomes, or achievements skewing specs).
      command: "node bin/dev-server.js",
      port: 3001,
      timeout: 10_000,
      reuseExistingServer: false,
      env: {
        SNAPSHOTS_PATH: ".state/e2e/snapshots",
        OUTCOMES_PATH: ".state/e2e/outcomes.json",
        ACHIEVEMENTS_PATH: ".state/e2e/achievements.json",
        // One shared per-IP bucket serves the whole suite; widen it so combined
        // load doesn't trip a production-tight limit (see TODO §3).
        RATE_LIMIT_CAPACITY: "100000",
      },
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
