import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SnapshotStore } from './store.js';
import type { RoomSnapshot } from './types.ts';

function snap(code: string, extra: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    code,
    gameId: 'test',
    options: {},
    state: { players: [], phase: 'play' },
    eventLog: [],
    _eventSeq: 0,
    host: null,
    locked: false,
    turnStartedAt: null,
    _lastActiveSeat: null,
    createdAt: 0,
    phaseEnteredAt: null,
    _gameStarted: false,
    members: [],
    ...extra,
  };
}

describe('SnapshotStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'snap-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('save then load round-trips a snapshot', () => {
    const store = new SnapshotStore(dir);
    const s = snap('ABCD', { state: { players: [], phase: 'play' } });
    store.save('ABCD', s);
    expect(store.load('ABCD')).toEqual(s);
  });

  it('list returns saved room codes', () => {
    const store = new SnapshotStore(dir);
    store.save('ABCD', snap('ABCD'));
    store.save('WXYZ', snap('WXYZ'));
    expect(store.list().sort()).toEqual(['ABCD', 'WXYZ']);
  });

  it('delete removes a snapshot and is safe on a missing one', () => {
    const store = new SnapshotStore(dir);
    store.save('ABCD', snap('ABCD'));
    store.delete('ABCD');
    expect(store.list()).toEqual([]);
    expect(() => store.delete('ABCD')).not.toThrow();
  });

  it('list is empty for a fresh directory', () => {
    expect(new SnapshotStore(dir).list()).toEqual([]);
  });

  it('load rejects a malformed snapshot file via the guard', () => {
    const store = new SnapshotStore(dir);
    writeFileSync(join(dir, 'BAD1.json'), JSON.stringify({ code: 'BAD1', state: { phase: 'x' } }));
    expect(() => store.load('BAD1')).toThrow(/invalid room snapshot/);
  });

  it('load rejects a snapshot whose members are not the durable shape', () => {
    const store = new SnapshotStore(dir);
    const bad = { ...snap('BAD2'), members: [{ id: 'p', seat: 'zero' }] };
    writeFileSync(join(dir, 'BAD2.json'), JSON.stringify(bad));
    expect(() => store.load('BAD2')).toThrow(/invalid room snapshot/);
  });
});
