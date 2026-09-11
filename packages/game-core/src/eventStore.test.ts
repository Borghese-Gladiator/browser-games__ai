import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFileEventStore } from './eventStore.ts';
import { TornWriteError } from './store.ts';

describe('createFileEventStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'events-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('assigns a monotonic sequence and reads the log back in order', async () => {
    const store = createFileEventStore(dir);
    const a = await store.append('g1', { type: 'move', payload: { n: 1 }, stateHash: 'h1' });
    const b = await store.append('g1', { type: 'move', payload: { n: 2 }, stateHash: 'h2' });
    expect(a.sequence).toBe(0);
    expect(b.sequence).toBe(1);
    const log = await store.readLog('g1');
    expect(log.map((e) => e.sequence)).toEqual([0, 1]);
    expect(log.map((e) => e.stateHash)).toEqual(['h1', 'h2']);
    expect(log[0].gameId).toBe('g1');
  });

  it('keeps per-game logs isolated', async () => {
    const store = createFileEventStore(dir);
    await store.append('g1', { type: 'x', payload: {}, stateHash: 'a' });
    await store.append('g2', { type: 'y', payload: {}, stateHash: 'b' });
    expect(await store.readLog('g1')).toHaveLength(1);
    expect((await store.readLog('g2'))[0].sequence).toBe(0);
  });

  it('returns an empty log for a game that has none', async () => {
    const store = createFileEventStore(dir);
    expect(await store.readLog('unknown')).toEqual([]);
  });

  // qa: event-log-exceeds-200-entries-survives-intact
  it('never truncates a log longer than 200 entries', async () => {
    const store = createFileEventStore(dir);
    for (let i = 0; i < 250; i++) {
      await store.append('big', { type: 'move', payload: { i }, stateHash: `h${i}` });
    }
    const log = await store.readLog('big');
    expect(log).toHaveLength(250);
    expect(log[0].sequence).toBe(0);
    expect(log[249].sequence).toBe(249);
    expect(log.map((e) => e.sequence)).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });

  // qa: torn-write-fails-loudly-not-empty-history
  it('fails loud on a torn or corrupt file instead of returning an empty history', async () => {
    const store = createFileEventStore(dir);
    await store.append('torn', { type: 'move', payload: { n: 1 }, stateHash: 'h1' });
    // Simulate a torn write: overwrite the log file with a half-written JSON array.
    writeFileSync(join(dir, `${encodeURIComponent('torn')}.json`), '[{"gameId":"torn","sequ');
    await expect(store.readLog('torn')).rejects.toBeInstanceOf(TornWriteError);
    // A torn tail must also block appends rather than silently start a fresh log.
    await expect(
      store.append('torn', { type: 'move', payload: { n: 2 }, stateHash: 'h2' }),
    ).rejects.toBeInstanceOf(TornWriteError);
  });
});
