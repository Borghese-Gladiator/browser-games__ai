import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { games, pages } from "./packages/shared/src/registry.ts";

// Multi-page build. The portal lives at the root; each game is its own page
// under /games/<id>/ and each top-level page under its own path. Inputs are
// derived from the shared registry so adding a game or a page requires only a
// registry entry — no edit here.
const input = {
  portal: resolve(__dirname, "index.html"),
  ...Object.fromEntries(
    games.map((g) => [g.id, resolve(__dirname, `games/${g.id}/index.html`)]),
  ),
  ...Object.fromEntries(
    pages.map((p) => [p.id, resolve(__dirname, p.entry)]),
  ),
};

// Dev-only single-page fallback for dynamic registry pages: serve the page's
// entry for any sub-path (e.g. /history/:gameId) so the client can read it. Also
// derived from the registry, so a new dynamic page needs no edit here.
function registrySpaFallback() {
  const dynamic = pages.filter((p) => p.dynamic);
  return {
    name: "registry-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        // Only rewrite navigations (Accept: text/html). Asset/module requests
        // such as /history/src/main.tsx must pass through untouched.
        const accept = req.headers.accept ?? "";
        if (!accept.includes("text/html")) {
          next();
          return;
        }
        const url = (req.url ?? "").split("?")[0];
        for (const p of dynamic) {
          const base = p.path.replace(/\/$/, "");
          if (url !== p.path && (url === base || url.startsWith(base + "/"))) {
            req.url = p.path;
            break;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), registrySpaFallback()],
  build: {
    rollupOptions: { input },
  },
});
