import { useState, useEffect } from 'react';
import { fetchLeaderboard } from './leaderboard.ts';

interface LeaderboardEntry {
  playerId: string;
  rank: number;
  wins: number;
  games: number;
}

// Generic leaderboard chrome: renders the board scopes (all-time / weekly /
// daily) for a game, optionally scoped to a room.
export function Leaderboard({ gameId, roomCode }: { gameId: string; roomCode?: string }) {
  const [window, setWindow] = useState('all-time');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  useEffect(() => {
    fetchLeaderboard({ gameId, roomCode, window }).then((d) =>
      setEntries((d as { entries?: LeaderboardEntry[] })?.entries ?? []),
    );
  }, [gameId, roomCode, window]);
  return (
    <section aria-label="Leaderboard" className="leaderboard">
      <h2>Leaderboard</h2>
      <div className="leaderboard-tabs">
        {['all-time', 'weekly', 'daily'].map((w) => (
          <button
            key={w}
            className={`btn btn-sm${window === w ? ' btn-active' : ''}`}
            type="button"
            onClick={() => setWindow(w)}
          >
            {w}
          </button>
        ))}
      </div>
      {entries.length === 0 ? (
        <p>No data yet.</p>
      ) : (
        <ol className="leaderboard-list">
          {entries.map((e) => (
            <li key={e.playerId}>
              #{e.rank} — {e.playerId.slice(0, 8)}… · {e.wins}W / {e.games}G
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
