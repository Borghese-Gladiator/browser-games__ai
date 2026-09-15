import { useEffect, useMemo, useRef, useState } from "react";
import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";
import { LockRoomButton } from "@browser-games/game-client/LockRoomButton";
import type { GameState } from "@browser-games/game-client/protocol";
import type { Wind } from "@browser-games/engine-mahjong";
import {
  estimateTai,
  RULESET as TAI_RULESET,
  type Meld as AnalysisMeld,
  type Position as TaiPosition,
  type Wind as AnalysisWind,
} from "@browser-games/engine-mahjong-analysis";
import type { SeatPosition } from "./tiles.ts";
import { tileLabel, sortTiles, tileKind } from "./tiles.ts";
import { TileFace, TileBack } from "./TileFace.tsx";
import { NamePlate } from "./board/NamePlate.tsx";
import { Hud } from "./board/Hud.tsx";
import { VisibleCopiesPopover } from "./board/VisibleCopiesPanel.tsx";
import { TaiIndicator } from "./board/TaiIndicator.tsx";
import { computeVisibleCopies } from "./board/visibleCopies.ts";
import type { VisibleCopiesEntry } from "./board/visibleCopies.ts";
import { HandEndScreen } from "./HandEndScreen.tsx";
import type { HandEndResult, RevealSeat } from "./HandEndScreen.tsx";

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
  scores: number[];
  result: HandEndResult | null;
  reveal: RevealSeat[] | null;
}

const RULESET = "台灣 16-tile";
const TURN_MS = 20000;

const WIND_CODE: Wind[] = ["E", "S", "W", "N"];
const WIND_GLYPH: Record<Wind, string> = { E: "東", S: "南", W: "西", N: "北" };
const WIND_NAME: Record<Wind, string> = { E: "East", S: "South", W: "West", N: "North" };
// The primary action per phase. It gets the amber, filled treatment.
const PRIMARY_ACTION = new Set(["win"]);

function seatWind(seat: number): Wind {
  return WIND_CODE[((seat % 4) + 4) % 4];
}

const ANALYSIS_WIND: Record<Wind, AnalysisWind> = {
  E: "east",
  S: "south",
  W: "west",
  N: "north",
};

// Map the local seat's public view onto the analysis Position. The fixed
// Taiwanese config runs an East round with the dealer at seat 0, so the round
// wind is always East. Tile ids become analysis kinds through tileKind.
function buildTaiPosition(view: MahjongView): TaiPosition {
  return {
    concealedTiles: view.myHand.map(tileKind),
    exposedMelds: view.myMelds.map((meld) => ({
      tiles: meld.tiles.map(tileKind),
      type: meld.kind as AnalysisMeld["type"],
      concealed: false,
    })),
    flowers: view.myFlowers.map(tileKind),
    seatWind: ANALYSIS_WIND[seatWind(view.mySeat)],
    roundWind: "east",
    isDealer: view.mySeat === 0,
    ruleset: TAI_RULESET,
  };
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

// Claimed sets, each kept as its own group so three pongs never read as one run.
function MeldRow({
  melds,
  orientation,
  ariaLabel,
}: {
  melds: MahjongMeld[];
  orientation: SeatPosition;
  ariaLabel: string;
}) {
  if (melds.length === 0) return null;
  return (
    <div className="mj-melds" aria-label={ariaLabel}>
      {melds.map((meld, i) => (
        <TileRow
          key={`${i}-${meld.kind}`}
          tiles={meld.tiles}
          orientation={orientation}
          className="mj-meld-row"
        />
      ))}
    </div>
  );
}

// One concealed tile in the local hand. Selection is by click.
//
// The mouse handlers sit on the <li>, not the button: a disabled button fires no
// pointer events, and a tile stays inspectable when it is not this seat's turn.
// Focus and blur stay on the button, for the keyboard path.
function HandTile({
  tileId,
  disabled,
  highlighted,
  onSelect,
  onInspect,
  className = "",
}: {
  tileId: string;
  disabled: boolean;
  highlighted?: boolean;
  onSelect: (tileId: string) => void;
  onInspect: (tileId: string | null) => void;
  className?: string;
}) {
  return (
    <li
      className={className}
      onMouseEnter={() => onInspect(tileId)}
      onMouseLeave={() => onInspect(null)}
    >
      <button
        type="button"
        className={`mj-tile-btn${highlighted ? " mj-tile-btn--drawn" : ""}`}
        data-tile={tileId}
        aria-label={disabled ? tileLabel(tileId) : `Discard ${tileLabel(tileId)}`}
        disabled={disabled}
        onClick={() => onSelect(tileId)}
        onFocus={() => onInspect(tileId)}
        onBlur={() => onInspect(null)}
      >
        <TileFace tile={tileId} size="lg" highlighted={highlighted} decorative />
      </button>
    </li>
  );
}

// An opponent's public information only: concealed backs, then the claimed melds
// and the flowers face up. The discards live in the centre river, not here. No
// concealed tile is ever shown.
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
      <TileBack count={player.count} orientation={position} />
      <MeldRow
        melds={player.melds}
        orientation={position}
        ariaLabel={`${player.name} melds`}
      />
      {player.flowers.length > 0 && (
        <TileRow
          tiles={player.flowers}
          orientation={position}
          className="mj-flower-row"
          ariaLabel={`${player.name} flowers`}
        />
      )}
    </div>
  );
}

// One seat's river, on that seat's side of the centre. Six tiles per row, the
// way a real table stacks a discard pile.
function River({
  tiles,
  position,
  ariaLabel,
  lastDiscard,
}: {
  tiles: string[];
  position: SeatPosition;
  ariaLabel: string;
  lastDiscard: string | null;
}) {
  return (
    <ul className={`mj-river mj-river--${position}`} aria-label={ariaLabel}>
      {tiles.map((t, i) => (
        <li key={`${i}-${t}`}>
          <TileFace
            tile={t}
            size="md"
            orientation={position}
            highlighted={t === lastDiscard}
          />
        </li>
      ))}
    </ul>
  );
}

// The centre of the table: the wall counter, ringed by one river per seat.
function CentreTable({
  tilesLeft,
  lastDiscard,
  myDiscards,
  riverAt,
}: {
  tilesLeft: number;
  lastDiscard: { seat: number; tile: string } | null;
  myDiscards: string[];
  riverAt: (pos: SeatPosition) => MahjongOpponent | undefined;
}) {
  const last = lastDiscard?.tile ?? null;
  const opp = (pos: SeatPosition) => {
    const player = riverAt(pos);
    if (!player) return null;
    return (
      <River
        tiles={player.discards}
        position={pos}
        ariaLabel={`${player.name} discards`}
        lastDiscard={last}
      />
    );
  };

  return (
    <div className="mj-centre" aria-label="Centre">
      <div className="mj-centre-top">{opp("top")}</div>
      <div className="mj-centre-left">{opp("left")}</div>
      <div className="mj-centre-wall">
        <div className="mj-wall-ring">
          <span className="mj-wall-count">{tilesLeft}</span>
          <span className="mj-wall-label">tiles left</span>
        </div>
      </div>
      <div className="mj-centre-right">{opp("right")}</div>
      <div className="mj-centre-bottom">
        <River
          tiles={myDiscards}
          position="bottom"
          ariaLabel="Your discards"
          lastDiscard={last}
        />
      </div>
    </div>
  );
}

function ActionBar({
  actions,
  onAct,
}: {
  actions: MahjongAction[];
  onAct: (action: MahjongAction) => void;
}) {
  if (actions.length === 0) return null;
  return (
    <div className="mj-actionbar">
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
  copies,
}: {
  view: MahjongView;
  discardByTile: Map<string, MahjongAction>;
  onSelectTile: (tileId: string) => void;
  onAct: (action: MahjongAction) => void;
  copies: Map<string, VisibleCopiesEntry>;
}) {
  const [inspected, setInspected] = useState<string | null>(null);
  const wind = seatWind(view.mySeat);
  const canDiscard = discardByTile.size > 0;
  const raw = view.myHand;
  const justDrawn =
    canDiscard && raw.length > 0 && discardByTile.has(raw[raw.length - 1])
      ? raw[raw.length - 1]
      : undefined;
  const rest = justDrawn ? raw.filter((id) => id !== justDrawn) : raw;
  const sorted = sortTiles(rest);
  // A discard is made by clicking a tile, and a draw is automatic, so neither
  // belongs in the action bar.
  const barActions = view.availableActions.filter(
    (a) => a.type !== "discard" && a.type !== "draw",
  );
  const inspectedEntry = inspected ? copies.get(tileKind(inspected)) : undefined;

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
        <MeldRow melds={view.myMelds} orientation="bottom" ariaLabel="Your melds" />
      </div>

      <section aria-label="Your hand" className="mj-hand-section">
        <VisibleCopiesPopover tile={inspected} entry={inspectedEntry} />
        <ul className="mj-hand">
          {sorted.map((tileId, i) => (
            <HandTile
              key={`${i}-${tileId}`}
              tileId={tileId}
              disabled={!discardByTile.has(tileId)}
              onSelect={onSelectTile}
              onInspect={setInspected}
            />
          ))}
          {justDrawn && (
            <HandTile
              className="mj-hand-drawn"
              tileId={justDrawn}
              disabled={!discardByTile.has(justDrawn)}
              highlighted
              onSelect={onSelectTile}
              onInspect={setInspected}
            />
          )}
        </ul>
      </section>

      <section aria-label="Your actions">
        <ActionBar actions={barActions} onAct={onAct} />
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

  // Hooks must run every render, so derive everything hook-shaped before any
  // early return.

  // Drawing is never a decision: the engine offers DRAW alone in the NEEDS_DRAW
  // phase. Send it as soon as it appears, so the turn goes straight to the
  // discard.
  //
  // The latch sends once per stretch of draw-only actions and resets the moment
  // the seat has anything else to do. Do not key this off the turn or the wall
  // count instead: a kong replacement draws without moving the live wall, and a
  // new hand rewinds it, so a key built from those repeats and the board stops
  // drawing.
  const needsDraw =
    !!view &&
    !view.result &&
    view.availableActions.length === 1 &&
    view.availableActions[0].type === "draw";
  const drawSent = useRef(false);
  useEffect(() => {
    if (!needsDraw) {
      drawSent.current = false;
      return;
    }
    if (drawSent.current) return;
    drawSent.current = true;
    send({ draw: true });
  }, [needsDraw, send]);

  // A kind -> copies map, so the hand popover is a lookup rather than a scan.
  const visibleEntries = useMemo(
    () =>
      view
        ? computeVisibleCopies({
            opponentDiscards: view.opponents.map((o) => o.discards),
            myDiscards: view.myDiscards,
            lastDiscard: view.lastDiscard?.tile,
            visibleMelds: [
              ...view.opponents.flatMap((o) => o.melds.map((m) => m.tiles)),
              ...view.myMelds.map((m) => m.tiles),
            ],
            visibleFlowers: [...view.opponents.flatMap((o) => o.flowers), ...view.myFlowers],
          })
        : [],
    [view],
  );
  const copiesByKind = useMemo(
    () => new Map<string, VisibleCopiesEntry>(visibleEntries.map((e) => [e.kind, e])),
    [visibleEntries],
  );

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

  // Compute the tai estimate once per render and pass it down to the pill.
  const taiEstimate = estimateTai(buildTaiPosition(view));

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
          <LockRoomButton locked={view.locked} onToggle={lockRoom} />
        </section>
      )}

      <section aria-label="Status" className="mj-status">
        <p role="status" aria-live="polite">
          {statusText(view)}
        </p>
        {showPanels && <TaiIndicator estimate={taiEstimate} />}
      </section>

      <div className="mj-layout">
        <section className="mj-felt" aria-label="Table">
          <div className="mj-seat-top">{renderOpponent(top, "top")}</div>
          <div className="mj-seat-left">{renderOpponent(left, "left")}</div>
          <div className="mj-seat-centre">
            <CentreTable
              tilesLeft={view.wallCount}
              lastDiscard={view.lastDiscard}
              myDiscards={view.myDiscards}
              riverAt={byPosition}
            />
          </div>
          <div className="mj-seat-right">{renderOpponent(right, "right")}</div>
          <div className="mj-seat-bottom">
            <PlayerArea
              view={view}
              discardByTile={discardByTile}
              onSelectTile={onSelectTile}
              onAct={(action) => send(actionMessage(action))}
              copies={copiesByKind}
            />
          </div>
        </section>
      </div>

      {view.reveal && view.result && (
        <HandEndScreen
          result={view.result}
          reveal={view.reveal}
          scores={view.scores}
          players={view.players}
          autoAdvanceMs={TURN_MS}
          onNextRound={restart}
          onEndGame={leaveRoom}
        />
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
