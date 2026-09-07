// Minimal client surface for the leaderboard/stats HTTP API. Pure fetch
// wrappers — no React, no hooks — so they can be imported anywhere. Full
// leaderboard UI components belong to the client-framework layer.

// HTTP origin for the gateway, derived from the WS URL (ws:// -> http://).
function base(): string {
  const gw = import.meta.env?.VITE_GATEWAY_URL;
  if (!gw) return 'http://localhost:3001';
  return gw.replace(/^ws/, 'http');
}

export interface LeaderboardQuery {
  gameId?: string;
  roomCode?: string;
  window?: string;
}

export function fetchLeaderboard({ gameId, roomCode, window = 'all-time' }: LeaderboardQuery = {}): Promise<unknown> {
  const p = new URLSearchParams({ window });
  if (gameId) p.set('gameId', gameId);
  if (roomCode) p.set('roomCode', roomCode);
  return fetch(`${base()}/api/leaderboard?${p}`).then((r) => r.json());
}

export function fetchHistory(playerId: string): Promise<unknown> {
  return fetch(`${base()}/api/history?playerId=${encodeURIComponent(playerId)}`).then((r) => r.json());
}

export function fetchH2H(playerA: string, playerB: string): Promise<unknown> {
  const p = new URLSearchParams({ playerA, playerB });
  return fetch(`${base()}/api/h2h?${p}`).then((r) => r.json());
}
