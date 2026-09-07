import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";
import type { GameState } from "@browser-games/game-client/protocol";

interface MahjongMeld {
  kind: string;
  tiles: string[];
}

interface MahjongOpponent {
  seat: number;
  name: string;
  count: number;
  melds: MahjongMeld[];
  flowers: string[];
  discards: string[];
}

interface MahjongAction {
  type: "draw" | "discard" | "pong" | "kong" | "chow" | "win" | "pass";
  tile?: string;
  tiles?: string[];
  label: string;
}

interface MahjongView extends GameState {
  phase: string;
  activeSeat: number;
  pendingSeats: number[];
  wallCount: number;
  lastDiscard: { seat: number; tile: string } | null;
  players: { seat: number; name: string }[];
  mySeat: number;
  myHand: string[];
  myMelds: MahjongMeld[];
  myFlowers: string[];
  opponents: MahjongOpponent[];
  availableActions: MahjongAction[];
  result: { kind: string; winner: number | null } | null;
}

// Compact tile glyph, e.g. "5p", "east", "plum".
function tileShort(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  const suffix = prefix === "characters" ? "m" : prefix === "bamboo" ? "s" : "p";
  return `${second}${suffix}`;
}

// One legal action from the engine becomes one wire message. The action bar is
// the single source of legality; the client never re-derives it.
function actionMessage(action: MahjongAction): Record<string, unknown> {
  switch (action.type) {
    case "draw":
      return { draw: true };
    case "discard":
      return { discard: action.tile };
    case "pass":
      return { pass: true };
    default:
      return { claim: { type: action.type, tiles: action.tiles ?? [] } };
  }
}

function statusText(view: MahjongView): string {
  if (view.result) {
    if (view.result.kind === "DRAW") return "Draw — wall exhausted";
    const winnerName =
      view.players.find((p) => p.seat === view.result?.winner)?.name ?? `Seat ${view.result.winner}`;
    return `${winnerName} wins`;
  }
  if (view.phase !== "PLAYING") return `Waiting for players… (${view.players.length}/4)`;
  if (view.pendingSeats.length > 0) {
    return view.pendingSeats.includes(view.mySeat) ? "Claim the discard?" : "Waiting on claims…";
  }
  if (view.mySeat === view.activeSeat) return "Your turn";
  const activeName =
    view.players.find((p) => p.seat === view.activeSeat)?.name ?? `Seat ${view.activeSeat}`;
  return `${activeName}'s turn`;
}

export function Mahjong() {
  const {
    rooms,
    room,
    error,
    listRooms,
    createRoom,
    joinRoom,
    quickMatch,
    spectate,
    startEarly,
    lockRoom,
    send,
    restart,
    needsRefresh,
    gameState: rawGameState,
  } = useGameSocket("mahjong");
  const view = rawGameState as MahjongView | null;

  if (!room || !view) {
    return (
      <>
        <RefreshBanner needsRefresh={needsRefresh} />
        <Lobby
          title="Mahjong (台灣麻將)"
          rooms={rooms}
          error={error}
          onCreate={createRoom}
          onJoin={joinRoom}
          onQuickMatch={quickMatch}
          onSpectate={spectate}
          onRefresh={listRooms}
        />
      </>
    );
  }

  const isHost = view.isHost ?? room.isHost;

  return (
    <main className="mj">
      <RefreshBanner needsRefresh={needsRefresh} />
      <p className="mj-back">
        <a href="/">← All games</a>
      </p>
      <h1>Mahjong (台灣麻將)</h1>
      <p className="mj-room">Room: {room.code}</p>

      {isHost && view.phase !== "PLAYING" && (
        <section aria-label="Host controls">
          <button className="btn" type="button" onClick={startEarly}>
            Start with bots
          </button>
          <button className="btn" type="button" onClick={() => lockRoom(true)}>
            Lock room
          </button>
        </section>
      )}

      <section aria-label="Status">
        <p role="status" aria-live="polite">
          {statusText(view)}
        </p>
      </section>

      <section aria-label="Table">
        <p>Wall: {view.wallCount} tiles</p>
        {view.lastDiscard && (
          <p>
            Last discard: {tileShort(view.lastDiscard.tile)} (seat {view.lastDiscard.seat})
          </p>
        )}
      </section>

      <section aria-label="Opponents">
        <ul className="mj-opponents">
          {view.opponents.map((o) => (
            <li key={o.seat} aria-current={o.seat === view.activeSeat ? "true" : undefined}>
              {o.name} (seat {o.seat}) — {o.count} tiles, {o.melds.length} melds, {o.flowers.length}{" "}
              flowers
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your hand">
        <ul className="mj-hand">
          {view.myHand.map((tileId) => (
            <li key={tileId}>
              <span className="mj-tile-btn">{tileShort(tileId)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Actions">
        <ul className="mj-actions">
          {view.availableActions.map((action, index) => (
            <li key={`${action.type}-${action.tile ?? action.tiles?.join(",") ?? index}`}>
              <button
                type="button"
                className="mj-action-btn"
                onClick={() => send(actionMessage(action))}
              >
                {action.label}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {view.result && (
        <button className="btn" type="button" onClick={restart}>
          New Hand
        </button>
      )}
    </main>
  );
}
