import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TAIWANESE_RULES,
  createGame,
  applyAction,
  getPlayer,
  createTaiwaneseTileSet,
  tileToKind,
} from '@browser-games/engine-mahjong';
import type { GameConfig, GameState, GameAction, Tile } from '@browser-games/engine-mahjong';
import { rankDiscards } from '@browser-games/engine-mahjong-analysis';
import { createFileEventStore } from './eventStore.ts';
import type { EventStore } from './eventStore.ts';
import { hashState } from './observability.ts';
import { discardPositionForSeat, reviewGame } from './review.ts';

// Reused from replay.test.ts: play a scripted hand to a terminal outcome,
// recording createGame + every applyAction into the durable event log with the
// stateHash after each step, so the log replays deterministically.
async function recordCompletedHand(store: EventStore, seed: string, instanceId = 'mahjong'): Promise<GameState> {
  const config: GameConfig = { rules: DEFAULT_TAIWANESE_RULES, seed, dealer: 0, roundWind: 'E' };
  let state: GameState = createGame(config);
  await store.append(instanceId, { type: 'create', payload: config, stateHash: hashState(state) });

  async function record(action: GameAction): Promise<void> {
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
    await store.append(instanceId, { type: action.type, payload: action, stateHash: hashState(state) });
  }

  await record({ type: 'DEAL' });
  let guard = 0;
  while (state.phase !== 'FINISHED' && guard < 2000) {
    guard += 1;
    if (state.pendingClaim) {
      await record({ type: 'PASS_CLAIM', player: state.pendingClaim.pending[0] });
      continue;
    }
    const player = state.turn.player;
    if (state.turn.phase === 'NEEDS_DISCARD') {
      const held = getPlayer(state, player);
      const tile = state.turn.drawnTile ?? held.hand[held.hand.length - 1];
      await record({ type: 'DISCARD', player, tile });
    } else {
      await record({ type: 'DRAW', player });
    }
  }
  return state;
}

describe('discardPositionForSeat', () => {
  // The verdict must come from the discarding seat's PUBLIC information only:
  // that seat's own concealed hand and exposed melds. Feeding hidden state
  // (another seat's hand, the wall) must not change it. This case builds a pool
  // that flips the best discard, then asserts the extraction ignores the pool.
  it('uses only the seat\'s own hand, so hidden tiles cannot flip the verdict', () => {
    const rules = DEFAULT_TAIWANESE_RULES;
    const tiles = createTaiwaneseTileSet().filter((t) => t.suit !== 'flower');
    const seatHand = tiles.slice(0, rules.concealedHandSize + 1);
    const soloBest = rankDiscards({ concealed: seatHand, exposedMelds: [], rules })[0].kind;

    // Pool in opponent tiles until the best discard flips, proving the two views
    // genuinely disagree.
    const opponent: Tile[] = [];
    let flipped = false;
    for (const extra of tiles.slice(rules.concealedHandSize + 1)) {
      opponent.push(extra);
      const pooledBest = rankDiscards({ concealed: [...seatHand, ...opponent], exposedMelds: [], rules })[0].kind;
      if (pooledBest !== soloBest) {
        flipped = true;
        break;
      }
    }
    expect(flipped).toBe(true);

    const state = {
      rules,
      players: [
        { hand: seatHand, melds: [] },
        { hand: opponent, melds: [] },
        { hand: [], melds: [] },
        { hand: [], melds: [] },
      ],
    } as unknown as GameState;

    const position = discardPositionForSeat(state, 0);
    expect(position.concealed).toBe(seatHand);
    expect(position.concealed).toHaveLength(seatHand.length);
    // The extracted verdict matches the seat-only view, never the pooled view.
    expect(rankDiscards(position)[0].kind).toBe(soloBest);
  });
});

describe('reviewGame', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'review-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('grades every discard from the replayed public state and summarises per seat', async () => {
    const store = createFileEventStore(dir);
    await recordCompletedHand(store, 'review-hand-1');

    const review = await reviewGame('mahjong', 'mahjong', store);

    expect(review.steps.length).toBeGreaterThan(0);
    for (const step of review.steps) {
      expect(step.chosen.kind).toBeTruthy();
      expect(step.best.kind).toBeTruthy();
      // best is the top-ranked discard, so the chosen tile never beats it.
      expect(step.mistakeScore).toBe(step.best.score - step.chosen.score);
      expect(step.mistakeScore).toBeGreaterThanOrEqual(0);
      expect(['optimal', 'minor', 'moderate', 'severe']).toContain(step.severity);
      expect(step.hand).toContain(step.chosen.kind);
    }

    const summarised = review.summary.reduce((total, seat) => total + seat.discards, 0);
    expect(summarised).toBe(review.steps.length);
    for (const seat of review.summary) {
      const counted = Object.values(seat.counts).reduce((a, b) => a + b, 0);
      expect(counted).toBe(seat.discards);
    }
  });

  it('rejects an unknown game type and an empty log', async () => {
    const store = createFileEventStore(dir);
    await expect(reviewGame('nope', 'president', store)).rejects.toThrow(/no review driver/);
    await expect(reviewGame('mahjong', 'mahjong', store)).rejects.toThrow(/no events to review/);
  });

  it('detects a diverging stateHash during the replay', async () => {
    const store = createFileEventStore(dir);
    await recordCompletedHand(store, 'review-hand-2');
    const path = join(dir, 'mahjong.json');
    const { readFileSync, writeFileSync } = await import('node:fs');
    const log = JSON.parse(readFileSync(path, 'utf8')) as Array<{ stateHash: string }>;
    log[Math.floor(log.length / 2)].stateHash = 'ffffffffffffffff';
    writeFileSync(path, JSON.stringify(log));
    await expect(reviewGame('mahjong', 'mahjong', store)).rejects.toThrow(/stateHash mismatch/);
  });
});
