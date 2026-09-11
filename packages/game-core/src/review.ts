// Replay-driven post-game review. reviewGame reads a game's append-only event
// log and reconstructs the engine state step-by-step, asserting the recomputed
// stateHash matches the recorded one at every step (the same contract replayGame
// uses). At each actual DISCARD it grades the discard with rankDiscards, using
// ONLY that seat's public information at that moment: the discarding player's own
// concealed hand and exposed melds. It never feeds the wall or another seat's
// hand into the analysis, so a mistake verdict cannot depend on hidden state.

import { hashState } from './observability.ts';
import type { EventStore } from './eventStore.ts';
import {
  createGame as mahjongCreateGame,
  applyAction as mahjongApplyAction,
  tileToKind,
} from '@browser-games/engine-mahjong';
import type {
  GameConfig as MahjongConfig,
  GameState as MahjongState,
  GameAction as MahjongAction,
  PlayerId,
} from '@browser-games/engine-mahjong';
import { rankDiscards, renderReasons } from '@browser-games/engine-mahjong-analysis';
import type { DiscardPosition } from '@browser-games/engine-mahjong-analysis';
import { severityForDelta } from '@portal/shared/severity';
import type { MistakeSeverity } from '@portal/shared/severity';

export interface DiscardEvaluation {
  readonly kind: string;
  readonly score: number;
  readonly reasons: string[];
}

export interface ReviewStep {
  readonly index: number;
  readonly sequence: number;
  readonly seat: PlayerId;
  readonly hand: string[];
  readonly chosen: DiscardEvaluation;
  readonly best: DiscardEvaluation;
  readonly mistakeScore: number;
  readonly severity: MistakeSeverity;
}

export interface SeatSummary {
  readonly seat: PlayerId;
  readonly discards: number;
  readonly counts: Record<MistakeSeverity, number>;
}

export interface GameReview {
  readonly instanceId: string;
  readonly gameType: string;
  readonly steps: ReviewStep[];
  readonly summary: SeatSummary[];
}

// The public information the discarding seat holds at decision time: that seat's
// own concealed hand and exposed melds only. This is the seam that guarantees the
// analysis sees no hidden state.
export function discardPositionForSeat(state: MahjongState, seat: PlayerId): DiscardPosition {
  const player = state.players[seat];
  return { concealed: player.hand, exposedMelds: player.melds, rules: state.rules };
}

function handKinds(position: DiscardPosition): string[] {
  const kinds: string[] = [];
  for (const tile of position.concealed) {
    if (tile.suit === 'flower') continue;
    kinds.push(tileToKind(tile));
  }
  kinds.sort();
  return kinds;
}

function emptyCounts(): Record<MistakeSeverity, number> {
  return { optimal: 0, minor: 0, moderate: 0, severe: 0 };
}

function summarize(steps: readonly ReviewStep[]): SeatSummary[] {
  const bySeat = new Map<PlayerId, SeatSummary>();
  for (const step of steps) {
    let entry = bySeat.get(step.seat);
    if (!entry) {
      entry = { seat: step.seat, discards: 0, counts: emptyCounts() };
      bySeat.set(step.seat, entry);
    }
    (entry as { discards: number }).discards += 1;
    entry.counts[step.severity] += 1;
  }
  return [...bySeat.values()].sort((a, b) => a.seat - b.seat);
}

export async function reviewGame(
  instanceId: string,
  gameType: string,
  eventStore: EventStore,
): Promise<GameReview> {
  if (gameType !== 'mahjong') {
    throw new Error(`no review driver for game: ${gameType}`);
  }
  const log = await eventStore.readLog(instanceId);
  if (log.length === 0) {
    throw new Error(`no events to review for game: ${instanceId}`);
  }

  let state: MahjongState | undefined;
  const steps: ReviewStep[] = [];
  let discardIndex = 0;

  for (const event of log) {
    if (event.type === 'create') {
      state = mahjongCreateGame(event.payload as MahjongConfig);
    } else {
      if (!state) {
        throw new Error(`review saw an action before create for game: ${instanceId}`);
      }
      const action = event.payload as MahjongAction;
      if (action.type === 'DISCARD') {
        const step = evaluateDiscard(state, action.player, action.tile, discardIndex, event.sequence);
        if (step) {
          steps.push(step);
          discardIndex += 1;
        }
      }
      const result = mahjongApplyAction(state, action);
      if (!result.ok) {
        throw new Error(`mahjong review rejected an action: ${result.error.code}`);
      }
      state = result.state;
    }

    const stateHash = hashState(state);
    if (stateHash !== event.stateHash) {
      throw new Error(
        `stateHash mismatch at sequence ${event.sequence}: expected ${event.stateHash}, got ${stateHash}`,
      );
    }
  }

  return { instanceId, gameType, steps, summary: summarize(steps) };
}

function evaluateDiscard(
  state: MahjongState,
  seat: PlayerId,
  tile: MahjongState['players'][number]['hand'][number],
  index: number,
  sequence: number,
): ReviewStep | null {
  const position = discardPositionForSeat(state, seat);
  const ranked = rankDiscards(position);
  if (ranked.length === 0) return null;
  const chosenKind = tileToKind(tile);
  const chosen = ranked.find((entry) => entry.kind === chosenKind);
  if (!chosen) return null;
  const best = ranked[0];
  const mistakeScore = best.score - chosen.score;
  return {
    index,
    sequence,
    seat,
    hand: handKinds(position),
    chosen: { kind: chosen.kind, score: chosen.score, reasons: renderReasons(chosen.reasons) },
    best: { kind: best.kind, score: best.score, reasons: renderReasons(best.reasons) },
    mistakeScore,
    severity: severityForDelta(mistakeScore),
  };
}
