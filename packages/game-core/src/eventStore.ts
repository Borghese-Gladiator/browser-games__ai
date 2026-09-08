// Append-only, per-game event log. Every recorded action becomes one immutable
// GameEvent with a monotonic sequence, a JSON payload, a timestamp, and the
// stateHash of the engine state after the action. The log is never truncated and
// survives room reaping, so a finished game can be replayed deterministically.

import { atomicWriteJson, readJsonStrict } from './store.ts';

export interface GameEvent {
  gameId: string;
  sequence: number;
  type: string;
  payload: unknown;
  timestamp: number;
  stateHash: string;
}

// Caller-supplied fields. The store assigns the sequence and the timestamp.
export interface EventInput {
  type: string;
  payload: unknown;
  stateHash: string;
}

export interface EventStore {
  append(gameId: string, event: EventInput): Promise<GameEvent>;
  readLog(gameId: string): Promise<GameEvent[]>;
}

export function isEnoent(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT';
}

// File-backed log: one JSON file per game, holding the full ordered array of
// events. Writes are atomic and reads are strict, so a torn file fails loud
// instead of returning an empty history.
export function createFileEventStore(dir: string): EventStore {
  function pathFor(gameId: string): string {
    return `${dir}/${encodeURIComponent(gameId)}.json`;
  }

  async function readLog(gameId: string): Promise<GameEvent[]> {
    try {
      return await readJsonStrict<GameEvent[]>(pathFor(gameId));
    } catch (e) {
      if (isEnoent(e)) return [];
      throw e;
    }
  }

  async function append(gameId: string, event: EventInput): Promise<GameEvent> {
    const log = await readLog(gameId);
    const sequence = log.length === 0 ? 0 : log[log.length - 1].sequence + 1;
    const record: GameEvent = {
      gameId,
      sequence,
      type: event.type,
      payload: event.payload,
      timestamp: Date.now(),
      stateHash: event.stateHash,
    };
    log.push(record);
    await atomicWriteJson(pathFor(gameId), log);
    return record;
  }

  return { append, readLog };
}
