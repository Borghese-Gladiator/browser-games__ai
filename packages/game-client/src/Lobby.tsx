// Shared lobby for every multiplayer game — the front desk of the parlor.
//
// One dominant action (Quick Match: fills empty seats with bots), then the
// private table, then the live public-table list. The player's name is
// remembered across sessions through useIdentity.
//
// The accessible names "Your name", "Create room", "Room code" and "Join by
// code" are the contract the E2E helpers drive. Keep them.
import { useEffect, useState } from 'react';
import { useIdentity } from './useIdentity.ts';
import { PlayerCodeModal } from './PlayerCodeModal.tsx';
import type { RoomSummary } from './protocol.ts';

interface LobbyProps {
  title: string;
  subtitle?: string;
  rooms: RoomSummary[];
  error?: string;
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onRefresh?: () => void;
  onQuickMatch?: (name: string) => void;
  onSpectate?: (code: string) => void;
}

// A row of seat pips: filled for a taken seat, hollow for an open one.
function SeatPips({ players, max }: { players: number; max: number }) {
  return (
    <span className="seat-pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`seat-pip${i < players ? ' is-taken' : ''}`} />
      ))}
    </span>
  );
}

export function Lobby({
  title,
  subtitle,
  rooms,
  error,
  onCreate,
  onJoin,
  onRefresh,
  onQuickMatch,
  onSpectate,
}: LobbyProps) {
  const { name, setName, color, playerCode, importIdentity } = useIdentity();
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  const trimmed = name.trim();
  const nameOk = trimmed.length > 0;
  const open = rooms.filter((r) => !r.locked && r.players < r.max).length;

  return (
    <div className="lobby-page">
      <header className="lobby-top">
        <a className="lobby-back" href="/">
          ← All games
        </a>
        <button
          className="lobby-id"
          type="button"
          onClick={() => setShowCode(true)}
          aria-label="Player code"
        >
          <span className="lobby-avatar" style={{ background: color }} aria-hidden="true" />
          <span className="lobby-id-name">{nameOk ? trimmed : 'Guest'}</span>
        </button>
      </header>

      <main className="lobby">
        <div className="lobby-masthead">
          <p className="eyebrow">Table lobby</p>
          <h1 className="lobby-title">{title}</h1>
          {subtitle && <p className="lobby-sub">{subtitle}</p>}
        </div>

        <label className="field" htmlFor="player-name">
          <span className="field-label">Your name</span>
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

        <div className="lobby-grid">
        {onQuickMatch && (
          <section className="card card-hero" aria-label="Quick match">
            <div className="hero-copy">
              <h2 className="card-title">Quick Match</h2>
              <p className="hero-sub">
                Sit down now. Any empty seat fills with a bot, so the hand starts
                immediately.
              </p>
            </div>
            <div className="hero-action">
              <button
                className="btn btn-primary btn-block"
                type="button"
                disabled={!nameOk}
                onClick={() => onQuickMatch(trimmed)}
              >
                Play now
              </button>
              {!nameOk && <p className="hint">Enter a name first.</p>}
            </div>
          </section>
        )}

        <section className="card" aria-label="Private table">
          <h2 className="card-title">Private Table</h2>
          <p className="card-sub">Host a room and pass the code to your friends.</p>
          <button
            className="btn btn-block"
            type="button"
            disabled={!nameOk}
            onClick={() => onCreate(trimmed)}
          >
            Create room
          </button>
          <p className="rule-or">
            <span>or join with a code</span>
          </p>
          <form
            className="join-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (nameOk && code.trim()) onJoin(code.trim().toUpperCase(), trimmed);
            }}
          >
            <label className="sr-only" htmlFor="room-code">
              Room code
            </label>
            <input
              id="room-code"
              className="code-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD"
              maxLength={4}
              autoComplete="off"
            />
            <button
              className="btn"
              type="submit"
              aria-label="Join by code"
              disabled={!nameOk || !code.trim()}
            >
              Join
            </button>
          </form>
        </section>

        <section aria-label="Public tables" className="card">
          <div className="card-head">
            <h2 className="card-title">Open Tables</h2>
            <span className="table-count">
              <span className={`live-dot${open > 0 ? ' is-live' : ''}`} aria-hidden="true" />
              {open} open
            </span>
          </div>
          {rooms.length === 0 ? (
            <p className="empty">
              No tables yet. Host one, or hit Play now and the bots will sit down
              with you.
            </p>
          ) : (
            <ul className="table-list">
              {rooms.map((r) => (
                <li key={r.code} className="table-row">
                  <button
                    className="table-main"
                    type="button"
                    disabled={!nameOk}
                    onClick={() => onJoin(r.code, trimmed)}
                  >
                    <span className="table-id">
                      <span className="table-code">{r.code}</span>
                      {r.host && <span className="table-host">hosted by {r.host}</span>}
                    </span>
                    <span className="table-meta">
                      <SeatPips players={r.players} max={r.max} />
                      <span className="table-seats">
                        {r.players}/{r.max}
                      </span>
                      {r.locked && <span className="table-locked">Locked</span>}
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
          <button className="btn btn-link lobby-refresh" type="button" onClick={() => onRefresh?.()}>
            ↻ Refresh
          </button>
        </section>
        </div>

        {error && (
          <p role="alert" className="lobby-error">
            {error}
          </p>
        )}
      </main>

      {showCode && (
        <PlayerCodeModal
          playerCode={playerCode}
          onImport={importIdentity}
          onClose={() => setShowCode(false)}
        />
      )}
    </div>
  );
}
