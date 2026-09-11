// Runtime validation guards for every persisted shape. The stores read plain
// JSON files written by earlier runs; a guard rejects a file whose shape does
// not match so a corrupt or stale snapshot cannot crash the boot restore or
// silently corrupt a store. Each guard checks only the durable fields the
// framework depends on, not the opaque per-game engine state.

import type { AchievementUnlock, OutcomeRecord, PlayerOutcome, RoomSnapshot } from './types.ts';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isPlayerOutcome(v: unknown): v is PlayerOutcome {
  return isObject(v) && typeof v.playerId === 'string' && typeof v.rank === 'number';
}

function isSnapshotMemberArray(v: unknown): boolean {
  return Array.isArray(v) && v.every(
    (m) => isObject(m) && typeof m.id === 'string' && typeof m.seat === 'number' && typeof m.isBot === 'boolean',
  );
}

export function isRoomSnapshot(v: unknown): v is RoomSnapshot {
  if (!isObject(v)) return false;
  if (typeof v.code !== 'string') return false;
  if (typeof v.gameId !== 'string') return false;
  if (!isObject(v.state) || !Array.isArray((v.state as { players?: unknown }).players)) return false;
  if (!isSnapshotMemberArray(v.members)) return false;
  return true;
}

export function assertRoomSnapshot(v: unknown): asserts v is RoomSnapshot {
  if (!isRoomSnapshot(v)) throw new Error('invalid room snapshot');
}

export function isOutcomeRecord(v: unknown): v is OutcomeRecord {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.gameId === 'string' &&
    typeof v.roomCode === 'string' &&
    typeof v.ts === 'number' &&
    Array.isArray(v.outcomes) &&
    v.outcomes.every(isPlayerOutcome)
  );
}

export function isOutcomeRecordArray(v: unknown): v is OutcomeRecord[] {
  return Array.isArray(v) && v.every(isOutcomeRecord);
}

export function isAchievementUnlock(v: unknown): v is AchievementUnlock {
  return (
    isObject(v) &&
    typeof v.playerId === 'string' &&
    typeof v.achievementId === 'string' &&
    typeof v.gameId === 'string' &&
    typeof v.ts === 'number'
  );
}

export function isAchievementUnlockArray(v: unknown): v is AchievementUnlock[] {
  return Array.isArray(v) && v.every(isAchievementUnlock);
}
