// The durable persistence layer: one async contract per store, a file-backed
// default implementation for each, and selectStores(), which returns the Postgres
// implementations when DATABASE_URL is set and the file implementations otherwise.
// The Postgres implementations live in postgresStore.ts and satisfy the same
// contracts, so the shared store contract suite exercises both.

import { atomicWriteJson, readJsonStrict } from './store.ts';
import type { EventStore } from './eventStore.ts';
import { createFileEventStore } from './eventStore.ts';
import {
  createPostgresPool,
  createPostgresEventStore,
  createPostgresOutcomeStore,
  createPostgresAchievementStore,
  createPostgresSnapshotStore,
} from './postgresStore.ts';

export interface LeaderboardEntry {
  playerId: string;
  wins: number;
  totalScore: number;
}

export interface OutcomePlayer {
  playerId: string;
  win: boolean;
  score: number;
}

export interface GameOutcome {
  gameId: string;
  players: OutcomePlayer[];
}

export interface PlayerAchievement {
  id: string;
  name: string;
}

export interface GameSnapshot {
  data: unknown;
}

export interface OutcomeStore {
  recordOutcome(outcome: GameOutcome): Promise<void>;
  queryLeaderboard(limit: number): Promise<LeaderboardEntry[]>;
}

export interface AchievementStore {
  grant(playerId: string, achievement: PlayerAchievement): Promise<void>;
  list(playerId: string): Promise<PlayerAchievement[]>;
}

export interface SnapshotStore {
  save(gameId: string, snapshot: GameSnapshot): Promise<void>;
  load(gameId: string): Promise<GameSnapshot | undefined>;
}

export interface GatewayStores {
  outcomeStore: OutcomeStore;
  achievementStore: AchievementStore;
  snapshotStore: SnapshotStore;
  eventStore: EventStore;
}

function isEnoent(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'ENOENT';
}

async function readArray<T>(path: string): Promise<T[]> {
  try {
    return await readJsonStrict<T[]>(path);
  } catch (e) {
    if (isEnoent(e)) return [];
    throw e;
  }
}

// Pure aggregation shared by the file store and any caller that already holds the
// raw outcome rows.
export function aggregateLeaderboard(outcomes: GameOutcome[], limit: number): LeaderboardEntry[] {
  const byPlayer = new Map<string, LeaderboardEntry>();
  for (const outcome of outcomes) {
    for (const p of outcome.players) {
      const entry = byPlayer.get(p.playerId) ?? { playerId: p.playerId, wins: 0, totalScore: 0 };
      entry.wins += p.win ? 1 : 0;
      entry.totalScore += p.score;
      byPlayer.set(p.playerId, entry);
    }
  }
  return [...byPlayer.values()]
    .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore || a.playerId.localeCompare(b.playerId))
    .slice(0, limit);
}

export function createFileOutcomeStore(dir: string): OutcomeStore {
  const path = `${dir}/outcomes.json`;
  return {
    async recordOutcome(outcome) {
      const rows = await readArray<GameOutcome>(path);
      rows.push(outcome);
      await atomicWriteJson(path, rows);
    },
    async queryLeaderboard(limit) {
      return aggregateLeaderboard(await readArray<GameOutcome>(path), limit);
    },
  };
}

interface AchievementRow {
  playerId: string;
  id: string;
  name: string;
}

export function createFileAchievementStore(dir: string): AchievementStore {
  const path = `${dir}/achievements.json`;
  return {
    async grant(playerId, achievement) {
      const rows = await readArray<AchievementRow>(path);
      if (rows.some((r) => r.playerId === playerId && r.id === achievement.id)) return;
      rows.push({ playerId, id: achievement.id, name: achievement.name });
      await atomicWriteJson(path, rows);
    },
    async list(playerId) {
      const rows = await readArray<AchievementRow>(path);
      return rows.filter((r) => r.playerId === playerId).map((r) => ({ id: r.id, name: r.name }));
    },
  };
}

export function createFileSnapshotStore(dir: string): SnapshotStore {
  function pathFor(gameId: string): string {
    return `${dir}/snapshot-${encodeURIComponent(gameId)}.json`;
  }
  return {
    async save(gameId, snapshot) {
      await atomicWriteJson(pathFor(gameId), snapshot);
    },
    async load(gameId) {
      try {
        return await readJsonStrict<GameSnapshot>(pathFor(gameId));
      } catch (e) {
        if (isEnoent(e)) return undefined;
        throw e;
      }
    },
  };
}

export function createFileStores(dir = './.state/stores'): GatewayStores {
  return {
    outcomeStore: createFileOutcomeStore(dir),
    achievementStore: createFileAchievementStore(dir),
    snapshotStore: createFileSnapshotStore(dir),
    eventStore: createFileEventStore(`${dir}/events`),
  };
}

// Postgres when DATABASE_URL is set, file-backed otherwise. Callers that use the
// Postgres branch must run runMigrations(pool, dir) once before use.
export function selectStores(env: NodeJS.ProcessEnv): GatewayStores {
  const url = env.DATABASE_URL;
  if (url) {
    const pool = createPostgresPool(url);
    return {
      outcomeStore: createPostgresOutcomeStore(pool),
      achievementStore: createPostgresAchievementStore(pool),
      snapshotStore: createPostgresSnapshotStore(pool),
      eventStore: createPostgresEventStore(pool),
    };
  }
  return createFileStores(env.STORE_DIR ?? './.state/stores');
}
