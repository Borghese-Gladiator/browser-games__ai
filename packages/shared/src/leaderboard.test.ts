import { describe, it, expect } from 'vitest';
import {
  computeBoard,
  matchHistory,
  headToHead,
  checkAchievements,
  type GameOutcome,
  type GameRecord,
  type Achievement,
} from './leaderboard.js';

// Fixed clock so windowing is deterministic. DAY/WEEK offsets are relative to it.
const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function rec(
  id: string,
  gameId: string,
  roomCode: string,
  ts: number,
  outcomes: GameOutcome[],
): GameRecord {
  return { id, gameId, roomCode, ts, outcomes };
}

// alice wins recently; bob wins long ago. Same data, different windows.
const records = [
  rec('r1', 'poker', 'AAAA', NOW - 1000, [
    { playerId: 'alice', rank: 1, score: 300 },
    { playerId: 'bob', rank: 2, score: 0 },
  ]),
  rec('r2', 'poker', 'BBBB', NOW - 3 * DAY, [
    { playerId: 'bob', rank: 1, score: 200 },
    { playerId: 'alice', rank: 2, score: 0 },
  ]),
  rec('r3', 'sheng-ji', 'CCCC', NOW - 2000, [
    { playerId: 'alice', rank: 1, score: 80 },
    { playerId: 'carol', rank: 2, score: 40 },
  ]),
];

describe('computeBoard', () => {
  it('daily window is a subset of all-time for the same data', () => {
    const all = computeBoard(records, { window: 'all-time', now: NOW });
    const daily = computeBoard(records, { window: 'daily', now: NOW });
    // all-time includes the 3-day-old game; daily drops it.
    const allBob = all.find((e) => e.playerId === 'bob')!;
    const dailyBob = daily.find((e) => e.playerId === 'bob')!;
    expect(allBob.games).toBe(2);
    expect(dailyBob.games).toBe(1); // only the recent loss is in-window
    expect(allBob.wins).toBe(1);
    expect(dailyBob.wins).toBe(0);
  });

  it('weekly window keeps the 3-day-old game that daily drops', () => {
    const weekly = computeBoard(records, { window: 'weekly', now: NOW });
    expect(weekly.find((e) => e.playerId === 'bob')!.games).toBe(2);
  });

  it('ranks by wins then totalScore and assigns rank', () => {
    const board = computeBoard(records, { window: 'all-time', now: NOW });
    expect(board[0]).toMatchObject({ playerId: 'alice', rank: 1, wins: 2 });
  });

  it('filters by gameId (per-game scope)', () => {
    const board = computeBoard(records, { gameId: 'sheng-ji', now: NOW });
    expect(board.map((e) => e.playerId).sort()).toEqual(['alice', 'carol']);
    expect(board.find((e) => e.playerId === 'alice')!.games).toBe(1);
  });

  it('filters by roomCode (per-session scope)', () => {
    const board = computeBoard(records, { roomCode: 'AAAA', now: NOW });
    expect(board.map((e) => e.playerId).sort()).toEqual(['alice', 'bob']);
    expect(board.every((e) => e.games === 1)).toBe(true);
  });
});

describe('matchHistory', () => {
  it('returns the player games newest-first with their own outcome', () => {
    const h = matchHistory(records, 'alice');
    expect(h).toHaveLength(3);
    expect(h[0].ts).toBeGreaterThan(h[1].ts);
    // Newest of alice's games is r1 (poker, NOW-1000): a rank-1 win vs bob.
    expect(h[0].gameId).toBe('poker');
    expect(h[0].outcome.rank).toBe(1);
    expect(h[0].opponents.map((o) => o.playerId)).toEqual(['bob']);
  });

  it('honors the limit', () => {
    expect(matchHistory(records, 'alice', 1)).toHaveLength(1);
  });
});

describe('headToHead', () => {
  it('counts wins/losses/draws from the same records', () => {
    const h2h = headToHead(records, 'alice', 'bob');
    expect(h2h).toEqual({ wins: 1, losses: 1, draws: 0, games: 2 });
  });

  it('ignores games where one player is absent', () => {
    expect(headToHead(records, 'alice', 'carol')).toEqual({
      wins: 1,
      losses: 0,
      draws: 0,
      games: 1,
    });
  });
});

describe('checkAchievements', () => {
  const firstWin: Achievement = {
    id: 'poker-first-win',
    predicate: (playerId, _newRecord, playerRecords) =>
      playerRecords.filter((r) => r.outcomes.some((o) => o.playerId === playerId && o.rank === 1))
        .length === 1,
  };

  it('unlocks on the first win and not the second', () => {
    const win1 = rec('w1', 'poker', 'X', NOW, [{ playerId: 'p', rank: 1, score: 1 }]);
    expect(checkAchievements([firstWin], 'p', win1, [win1])).toEqual(['poker-first-win']);

    const win2 = rec('w2', 'poker', 'Y', NOW + 1, [{ playerId: 'p', rank: 1, score: 1 }]);
    expect(checkAchievements([firstWin], 'p', win2, [win1, win2])).toEqual([]);
  });
});
