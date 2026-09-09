import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_TAIWANESE_RULES,
  createGame,
  applyAction,
  getPlayer,
} from '@browser-games/engine-mahjong';
import type { GameConfig, GameState } from '@browser-games/engine-mahjong';
import type { GameAction } from '@browser-games/engine-mahjong';
import { createFileEventStore } from './eventStore.ts';
import { hashState } from './observability.ts';
import { replayGame } from './replay.ts';
import type { EventStore } from './eventStore.ts';

// Play a scripted no-declared-win hand from the deal to a terminal outcome,
// recording createGame + every applyAction into the durable event log with the
// stateHash after each step. Every seat passes claims and draws/discards, so the
// hand always plays out deterministically to wall exhaustion.
async function recordCompletedHand(
  store: EventStore,
  seed: string,
  instanceId = 'mahjong',
): Promise<GameState> {
  const config: GameConfig = { rules: DEFAULT_TAIWANESE_RULES, seed, dealer: 0, roundWind: 'E' };
  let state: GameState = createGame(config);
  await store.append(instanceId, { type: 'create', payload: config, stateHash: hashState(state) });

  async function record(action: GameAction): Promise<void> {
    const result = applyAction(state, action);
    expect(result.ok).toBe(true);
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
  expect(state.phase).toBe('FINISHED');
  return state;
}

describe('replayGame', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'replay-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // qa: replay-completed-mahjong-game-matches-statehash-each-step
  it('replays a completed mahjong hand and matches the stateHash at every step', async () => {
    const store = createFileEventStore(dir);
    const played = await recordCompletedHand(store, 'replay-hand-1');
    const log = await store.readLog('mahjong');

    const result = await replayGame('mahjong', 'mahjong', store);

    expect(result.steps).toBe(log.length);
    expect(result.stateHash).toBe(log[log.length - 1].stateHash);
    expect(result.stateHash).toBe(hashState(played));
    expect((result.finalState as GameState).phase).toBe('FINISHED');
    expect((result.finalState as GameState).outcome).toEqual(played.outcome);
  });

  // qa: replay-driver-by-type-log-by-instance
  it('resolves the driver by type while reading the log by instance', async () => {
    const store = createFileEventStore(dir);
    const played = await recordCompletedHand(store, 'inst-hand', 'ROOMZ');

    const result = await replayGame('ROOMZ', 'mahjong', store);

    expect(result.instanceId).toBe('ROOMZ');
    expect(result.gameType).toBe('mahjong');
    expect(result.stateHash).toBe(hashState(played));
    await expect(replayGame('mahjong', 'mahjong', store)).rejects.toThrow(/no events to replay/);
  });

  // qa: stored-row-seed-ruleset-replayable
  it('replays from a stored create row that carries the seed and ruleset', async () => {
    const store = createFileEventStore(dir);
    const config: GameConfig = {
      rules: DEFAULT_TAIWANESE_RULES,
      seed: 'seed-xyz',
      dealer: 0,
      roundWind: 'E',
    };
    const initial = createGame(config);
    await store.append('ROOMS', { type: 'create', payload: config, stateHash: hashState(initial) });

    const log = await store.readLog('ROOMS');
    expect(log[0].type).toBe('create');
    expect(log[0].payload).toMatchObject({ seed: 'seed-xyz', rules: DEFAULT_TAIWANESE_RULES });

    const result = await replayGame('ROOMS', 'mahjong', store);
    expect(result.steps).toBe(1);
    expect(result.stateHash).toBe(hashState(initial));
    expect(result.finalState).toEqual(initial);
  });

  it('rejects when a middle step diverges, not only the final state', async () => {
    const store = createFileEventStore(dir);
    await recordCompletedHand(store, 'replay-hand-2');

    const path = join(dir, 'mahjong.json');
    const log = JSON.parse(readFileSync(path, 'utf8')) as Array<{ stateHash: string }>;
    const middle = Math.floor(log.length / 2);
    log[middle].stateHash = 'ffffffffffffffff';
    writeFileSync(path, JSON.stringify(log));

    await expect(replayGame('mahjong', 'mahjong', store)).rejects.toThrow(/stateHash mismatch/);
  });

  it('throws for a game with no replay driver', async () => {
    const store = createFileEventStore(dir);
    await store.append('unknown-game', { type: 'create', payload: {}, stateHash: 'x' });
    await expect(replayGame('unknown-game', 'unknown-game', store)).rejects.toThrow(/no replay driver/);
  });
});
