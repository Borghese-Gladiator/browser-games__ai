import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PROOF_VITE_PORT ?? 5199);

export default defineConfig({
  testDir: "./proof-tests",
  timeout: 30_000,
  outputDir: "proof/results",
  reporter: [["list"], ["json", { outputFile: "proof/report.json" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    video: "on",
    trace: "on",
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    timeout: 30_000,
    reuseExistingServer: false,
  },
});
