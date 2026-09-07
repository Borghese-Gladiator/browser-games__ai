import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { games } from "./packages/shared/src/registry.ts";

// Multi-page build. The portal lives at the root; each game is its own page
// under /games/<id>/. Inputs are derived from the shared registry so adding a
// game requires only a registry entry — no edit here.
const input = {
  portal: resolve(__dirname, "index.html"),
  ...Object.fromEntries(
    games.map((g) => [g.id, resolve(__dirname, `games/${g.id}/index.html`)]),
  ),
};

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: { input },
  },
});
