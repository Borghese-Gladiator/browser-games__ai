// Durable, append-only persistence for game outcomes and achievement unlocks.
// Matches the gateway's zero-infrastructure style: plain JSON files written
// synchronously alongside the server. The pure aggregation over these records
// lives in @portal/shared/leaderboard; this module is only I/O + dedup.
//
// Every load runs a runtime guard: a file whose shape does not match is treated
// as absent (fall back) rather than trusted, so a corrupt file cannot poison a
// store or the boot restore.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import crypto from 'node:crypto';
import {
  isAchievementUnlockArray,
  isOutcomeRecordArray,
  assertRoomSnapshot,
} from './guards.ts';
import type { AchievementUnlock, OutcomeRecord, PlayerOutcome, RoomSnapshot } from './types.ts';

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
    writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
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
    writeFileSync(this.filePath, JSON.stringify(this.unlocks, null, 2));
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
    writeFileSync(`${this.dir}/${code}.json`, JSON.stringify(snapshot));
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
