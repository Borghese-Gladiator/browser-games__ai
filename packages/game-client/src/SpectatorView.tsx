import { useEffect, useRef } from 'react';
import type { GameState } from './protocol.ts';

// Spectator/replay viewer. No per-room event log exists from the rooms layer
// yet, so this buffers the public-state stream (last 50 snapshots) — the seam
// is in place to grow into full replay when an event log lands.
export function SpectatorView({ gameState, gameId }: { gameState: GameState | null; gameId: string }) {
  const snapshots = useRef<GameState[]>([]);
  useEffect(() => {
    if (gameState) {
      snapshots.current = [...snapshots.current.slice(-49), gameState];
    }
  }, [gameState]);
  if (!gameState) return <p>Waiting for game state…</p>;
  return (
    <div className="spectator-view">
      <p role="status" className="spectator-banner">
        👁 Watching {gameId} · {snapshots.current.length} updates received
      </p>
      <pre className="spectator-state">{JSON.stringify(gameState, null, 2)}</pre>
    </div>
  );
}
