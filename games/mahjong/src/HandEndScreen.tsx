import { useEffect, useRef, useState } from "react";
import { sortTiles } from "./tiles.ts";
import { TileFace } from "./TileFace.tsx";

// Pattern identity comes straight off the wire, which forwards the
// mahjong-analysis catalogue fields. The screen renders these as-is; it holds no
// local name table, so the fan guide and this screen always agree.
export interface TaiPattern {
  id: string;
  english: string;
  chinese: string;
  tai: number;
}

export interface SeatSettlement {
  seat: number;
  delta: number;
  score: number;
}

export interface HandEndMeld {
  kind: string;
  tiles: string[];
}

export interface RevealSeat {
  seat: number;
  name: string;
  hand: string[];
  melds: HandEndMeld[];
  flowers: string[];
}

export interface HandEndResult {
  kind: "WIN" | "DRAW";
  winner: number | null;
  dealtInSeat: number | null;
  winningTile: string | null;
  selfDraw: boolean;
  patterns: TaiPattern[];
  totalTai: number;
  seats: SeatSettlement[];
}

export interface HandEndScreenProps {
  result: HandEndResult;
  reveal: RevealSeat[] | null;
  scores: number[];
  players: { seat: number; name: string }[];
  autoAdvanceMs: number;
  onNextRound: () => void;
  onEndGame: () => void;
}

type DeltaTone = "positive" | "negative" | "zero";

function nameForSeat(players: { seat: number; name: string }[], seat: number): string {
  return players.find((p) => p.seat === seat)?.name ?? `Seat ${seat}`;
}

function isExhaustiveDraw(result: HandEndResult): boolean {
  return result.kind === "DRAW";
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function deltaTone(delta: number): DeltaTone {
  return delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
}

// Presentation-only auto-advance. It returns a 0..1 fill fraction that grows over
// durationMs and fires onExpire once when full, matching the turn timer's fill.
// The latest onExpire is read through a ref so a re-render never re-arms it.
function useAutoAdvanceProgress(durationMs: number, onExpire: () => void): number {
  const [fraction, setFraction] = useState(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!(durationMs > 0)) return;
    const start = Date.now();
    let fired = false;
    const id = setInterval(() => {
      const next = Math.min(1, (Date.now() - start) / durationMs);
      setFraction(next);
      if (next >= 1 && !fired) {
        fired = true;
        clearInterval(id);
        onExpireRef.current();
      }
    }, 100);
    return () => clearInterval(id);
  }, [durationMs]);

  return fraction;
}

type SeatName = (seat: number) => string;

function WinnerHeader({ result, seatName }: { result: HandEndResult; seatName: SeatName }) {
  if (isExhaustiveDraw(result)) {
    return (
      <header className="mj-handend-header">
        <h2 id="mj-handend-title" className="mj-handend-title">
          Exhaustive draw
        </h2>
        <p className="mj-handend-sub mj-muted">The wall is depleted, so no one wins this hand.</p>
      </header>
    );
  }
  const name = seatName(result.winner ?? -1);
  return (
    <header className="mj-handend-header">
      <h2 id="mj-handend-title" className="mj-handend-title">
        {name} wins
      </h2>
      <p className="mj-handend-sub mj-muted">{result.totalTai} tai</p>
    </header>
  );
}

function WinLine({ result, seatName }: { result: HandEndResult; seatName: SeatName }) {
  if (isExhaustiveDraw(result)) return null;
  const source = result.selfDraw
    ? "Self-draw"
    : `Won off ${seatName(result.dealtInSeat ?? -1)}`;
  return (
    <section className="mj-handend-winline mj-panel" aria-label="Winning tile">
      {result.winningTile && <TileFace tile={result.winningTile} size="lg" highlighted />}
      <p className="mj-handend-winline-text">{source}</p>
    </section>
  );
}

function PlayerHandPanel({
  seat,
  isWinner,
  isDealtIn,
  seatName,
}: {
  seat: RevealSeat;
  isWinner: boolean;
  isDealtIn: boolean;
  seatName: SeatName;
}) {
  const name = seatName(seat.seat);
  const cls = `mj-handend-hand${isWinner ? " mj-handend-hand--winner" : ""}${
    isDealtIn ? " mj-handend-hand--dealtin" : ""
  }`;
  return (
    <div className={cls} aria-label={`${name} final hand`}>
      <div className="mj-handend-hand-head">
        <span className="mj-handend-hand-name">{name}</span>
        <span className="mj-plate-badges">
          {isWinner && <span className="mj-badge mj-badge--winner">Winner</span>}
          {isDealtIn && <span className="mj-badge mj-badge--dealtin">Dealt in</span>}
        </span>
      </div>
      {seat.melds.length > 0 && (
        <ul className="mj-tile-row mj-meld-row" aria-label={`${name} melds`}>
          {seat.melds.flatMap((meld, mi) =>
            meld.tiles.map((tile, ti) => (
              <li key={`m${mi}-${ti}-${tile}`}>
                <TileFace tile={tile} size="xs" />
              </li>
            )),
          )}
        </ul>
      )}
      <ul className="mj-tile-row" aria-label={`${name} hand`}>
        {sortTiles(seat.hand).map((tile, i) => (
          <li key={`h${i}-${tile}`}>
            <TileFace tile={tile} size="sm" />
          </li>
        ))}
      </ul>
      {seat.flowers.length > 0 && (
        <ul className="mj-tile-row mj-flower-row" aria-label={`${name} flowers`}>
          {seat.flowers.map((tile, i) => (
            <li key={`f${i}-${tile}`}>
              <TileFace tile={tile} size="xs" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FinalHandsGrid({
  result,
  reveal,
  seatName,
}: {
  result: HandEndResult;
  reveal: RevealSeat[];
  seatName: SeatName;
}) {
  const draw = isExhaustiveDraw(result);
  return (
    <section className="mj-handend-grid" aria-label="Final hands">
      {reveal.map((seat) => (
        <PlayerHandPanel
          key={seat.seat}
          seat={seat}
          isWinner={result.winner === seat.seat}
          isDealtIn={!draw && result.dealtInSeat === seat.seat}
          seatName={seatName}
        />
      ))}
    </section>
  );
}

function TaiBreakdown({ patterns, totalTai }: { patterns: TaiPattern[]; totalTai: number }) {
  return (
    <section className="mj-panel mj-handend-tai" aria-label="Scoring">
      <p className="mj-panel-title">Scoring</p>
      <ul className="mj-tai-list">
        {patterns.length === 0 ? (
          <li className="mj-muted">No fans scored.</li>
        ) : (
          patterns.map((pattern, i) => (
            <li
              key={`${pattern.id}-${i}`}
              className="mj-tai-line"
              aria-label={`${pattern.english} ${pattern.chinese}: ${pattern.tai} tai`}
            >
              <span className="mj-tai-line-name">
                <span className="mj-tai-line-en">{pattern.english}</span>
                <span className="mj-tai-line-zh" lang="zh">
                  {pattern.chinese}
                </span>
              </span>
              <span className="mj-tai-line-tai">{pattern.tai}</span>
            </li>
          ))
        )}
      </ul>
      <p className="mj-tai-total" aria-label={`Total ${totalTai} tai`}>
        <span>Total</span>
        <span>{totalTai} tai</span>
      </p>
    </section>
  );
}

function ScoreDeltaTable({ seats, seatName }: { seats: SeatSettlement[]; seatName: SeatName }) {
  return (
    <section className="mj-panel mj-handend-scores" aria-label="Scores">
      <p className="mj-panel-title">Scores</p>
      <table className="mj-score-table">
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Change</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {seats.map((seat) => {
            const name = seatName(seat.seat);
            const tone = deltaTone(seat.delta);
            return (
              <tr key={seat.seat}>
                <th scope="row" className="mj-score-name">
                  {name}
                </th>
                <td
                  className={`mj-delta mj-delta--${tone}`}
                  aria-label={`${name} change ${formatDelta(seat.delta)}`}
                >
                  {formatDelta(seat.delta)}
                </td>
                <td className="mj-score-cell" aria-label={`${name} score ${seat.score}`}>
                  {seat.score}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function NextRoundControls({
  autoAdvanceMs,
  onNextRound,
  onEndGame,
}: {
  autoAdvanceMs: number;
  onNextRound: () => void;
  onEndGame: () => void;
}) {
  const fraction = useAutoAdvanceProgress(autoAdvanceMs, onNextRound);
  const pct = Math.round(fraction * 100);
  return (
    <div className="mj-handend-controls">
      <div className="mj-handend-next-wrap">
        <button
          type="button"
          className="mj-action-btn mj-action-btn--primary mj-handend-next"
          onClick={onNextRound}
        >
          Next round
        </button>
        <div className="mj-timer mj-handend-progress" aria-hidden="true">
          <div className="mj-timer-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button type="button" className="btn mj-handend-end" onClick={onEndGame}>
        End game
      </button>
    </div>
  );
}

export function HandEndScreen({
  result,
  reveal,
  players,
  autoAdvanceMs,
  onNextRound,
  onEndGame,
}: HandEndScreenProps) {
  if (!reveal) return null;
  const seatName: SeatName = (seat) => nameForSeat(players, seat);

  return (
    <div className="mj-guide-backdrop">
      <div
        className="mj-handend"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mj-handend-title"
      >
        <WinnerHeader result={result} seatName={seatName} />
        <WinLine result={result} seatName={seatName} />
        <FinalHandsGrid result={result} reveal={reveal} seatName={seatName} />
        <div className="mj-handend-cols">
          <TaiBreakdown patterns={result.patterns} totalTai={result.totalTai} />
          <ScoreDeltaTable seats={result.seats} seatName={seatName} />
        </div>
        <NextRoundControls
          autoAdvanceMs={autoAdvanceMs}
          onNextRound={onNextRound}
          onEndGame={onEndGame}
        />
      </div>
    </div>
  );
}
