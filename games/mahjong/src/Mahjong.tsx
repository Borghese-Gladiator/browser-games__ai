import { useState } from "react";
import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";
import type { GameState } from "@browser-games/game-client/protocol";
import type { Wind } from "@browser-games/engine-mahjong";
import type { SeatPosition } from "./tiles.ts";
import { tileLabel, sortTiles } from "./tiles.ts";
import { TileFace, TileBack } from "./TileFace.tsx";
import { NamePlate } from "./board/NamePlate.tsx";
import { Hud } from "./board/Hud.tsx";
import { VisibleCopiesPanel } from "./board/VisibleCopiesPanel.tsx";
import { TaiIndicator } from "./board/TaiIndicator.tsx";
import { TurnTimerBar, useTurnClock } from "./board/TurnTimerBar.tsx";
import { computeVisibleCopies } from "./board/visibleCopies.ts";
import { computeTai } from "./board/tai.ts";

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

const RULESET = "台灣 16-tile";
const TURN_MS = 20000;

const WIND_CODE: Wind[] = ["E", "S", "W", "N"];
const WIND_GLYPH: Record<Wind, string> = { E: "東", S: "南", W: "西", N: "北" };
const WIND_NAME: Record<Wind, string> = { E: "East", S: "South", W: "West", N: "North" };
// The primary action per phase. It gets the amber, filled treatment.
const PRIMARY_ACTION = new Set(["win", "draw"]);

function seatWind(seat: number): Wind {
  return WIND_CODE[((seat % 4) + 4) % 4];
}

function isBotName(name: string): boolean {
  return /^Bot \d/.test(name);
}

// The seat position of an opponent relative to the local player. Turn order runs
// to the right, so seat+1 sits at the right, seat+2 across the top, seat+3 left.
function relativePosition(oppSeat: number, mySeat: number): SeatPosition {
  const offset = ((oppSeat - mySeat) % 4 + 4) % 4;
  return offset === 1 ? "right" : offset === 2 ? "top" : "left";
}

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

// A row of face-up tiles (discards, melds, flowers) oriented toward a seat.
function TileRow({
  tiles,
  orientation,
  className,
  ariaLabel,
}: {
  tiles: string[];
  orientation: SeatPosition;
  className: string;
  ariaLabel?: string;
}) {
  return (
    <ul className={`mj-tile-row ${className}`} aria-label={ariaLabel}>
      {tiles.map((t, i) => (
        <li key={`${i}-${t}`}>
          <TileFace tile={t} size="xs" orientation={orientation} />
        </li>
      ))}
    </ul>
  );
}

function MeldRow({ melds, orientation }: { melds: MahjongMeld[]; orientation: SeatPosition }) {
  if (melds.length === 0) return null;
  return (
    <TileRow
      tiles={melds.flatMap((m) => m.tiles)}
      orientation={orientation}
      className="mj-meld-row"
    />
  );
}

// One clickable concealed tile in the local hand. Selection is by click.
function TileButton({
  tileId,
  disabled,
  highlighted,
  onSelect,
}: {
  tileId: string;
  disabled: boolean;
  highlighted?: boolean;
  onSelect: (tileId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`mj-tile-btn${highlighted ? " mj-tile-btn--drawn" : ""}`}
      aria-label={disabled ? tileLabel(tileId) : `Discard ${tileLabel(tileId)}`}
      disabled={disabled}
      onClick={() => onSelect(tileId)}
    >
      <TileFace tile={tileId} size="lg" highlighted={highlighted} decorative />
    </button>
  );
}

// An opponent's public information only: count backs, melds, flowers, discards.
// No concealed tile is ever shown.
function OpponentArea({
  player,
  isActive,
  position,
}: {
  player: MahjongOpponent;
  isActive: boolean;
  position: SeatPosition;
}) {
  const wind = seatWind(player.seat);
  return (
    <div
      className={`mj-opponent mj-opponent--${position}`}
      aria-label={`Opponent ${player.name}`}
      aria-current={isActive ? "true" : undefined}
    >
      <NamePlate
        wind={WIND_GLYPH[wind]}
        windName={WIND_NAME[wind]}
        name={player.name}
        isBot={isBotName(player.name)}
        isDealer={player.seat === 0}
        isTurn={isActive}
      />
      <p className="mj-muted mj-opponent-meta">
        {player.count} tiles · {player.melds.length} melds · {player.flowers.length} flowers
      </p>
      <TileBack count={player.count} orientation={position} />
      <MeldRow melds={player.melds} orientation={position} />
      {player.flowers.length > 0 && (
        <TileRow
          tiles={player.flowers}
          orientation={position}
          className="mj-flower-row"
          ariaLabel={`${player.name} flowers`}
        />
      )}
      <TileRow
        tiles={player.discards}
        orientation={position}
        className="mj-discard-row"
        ariaLabel={`${player.name} discards`}
      />
    </div>
  );
}

function CentreWall({
  tilesLeft,
  lastDiscard,
}: {
  tilesLeft: number;
  lastDiscard: { seat: number; tile: string } | null;
}) {
  return (
    <div className="mj-centre" aria-label="Centre">
      <div className="mj-wall-ring">
        <span className="mj-wall-count">{tilesLeft}</span>
        <span className="mj-wall-label">tiles left</span>
      </div>
      {lastDiscard ? (
        <div className="mj-last-discard">
          <span className="mj-label">Last discard</span>
          <TileFace tile={lastDiscard.tile} size="md" highlighted />
        </div>
      ) : (
        <p className="mj-muted">No discard yet</p>
      )}
    </div>
  );
}

function ActionBar({
  actions,
  onAct,
  timer,
}: {
  actions: MahjongAction[];
  onAct: (action: MahjongAction) => void;
  timer: React.ReactNode;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mj-actionbar">
      {timer}
      <ul className="mj-actions">
        {actions.map((action, index) => {
          const primary = PRIMARY_ACTION.has(action.type);
          return (
            <li key={`${action.type}-${action.tiles?.join(",") ?? index}`}>
              <button
                type="button"
                className={`mj-action-btn${primary ? " mj-action-btn--primary" : ""}`}
                onClick={() => onAct(action)}
              >
                {action.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PlayerArea({
  view,
  discardByTile,
  onSelectTile,
  onAct,
  timer,
}: {
  view: MahjongView;
  discardByTile: Map<string, MahjongAction>;
  onSelectTile: (tileId: string) => void;
  onAct: (action: MahjongAction) => void;
  timer: React.ReactNode;
}) {
  const wind = seatWind(view.mySeat);
  const canDiscard = discardByTile.size > 0;
  const raw = view.myHand;
  const justDrawn =
    canDiscard && raw.length > 0 && discardByTile.has(raw[raw.length - 1])
      ? raw[raw.length - 1]
      : undefined;
  const rest = justDrawn ? raw.filter((id) => id !== justDrawn) : raw;
  const sorted = sortTiles(rest);
  const barActions = view.availableActions.filter((a) => a.type !== "discard");

  return (
    <div className="mj-player">
      <div className="mj-player-head">
        <NamePlate
          wind={WIND_GLYPH[wind]}
          windName={WIND_NAME[wind]}
          name="You"
          isBot={false}
          isDealer={view.mySeat === 0}
          isTurn={view.mySeat === view.activeSeat}
        />
        {view.myFlowers.length > 0 && (
          <TileRow
            tiles={view.myFlowers}
            orientation="bottom"
            className="mj-flower-row"
            ariaLabel="Your flowers"
          />
        )}
      </div>

      {view.myMelds.length > 0 && (
        <section aria-label="Your melds">
          <MeldRow melds={view.myMelds} orientation="bottom" />
        </section>
      )}

      <section aria-label="Your discards">
        <p className="mj-label">Your discards</p>
        {view.myDiscards.length === 0 ? (
          <p className="mj-muted">None</p>
        ) : (
          <TileRow tiles={view.myDiscards} orientation="bottom" className="mj-discard-row" />
        )}
      </section>

      <section aria-label="Your hand">
        <p className="mj-label">Your hand</p>
        <ul className="mj-hand">
          {sorted.map((tileId, i) => (
            <li key={`${i}-${tileId}`}>
              <TileButton
                tileId={tileId}
                disabled={!discardByTile.has(tileId)}
                onSelect={onSelectTile}
              />
            </li>
          ))}
          {justDrawn && (
            <li className="mj-hand-drawn">
              <TileButton
                tileId={justDrawn}
                disabled={!discardByTile.has(justDrawn)}
                highlighted
                onSelect={onSelectTile}
              />
            </li>
          )}
        </ul>
      </section>

      <section aria-label="Your actions">
        <ActionBar actions={barActions} onAct={onAct} timer={timer} />
      </section>
    </div>
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
    leaveRoom,
    send,
    restart,
    needsRefresh,
    gameState: rawGameState,
  } = useGameSocket("mahjong");
  const view = rawGameState as MahjongView | null;

  const [paused, setPaused] = useState(false);
  const [showPanels, setShowPanels] = useState(true);

  // Hooks must run every render, so derive the timer inputs before any early
  // return. The clock keys off the available-action signature only.
  const actionSig = view ? view.availableActions.map((a) => `${a.type}:${a.tile ?? ""}`).join("|") : "";
  const timerActive = !!view && !view.result && !paused && view.availableActions.length > 0;
  const remainingMs = useTurnClock(timerActive, actionSig, TURN_MS);

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

  const discardByTile = new Map<string, MahjongAction>();
  for (const action of view.availableActions) {
    if (action.type === "discard" && action.tile) discardByTile.set(action.tile, action);
  }
  const onSelectTile = (tileId: string) => {
    const action = discardByTile.get(tileId);
    if (action) send(actionMessage(action));
  };

  const byPosition = (pos: SeatPosition) =>
    view.opponents.find((o) => relativePosition(o.seat, view.mySeat) === pos);
  const left = byPosition("left");
  const top = byPosition("top");
  const right = byPosition("right");

  const visibleEntries = computeVisibleCopies({
    opponentDiscards: view.opponents.map((o) => o.discards),
    myDiscards: view.myDiscards,
    lastDiscard: view.lastDiscard?.tile,
    visibleMelds: [
      ...view.opponents.flatMap((o) => o.melds.map((m) => m.tiles)),
      ...view.myMelds.map((m) => m.tiles),
    ],
    visibleFlowers: [...view.opponents.flatMap((o) => o.flowers), ...view.myFlowers],
  });

  const taiState = computeTai({
    hand: view.myHand,
    melds: view.myMelds,
    flowers: view.myFlowers,
    seatWind: seatWind(view.mySeat),
    isDealer: view.mySeat === 0,
  });

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  };

  const renderOpponent = (opp: MahjongOpponent | undefined, pos: SeatPosition) =>
    opp ? (
      <OpponentArea player={opp} isActive={opp.seat === view.activeSeat} position={pos} />
    ) : null;

  return (
    <main className="mj" data-my-seat={view.mySeat}>
      <RefreshBanner needsRefresh={needsRefresh} />

      <div className="mj-topbar">
        <p className="mj-back">
          <a href="/">← All games</a>
        </p>
        <h1>Mahjong (台灣麻將)</h1>
        <div className="mj-topbar-right">
          <span className="mj-room">Room: {room.code}</span>
          <button className="btn mj-leave" type="button" onClick={leaveRoom}>
            Leave
          </button>
        </div>
      </div>

      <Hud
        round={1}
        prevailingWind={WIND_NAME.E}
        handNumber={1}
        tilesLeft={view.wallCount}
        ruleset={RULESET}
        paused={paused}
        onPause={() => setPaused((p) => !p)}
        onToggleFullscreen={toggleFullscreen}
        onOpenSettings={() => setShowPanels((s) => !s)}
      />

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

      <section aria-label="Status" className="mj-status">
        <p role="status" aria-live="polite">
          {statusText(view)}
        </p>
      </section>

      <div className="mj-layout">
        <section className="mj-felt" aria-label="Table">
          <div className="mj-seat-top">{renderOpponent(top, "top")}</div>
          <div className="mj-seat-left">{renderOpponent(left, "left")}</div>
          <div className="mj-seat-centre">
            <CentreWall tilesLeft={view.wallCount} lastDiscard={view.lastDiscard} />
          </div>
          <div className="mj-seat-right">{renderOpponent(right, "right")}</div>
          <div className="mj-seat-bottom">
            <PlayerArea
              view={view}
              discardByTile={discardByTile}
              onSelectTile={onSelectTile}
              onAct={(action) => send(actionMessage(action))}
              timer={
                timerActive ? <TurnTimerBar remainingMs={remainingMs} totalMs={TURN_MS} /> : null
              }
            />
          </div>
        </section>

        {showPanels && (
          <aside className="mj-aside" aria-label="Board insight">
            <TaiIndicator state={taiState} />
            <VisibleCopiesPanel entries={visibleEntries} />
          </aside>
        )}
      </div>

      {view.result && (
        <button className="btn mj-restart" type="button" onClick={restart}>
          New Hand
        </button>
      )}

      {paused && (
        <div className="mj-paused" role="dialog" aria-label="Paused">
          <div className="mj-paused-card">
            <p className="mj-paused-title">Paused</p>
            <button className="btn" type="button" onClick={() => setPaused(false)}>
              Resume
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
