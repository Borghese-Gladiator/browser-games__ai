// Deterministic replay. replayGame reads a game's append-only event log and
// reconstructs the engine state from scratch: the first `create` event runs the
// engine's createGame, and every following event runs applyAction. After each
// step it recomputes the stateHash and asserts it matches the recorded hash, so a
// divergence at any step fails, not only a wrong final score.

import { hashState } from './observability.ts';
import type { EventStore } from './eventStore.ts';
import {
  createGame as mahjongCreateGame,
  applyAction as mahjongApplyAction,
} from '@browser-games/engine-mahjong';
import type {
  GameConfig as MahjongConfig,
  GameState as MahjongState,
  GameAction as MahjongAction,
} from '@browser-games/engine-mahjong';

export interface ReplayResult {
  instanceId: string;
  gameType: string;
  finalState: unknown;
  steps: number;
  stateHash: string;
}

// A per-game bridge from the log's JSON payloads back to the pure engine.
interface ReplayDriver {
  createGame(payload: unknown): unknown;
  applyAction(state: unknown, payload: unknown): unknown;
}

const drivers: Record<string, ReplayDriver> = {
  mahjong: {
    createGame: (payload) => mahjongCreateGame(payload as MahjongConfig),
    applyAction: (state, payload) => {
      const result = mahjongApplyAction(state as MahjongState, payload as MahjongAction);
      if (!result.ok) {
        throw new Error(`mahjong replay rejected an action: ${result.error.code}`);
      }
      return result.state;
    },
  },
};

export function replayDriverFor(gameType: string): ReplayDriver | undefined {
  return drivers[gameType];
}

export async function replayGame(
  instanceId: string,
  gameType: string,
  eventStore: EventStore,
): Promise<ReplayResult> {
  const driver = drivers[gameType];
  if (!driver) throw new Error(`no replay driver for game: ${gameType}`);
  const log = await eventStore.readLog(instanceId);
  if (log.length === 0) throw new Error(`no events to replay for game: ${instanceId}`);

  let state: unknown;
  let steps = 0;
  let stateHash = '';
  for (const event of log) {
    state =
      event.type === 'create'
        ? driver.createGame(event.payload)
        : driver.applyAction(state, event.payload);
    stateHash = hashState(state);
    if (stateHash !== event.stateHash) {
      throw new Error(
        `stateHash mismatch at sequence ${event.sequence}: expected ${event.stateHash}, got ${stateHash}`,
      );
    }
    steps += 1;
  }
  return { instanceId, gameType, finalState: state, steps, stateHash };
}
