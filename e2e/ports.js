// Single source of truth for the E2E endpoints. Both default to the dev ports,
// so a plain `npm run test:e2e` behaves as before. Override E2E_GATEWAY_PORT
// and E2E_VITE_PORT to run the suite beside an already-running dev server.
export const GATEWAY_PORT = Number(process.env.E2E_GATEWAY_PORT ?? 3001);
export const VITE_PORT = Number(process.env.E2E_VITE_PORT ?? 5173);

export const GATEWAY = `http://localhost:${GATEWAY_PORT}`;
export const BASE = `http://localhost:${VITE_PORT}`;

export function gamePage(gameId) {
  return `${BASE}/games/${gameId}/`;
}
