// Durable, append-only persistence for game outcomes and achievement unlocks.
// Matches the gateway's zero-infrastructure style: plain JSON files written
// synchronously alongside the server. The pure aggregation over these records
// lives in @portal/shared/leaderboard; this module is only I/O + dedup.
//
// Every load runs a runtime guard: a file whose shape does not match is treated
// as absent (fall back) rather than trusted, so a corrupt file cannot poison a
// store or the boot restore.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { readFile, rename, open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import crypto from 'node:crypto';
import {
  isAchievementUnlockArray,
  isOutcomeRecordArray,
  assertRoomSnapshot,
} from './guards.ts';
import type { AchievementUnlock, OutcomeRecord, PlayerOutcome, RoomSnapshot } from './types.ts';

// A persisted file that is present but does not parse is corrupt (a torn or
// partial write). The loader must fail loud with this error rather than silently
// returning an empty history, which would hide data loss.
export class TornWriteError extends Error {
  constructor(filePath: string, cause?: unknown) {
    super(`torn or corrupt file: ${filePath}`);
    this.name = 'TornWriteError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

// Write JSON to a temp file, fsync it, then rename over the target. rename on the
// same filesystem is atomic, so a reader never sees a half-written file.
export async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const body = JSON.stringify(data, null, 2);
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(body);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}

// Synchronous sibling of atomicWriteJson for the legacy synchronous stores.
export function atomicWriteJsonSync(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, JSON.stringify(data, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

// Read and parse JSON. A parse failure means the file is present but corrupt, so
// throw TornWriteError. A missing file rethrows its ENOENT so the caller can map
// it to a legitimate empty result.
export async function readJsonStrict<T>(path: string): Promise<T> {
  let body: string;
  try {
    body = await readFile(path, 'utf8');
  } catch (e) {
    throw e;
  }
  try {
    return JSON.parse(body) as T;
  } catch (e) {
    throw new TornWriteError(path, e);
  }
}

function load<T>(filePath: string, fallback: T, guard?: (v: unknown) => v is T): T {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
    if (guard && !guard(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

// One append-only log of finished games. Every leaderboard scope, the match
// history, and head-to-head records are all derived from these same records.
export class OutcomeStore {
  filePath: string;
  records: OutcomeRecord[];

  constructor(filePath = './outcomes.json') {
    this.filePath = filePath;
    this.records = load(filePath, [] as OutcomeRecord[], isOutcomeRecordArray);
  }

  record({ gameId, roomCode, outcomes }: { gameId: string; roomCode: string; outcomes: PlayerOutcome[] }): OutcomeRecord {
    const entry: OutcomeRecord = { id: crypto.randomUUID(), gameId, roomCode, ts: Date.now(), outcomes };
    this.records.push(entry);
    atomicWriteJsonSync(this.filePath, this.records);
    return entry;
  }

  all(): OutcomeRecord[] {
    return this.records;
  }
}

// Generic {playerId, achievementId} unlock store. Games declare the conditions;
// the framework records the unlock here. Recording is idempotent per player.
export class AchievementStore {
  filePath: string;
  unlocks: AchievementUnlock[];

  constructor(filePath = './achievements.json') {
    this.filePath = filePath;
    this.unlocks = load(filePath, [] as AchievementUnlock[], isAchievementUnlockArray);
  }

  // Returns true if newly unlocked, false if the player already had it.
  record({ playerId, achievementId, gameId }: { playerId: string; achievementId: string; gameId: string }): boolean {
    if (this.unlocks.some((u) => u.playerId === playerId && u.achievementId === achievementId)) {
      return false;
    }
    this.unlocks.push({ playerId, achievementId, gameId, ts: Date.now() });
    atomicWriteJsonSync(this.filePath, this.unlocks);
    return true;
  }

  forPlayer(playerId: string): AchievementUnlock[] {
    return this.unlocks.filter((u) => u.playerId === playerId);
  }
}

// Per-room state snapshots, one JSON file per room code. The persistence seam
// that lets a restart resume in-flight rooms instead of discarding them. load
// runs the RoomSnapshot guard and throws on a malformed file.
export class SnapshotStore {
  dir: string;

  constructor(dir = './snapshots') {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  save(code: string, snapshot: RoomSnapshot): void {
    atomicWriteJsonSync(`${this.dir}/${code}.json`, snapshot);
  }

  load(code: string): RoomSnapshot {
    const parsed: unknown = JSON.parse(readFileSync(`${this.dir}/${code}.json`, 'utf8'));
    assertRoomSnapshot(parsed);
    return parsed;
  }

  list(): string[] {
    try {
      return readdirSync(this.dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
    } catch {
      return [];
    }
  }

  delete(code: string): void {
    try {
      unlinkSync(`${this.dir}/${code}.json`);
    } catch {}
  }
}
