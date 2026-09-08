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
  myDiscards: string[];
  opponents: MahjongOpponent[];
  availableActions: MahjongAction[];
  result: { kind: string; winner: number | null } | null;
}

const SUIT_SUFFIX: Record<string, string> = { characters: "m", bamboo: "s", dots: "p" };
const SUIT_WORD: Record<string, string> = {
  characters: "characters",
  bamboo: "bamboo",
  dots: "dots",
};

// Compact tile glyph for display, e.g. "5p", "east", "plum".
function tileShort(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  return `${second}${SUIT_SUFFIX[prefix] ?? ""}`;
}

// Full accessible name for a tile, used for button aria-labels.
function tileLabel(tileId: string): string {
  const [prefix, second] = tileId.split("-");
  if (prefix === "honor" || prefix === "flower") return second;
  return `${second} ${SUIT_WORD[prefix] ?? prefix}`;
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
      view.players.find((p) => p.seat === view.result?.winner)?.name ??
      `Seat ${view.result.winner}`;
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

// One clickable concealed tile in the player's hand. Selection is by click.
function TileButton({
  tileId,
  disabled,
  onSelect,
}: {
  tileId: string;
  disabled: boolean;
  onSelect: (tileId: string) => void;
}) {
  return (
    <button
      type="button"
      className="mj-tile-btn"
      aria-label={disabled ? tileLabel(tileId) : `Discard ${tileLabel(tileId)}`}
      disabled={disabled}
      onClick={() => onSelect(tileId)}
    >
      {tileShort(tileId)}
    </button>
  );
}

// An opponent's public information: tile count, melds, flowers, and discards.
// No concealed tile is ever shown.
function OpponentArea({ player, isActive }: { player: MahjongOpponent; isActive: boolean }) {
  return (
    <div
      className="mj-opponent"
      aria-label={`Opponent ${player.name}`}
      aria-current={isActive ? "true" : undefined}
    >
      <p className="mj-opponent-name">
        {player.name} <span className="mj-muted">(seat {player.seat})</span>
      </p>
      <p className="mj-muted">
        {player.count} tiles · {player.melds.length} melds · {player.flowers.length} flowers
      </p>
      {player.melds.length > 0 && (
        <ul className="mj-tile-row" aria-label={`${player.name} melds`}>
          {player.melds.flatMap((m, mi) =>
            m.tiles.map((t, ti) => (
              <li key={`${mi}-${ti}-${t}`} className="mj-tile-face mj-tile-meld">
                {tileShort(t)}
              </li>
            )),
          )}
        </ul>
      )}
      <ul className="mj-tile-row mj-discard-row" aria-label={`${player.name} discards`}>
        {player.discards.map((t, i) => (
          <li key={`${i}-${t}`} className="mj-tile-face">
            {tileShort(t)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Render one button per available action. This is the single source of action
// legality in React; it renders the engine's actions verbatim.
function ActionBar({
  actions,
  onAct,
}: {
  actions: MahjongAction[];
  onAct: (action: MahjongAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <ul className="mj-actions">
      {actions.map((action, index) => (
        <li key={`${action.type}-${action.tiles?.join(",") ?? index}`}>
          <button type="button" className="mj-action-btn" onClick={() => onAct(action)}>
            {action.label}
          </button>
        </li>
      ))}
    </ul>
  );
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

  // Split the engine actions: per-tile discards drive the hand tiles, the rest
  // drive the action bar. Legality stays entirely engine-derived.
  const discardByTile = new Map<string, MahjongAction>();
  const barActions: MahjongAction[] = [];
  for (const action of view.availableActions) {
    if (action.type === "discard" && action.tile) discardByTile.set(action.tile, action);
    else barActions.push(action);
  }

  const onSelectTile = (tileId: string) => {
    const action = discardByTile.get(tileId);
    if (action) send(actionMessage(action));
  };

  return (
    <main className="mj">
      <RefreshBanner needsRefresh={needsRefresh} />
      <p className="mj-back">
        <a href="/">← All games</a>
      </p>
      <h1>Mahjong (台灣麻將)</h1>
      <p className="mj-room">Room: {room.code}</p>

      {isHost && view.phase !== "PLAYING" && (
        <section aria-label="Host controls" className="mj-host">
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

      <section className="mj-table" aria-label="Table">
        <div className="mj-opp-left">
          {view.opponents[0] && (
            <OpponentArea
              player={view.opponents[0]}
              isActive={view.opponents[0].seat === view.activeSeat}
            />
          )}
        </div>
        <div className="mj-opp-top">
          {view.opponents[1] && (
            <OpponentArea
              player={view.opponents[1]}
              isActive={view.opponents[1].seat === view.activeSeat}
            />
          )}
        </div>
        <div className="mj-opp-right">
          {view.opponents[2] && (
            <OpponentArea
              player={view.opponents[2]}
              isActive={view.opponents[2].seat === view.activeSeat}
            />
          )}
        </div>
        <div className="mj-center" aria-label="Centre">
          <p className="mj-wall">Wall: {view.wallCount} tiles</p>
          {view.lastDiscard ? (
            <p className="mj-last-discard">
              Last discard:{" "}
              <span className="mj-tile-face mj-tile-hot">{tileShort(view.lastDiscard.tile)}</span>{" "}
              <span className="mj-muted">(seat {view.lastDiscard.seat})</span>
            </p>
          ) : (
            <p className="mj-muted">No discard yet</p>
          )}
        </div>
      </section>

      <section aria-label="Your discards">
        <p className="mj-label">Your discards</p>
        <ul className="mj-tile-row mj-discard-row">
          {view.myDiscards.length === 0 ? (
            <li className="mj-muted">None</li>
          ) : (
            view.myDiscards.map((t, i) => (
              <li key={`${i}-${t}`} className="mj-tile-face">
                {tileShort(t)}
              </li>
            ))
          )}
        </ul>
      </section>

      <section aria-label="Your melds">
        {view.myMelds.length > 0 && (
          <ul className="mj-tile-row" aria-label="Your melds tiles">
            {view.myMelds.flatMap((m, mi) =>
              m.tiles.map((t, ti) => (
                <li key={`${mi}-${ti}-${t}`} className="mj-tile-face mj-tile-meld">
                  {tileShort(t)}
                </li>
              )),
            )}
          </ul>
        )}
      </section>

      <section aria-label="Your hand">
        <p className="mj-label">Your hand</p>
        <ul className="mj-hand">
          {view.myHand.map((tileId, i) => (
            <li key={`${i}-${tileId}`}>
              <TileButton
                tileId={tileId}
                disabled={!discardByTile.has(tileId)}
                onSelect={onSelectTile}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your actions">
        <ActionBar actions={barActions} onAct={(action) => send(actionMessage(action))} />
      </section>

      {view.result && (
        <button className="btn" type="button" onClick={restart}>
          New Hand
        </button>
      )}
    </main>
  );
}
