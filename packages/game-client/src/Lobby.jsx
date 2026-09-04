// Shared lobby UI for multiplayer games. One dominant action — Play now
// (quick-match, fills with bots) — with hosting a private room, joining by code,
// and the live public-table list as secondary paths. The player's name is
// remembered across sessions via useIdentity.
import { useEffect, useState } from "react";
import { useIdentity } from "./useIdentity.js";
import { PlayerCodeModal } from "./PlayerCodeModal.jsx";

export function Lobby({ title, rooms, error, onCreate, onJoin, onRefresh, onQuickMatch, onSpectate }) {
  const { name, setName, color, playerCode, importIdentity } = useIdentity();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;

  return (
    <main className="lobby">
      <header className="lobby-head">
        <a className="lobby-back" href="/">← All games</a>
        <h1>{title}</h1>
      </header>

      <label className="lobby-name" htmlFor="player-name">
        <span>Your name</span>
        <input
          id="player-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter a name to play"
          autoComplete="off"
          required
        />
      </label>

      {onQuickMatch && (
        <section className="lobby-card lobby-hero" aria-label="Quick match">
          <p className="lobby-hero-title">Quick Match</p>
          <p className="lobby-hero-sub">
            Jump straight in — we’ll fill any empty seats with bots so you never wait.
          </p>
          <button
            className="btn btn-primary btn-block"
            type="button"
            disabled={!nameOk}
            onClick={() => onQuickMatch(trimmed)}
          >
            <span aria-hidden="true">⚡ </span>Play now
          </button>
        </section>
      )}

      <section className="lobby-card" aria-label="Private table">
        <h2 className="lobby-card-title">Private Table</h2>
        <button
          className="btn btn-ghost btn-block"
          type="button"
          disabled={!nameOk}
          onClick={() => onCreate(trimmed)}
        >
          <span aria-hidden="true">＋ </span>Create room
        </button>
        <p className="lobby-or">or join with a code</p>
        <form
          className="lobby-join"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameOk && code.trim()) onJoin(code.trim().toUpperCase(), trimmed);
          }}
        >
          <label className="sr-only" htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD"
            maxLength={4}
            autoComplete="off"
          />
          <button
            className="btn btn-ghost"
            type="submit"
            aria-label="Join by code"
            disabled={!nameOk || !code.trim()}
          >
            Join
          </button>
        </form>
      </section>

      <section aria-label="Public tables" className="lobby-card lobby-rooms">
        <div className="lobby-card-head">
          <h2 className="lobby-card-title">Public Tables</h2>
          <button className="btn btn-link" type="button" onClick={() => onRefresh?.()}>
            ↻ Refresh
          </button>
        </div>
        {rooms.length === 0 ? (
          <p className="lobby-empty">No open tables yet — host one or hit Play now.</p>
        ) : (
          <ul>
            {rooms.map((r) => (
              <li key={r.code} className="lobby-room">
                <button
                  className="lobby-room-main"
                  type="button"
                  disabled={!nameOk}
                  onClick={() => onJoin(r.code, trimmed)}
                >
                  <span className="lobby-room-code">{r.code}</span>
                  <span className="lobby-room-meta">
                    {r.players}/{r.max}
                    {r.locked ? " · 🔒" : ""}
                  </span>
                </button>
                {onSpectate && (
                  <button
                    className="btn btn-link"
                    type="button"
                    onClick={() => onSpectate(r.code)}
                  >
                    Watch
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="lobby-error">
          {error}
        </p>
      )}

      <div className="lobby-identity">
        <span className="lobby-avatar" style={{ background: color }} aria-hidden="true" />
        <button className="btn btn-link" type="button" onClick={() => setShowCode(true)}>
          Player code
        </button>
      </div>
      {showCode && (
        <PlayerCodeModal
          playerCode={playerCode}
          onImport={importIdentity}
          onClose={() => setShowCode(false)}
        />
      )}
    </main>
  );
}
