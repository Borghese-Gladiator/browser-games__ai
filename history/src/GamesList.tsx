import { useEffect, useState } from "react";
import { fetchReviews, type ReviewListEntry } from "./api.ts";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; games: ReviewListEntry[] };

export function GamesList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetchReviews()
      .then((games) => live && setState({ status: "ready", games }))
      .catch((e: Error) => live && setState({ status: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, []);

  return (
    <main className="rv">
      <a className="rv-back" href="/">
        ← All games
      </a>
      <header className="rv-header">
        <h1>Game Review</h1>
        <p className="rv-muted">Replay a finished game and compare each discard against the best move.</p>
      </header>

      {state.status === "loading" && <p className="rv-muted">Loading finished games…</p>}

      {state.status === "error" && (
        <div className="rv-panel rv-panel-error" role="alert">
          <p className="rv-panel-title">Could not load games</p>
          <p className="rv-muted">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && state.games.length === 0 && (
        <div className="rv-panel">
          <p className="rv-panel-title">No finished games yet</p>
          <p className="rv-muted">Play a mahjong game to the end, then return here to review it.</p>
        </div>
      )}

      {state.status === "ready" && state.games.length > 0 && (
        <ul className="rv-list" aria-label="Finished games">
          {state.games.map((g) => (
            <li key={g.roomCode}>
              <a className="rv-list-row" href={`/history/${encodeURIComponent(g.roomCode)}`}>
                <span className="rv-list-code">{g.roomCode}</span>
                <span className="rv-muted">{g.gameType}</span>
                <span className="rv-muted rv-list-date">{new Date(g.ts).toLocaleString()}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
