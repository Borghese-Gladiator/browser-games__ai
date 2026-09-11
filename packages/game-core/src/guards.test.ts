import { describe, it, expect } from 'vitest';
import {
  isRoomSnapshot,
  assertRoomSnapshot,
  isOutcomeRecord,
  isOutcomeRecordArray,
  isAchievementUnlock,
  isAchievementUnlockArray,
} from './guards.js';

const validSnapshot = {
  code: 'ABCD',
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
  members: [{ id: 'p0', seat: 0, isBot: false }],
};

const validOutcome = {
  id: 'o1',
  gameId: 'test',
  roomCode: 'ABCD',
  ts: 1000,
  outcomes: [{ playerId: 'p0', rank: 1, score: 10, meta: {} }],
};

const validUnlock = { playerId: 'p0', achievementId: 'first-win', gameId: 'test', ts: 1000 };

describe('isRoomSnapshot', () => {
  it('accepts a well-formed snapshot', () => {
    expect(isRoomSnapshot(validSnapshot)).toBe(true);
  });

  it.each([
    ['null', null],
    ['missing code', { ...validSnapshot, code: 42 }],
    ['missing gameId', { ...validSnapshot, gameId: undefined }],
    ['state without players', { ...validSnapshot, state: { phase: 'x' } }],
    ['member with non-numeric seat', { ...validSnapshot, members: [{ id: 'p', seat: 'zero', isBot: false }] }],
    ['member missing isBot', { ...validSnapshot, members: [{ id: 'p', seat: 0 }] }],
  ])('rejects %s', (_label, value) => {
    expect(isRoomSnapshot(value)).toBe(false);
  });
});

describe('assertRoomSnapshot', () => {
  it('passes a valid snapshot', () => {
    expect(() => assertRoomSnapshot(validSnapshot)).not.toThrow();
  });

  it('throws on a malformed snapshot', () => {
    expect(() => assertRoomSnapshot({ code: 'BAD' })).toThrow(/invalid room snapshot/);
  });
});

describe('isOutcomeRecord', () => {
  it('accepts a well-formed record', () => {
    expect(isOutcomeRecord(validOutcome)).toBe(true);
  });

  it.each([
    ['missing outcomes array', { ...validOutcome, outcomes: {} }],
    ['non-numeric ts', { ...validOutcome, ts: 'now' }],
    ['outcome without a numeric rank', { ...validOutcome, outcomes: [{ playerId: 'p0', rank: 'first' }] }],
  ])('rejects %s', (_label, value) => {
    expect(isOutcomeRecord(value)).toBe(false);
  });

  it('validates the array form element-wise', () => {
    expect(isOutcomeRecordArray([validOutcome])).toBe(true);
    expect(isOutcomeRecordArray([validOutcome, { id: 'x' }])).toBe(false);
    expect(isOutcomeRecordArray(validOutcome)).toBe(false);
  });
});

describe('isAchievementUnlock', () => {
  it('accepts a well-formed unlock', () => {
    expect(isAchievementUnlock(validUnlock)).toBe(true);
  });

  it.each([
    ['missing achievementId', { ...validUnlock, achievementId: undefined }],
    ['non-numeric ts', { ...validUnlock, ts: null }],
  ])('rejects %s', (_label, value) => {
    expect(isAchievementUnlock(value)).toBe(false);
  });

  it('validates the array form element-wise', () => {
    expect(isAchievementUnlockArray([validUnlock])).toBe(true);
    expect(isAchievementUnlockArray([validUnlock, { playerId: 'p' }])).toBe(false);
  });
});
