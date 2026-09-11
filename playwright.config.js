import { defineConfig } from "@playwright/test";
import { GATEWAY, GATEWAY_PORT, VITE_PORT } from "./e2e/ports.js";

// Boots the single game gateway and the Vite dev server, then runs the E2E
// spec. Per-context video/trace recording is configured in the spec so all four
// player streams are captured independently.
//
// Both ports come from e2e/ports.js and default to the dev ports. Set
// E2E_GATEWAY_PORT and E2E_VITE_PORT to run the suite beside a dev server that
// already holds 3001/5173.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  outputDir: "e2e/artifacts",
  webServer: [
    {
      // Point persistence at a throwaway dir so each run starts from clean
      // state (no leftover rooms, outcomes, or achievements skewing specs).
      command: "node bin/dev-server.js",
      port: GATEWAY_PORT,
      timeout: 10_000,
      reuseExistingServer: false,
      env: {
        PORT: String(GATEWAY_PORT),
        SNAPSHOTS_PATH: ".state/e2e/snapshots",
        OUTCOMES_PATH: ".state/e2e/outcomes.json",
        ACHIEVEMENTS_PATH: ".state/e2e/achievements.json",
        EVENTS_PATH: ".state/e2e/events",
        // One shared per-IP bucket serves the whole suite; widen it so combined
        // load doesn't trip a production-tight limit (see TODO §3).
        RATE_LIMIT_CAPACITY: "100000",
      },
    },
    {
      command: `npx vite --port ${VITE_PORT}`,
      port: VITE_PORT,
      timeout: 30_000,
      reuseExistingServer: false,
      // The client defaults to localhost:3001; point it at the gateway this
      // run actually booted.
      env: { VITE_GATEWAY_URL: GATEWAY },
    },
  ],
});
