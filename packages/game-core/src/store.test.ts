import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SnapshotStore, OutcomeStore, AchievementStore, TornWriteError } from './store.js';
import type { RoomSnapshot } from './types.ts';
import { createFileStores, selectStores } from './stores.ts';
import type { GatewayStores } from './stores.ts';
import { createPostgresPool } from './postgresStore.ts';
import { runMigrations } from './migrate.ts';

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

describe('OutcomeStore strict load', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'outcomes-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('throws on a torn outcomes.json', () => {
    const path = join(dir, 'outcomes.json');
    writeFileSync(path, '[{"id":"a", ');
    expect(() => new OutcomeStore(path)).toThrow(TornWriteError);
  });

  it('returns an empty history when outcomes.json is missing', () => {
    const store = new OutcomeStore(join(dir, 'outcomes.json'));
    expect(store.all()).toEqual([]);
  });

  it('throws on a torn achievements.json but returns empty when missing', () => {
    const path = join(dir, 'achievements.json');
    writeFileSync(path, '{ not json');
    expect(() => new AchievementStore(path)).toThrow(TornWriteError);
    expect(new AchievementStore(join(dir, 'missing.json')).forPlayer('p')).toEqual([]);
  });
});

// Shared store contract suite. It runs against the file implementation always and
// against Postgres only when DATABASE_URL is set, so both backends prove the same
// behaviour without requiring a database in the default `npm run check`.
interface Backend {
  stores: GatewayStores;
  prefix: string;
  cleanup: () => Promise<void>;
}

const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

function contractSuite(label: string, make: () => Promise<Backend>, skip: boolean): void {
  const run = skip ? describe.skip : describe;
  run(`store contract: ${label}`, () => {
    let backend: Backend;
    beforeEach(async () => {
      backend = await make();
    });
    afterEach(async () => {
      await backend.cleanup();
    });

    it('event log append is monotonic, ordered, and per-game isolated', async () => {
      const { eventStore } = backend.stores;
      const g = `${backend.prefix}g1`;
      const a = await eventStore.append(g, { type: 'move', payload: { n: 1 }, stateHash: 'h1' });
      const b = await eventStore.append(g, { type: 'move', payload: { n: 2 }, stateHash: 'h2' });
      expect([a.sequence, b.sequence]).toEqual([0, 1]);
      const log = await eventStore.readLog(g);
      expect(log.map((e) => e.stateHash)).toEqual(['h1', 'h2']);
      const other = `${backend.prefix}g2`;
      const c = await eventStore.append(other, { type: 'x', payload: {}, stateHash: 'z' });
      expect(c.sequence).toBe(0);
    });

    it('outcome leaderboard aggregates wins and total score, ranked', async () => {
      const { outcomeStore } = backend.stores;
      const alice = `${backend.prefix}alice`;
      const bob = `${backend.prefix}bob`;
      await outcomeStore.recordOutcome({
        gameId: `${backend.prefix}g1`,
        players: [
          { playerId: alice, win: true, score: 10 },
          { playerId: bob, win: false, score: 4 },
        ],
      });
      await outcomeStore.recordOutcome({
        gameId: `${backend.prefix}g2`,
        players: [
          { playerId: alice, win: false, score: 5 },
          { playerId: bob, win: true, score: 9 },
        ],
      });
      const board = (await outcomeStore.queryLeaderboard(1000)).filter((e) =>
        e.playerId.startsWith(backend.prefix),
      );
      expect(board).toEqual([
        { playerId: alice, wins: 1, totalScore: 15 },
        { playerId: bob, wins: 1, totalScore: 13 },
      ]);
    });

    it('achievement grant is idempotent and listable per player', async () => {
      const { achievementStore } = backend.stores;
      const p = `${backend.prefix}p`;
      await achievementStore.grant(p, { id: 'first-win', name: 'First Win' });
      await achievementStore.grant(p, { id: 'first-win', name: 'First Win' });
      const list = await achievementStore.list(p);
      expect(list).toEqual([{ id: 'first-win', name: 'First Win' }]);
      expect(await achievementStore.list(`${backend.prefix}other`)).toEqual([]);
    });

    it('snapshot save/load round-trips and returns undefined when absent', async () => {
      const { snapshotStore } = backend.stores;
      const g = `${backend.prefix}game`;
      expect(await snapshotStore.load(g)).toBeUndefined();
      await snapshotStore.save(g, { data: { phase: 'play', n: 3 } });
      expect(await snapshotStore.load(g)).toEqual({ data: { phase: 'play', n: 3 } });
    });
  });
}

function uniquePrefix(): string {
  return `t${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_`;
}

contractSuite(
  'file',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'contract-'));
    return {
      stores: createFileStores(dir),
      prefix: uniquePrefix(),
      cleanup: async () => rmSync(dir, { recursive: true, force: true }),
    };
  },
  false,
);

const databaseUrl = process.env.DATABASE_URL;
contractSuite(
  'postgres',
  async () => {
    const pool = createPostgresPool(databaseUrl as string);
    await runMigrations(pool, migrationsDir);
    return {
      stores: {
        outcomeStore: (await import('./postgresStore.ts')).createPostgresOutcomeStore(pool),
        achievementStore: (await import('./postgresStore.ts')).createPostgresAchievementStore(pool),
        snapshotStore: (await import('./postgresStore.ts')).createPostgresSnapshotStore(pool),
        eventStore: (await import('./postgresStore.ts')).createPostgresEventStore(pool),
      },
      prefix: uniquePrefix(),
      cleanup: async () => {
        await pool.end();
      },
    };
  },
  !databaseUrl,
);

describe('selectStores', () => {
  it('returns file-backed stores when DATABASE_URL is unset', async () => {
    const stores = selectStores({ STORE_DIR: mkdtempSync(join(tmpdir(), 'select-')) } as NodeJS.ProcessEnv);
    const ev = await stores.eventStore.append('g', { type: 'x', payload: {}, stateHash: 'h' });
    expect(ev.sequence).toBe(0);
  });

  it('returns Postgres-backed stores when DATABASE_URL is set', () => {
    const stores = selectStores({ DATABASE_URL: 'postgres://localhost/none' } as NodeJS.ProcessEnv);
    expect(typeof stores.eventStore.append).toBe('function');
    expect(typeof stores.outcomeStore.queryLeaderboard).toBe('function');
  });
});
