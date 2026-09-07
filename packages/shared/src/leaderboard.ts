// Pure leaderboard/stats aggregation. No I/O — given an array of recorded game
// outcomes, derive boards (scoped + time-windowed), match history, head-to-head
// records, and achievement unlocks. Importable by both the server (to compute
// over the persisted store) and the client (to compute over fetched records).
//
// A record has shape:
//   { id, gameId, roomCode, ts, outcomes: [{ playerId, rank, score, meta }] }
// where rank 1 is the winner. Every derived view reads this same shape so there
// is one source of truth and no per-game hand-rolling.

export interface GameOutcome {
  playerId: string;
  rank: number;
  score?: number;
  meta?: unknown;
}

export interface GameRecord {
  id: string;
  gameId: string;
  roomCode: string;
  ts: number;
  outcomes: GameOutcome[];
}

export type LeaderboardWindow = 'daily' | 'weekly' | 'all-time';

export interface BoardOptions {
  gameId?: string;
  roomCode?: string;
  window?: LeaderboardWindow;
  limit?: number;
  now?: number;
}

export interface BoardEntry {
  playerId: string;
  wins: number;
  totalScore: number;
  games: number;
  rank: number;
}

export interface MatchHistoryEntry {
  gameId: string;
  roomCode: string;
  ts: number;
  outcome: { rank: number; score?: number; meta?: unknown };
  opponents: Array<{ playerId: string; rank: number }>;
}

export interface HeadToHeadRecord {
  wins: number;
  losses: number;
  draws: number;
  games: number;
}

export interface Achievement {
  id: string;
  name?: string;
  predicate: (playerId: string, newRecord: GameRecord, playerRecords: GameRecord[]) => boolean;
}

const WINDOW_MS: Record<LeaderboardWindow, number> = {
  daily: 86_400_000,
  weekly: 604_800_000,
  'all-time': Infinity,
};

// Records at or after this timestamp are in-window. all-time => everything.
function cutoffFor(window: LeaderboardWindow, now: number): number {
  const span = WINDOW_MS[window] ?? Infinity;
  return span === Infinity ? -Infinity : now - span;
}

// Aggregate a leaderboard for a scope + time window. gameId/roomCode are
// optional filters (omit for the global board). Returns ranked entries:
//   [{ playerId, wins, totalScore, games, rank }]
export function computeBoard(
  records: GameRecord[],
  { gameId, roomCode, window = 'all-time', limit = 10, now = Date.now() }: BoardOptions = {},
): BoardEntry[] {
  const cutoff = cutoffFor(window, now);
  const agg = new Map<string, { playerId: string; wins: number; totalScore: number; games: number }>();
  for (const rec of records) {
    if (gameId && rec.gameId !== gameId) continue;
    if (roomCode && rec.roomCode !== roomCode) continue;
    if (rec.ts < cutoff) continue;
    for (const o of rec.outcomes) {
      let row = agg.get(o.playerId);
      if (!row) {
        row = { playerId: o.playerId, wins: 0, totalScore: 0, games: 0 };
        agg.set(o.playerId, row);
      }
      row.games += 1;
      row.totalScore += o.score ?? 0;
      if (o.rank === 1) row.wins += 1;
    }
  }
  return [...agg.values()]
    .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

// Recent games for one player, newest first. Each entry pulls the player's own
// outcome plus the other seats as opponents.
export function matchHistory(
  records: GameRecord[],
  playerId: string,
  limit = 20,
): MatchHistoryEntry[] {
  return records
    .filter((rec) => rec.outcomes.some((o) => o.playerId === playerId))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit)
    .map((rec) => {
      const mine = rec.outcomes.find((o) => o.playerId === playerId)!;
      return {
        gameId: rec.gameId,
        roomCode: rec.roomCode,
        ts: rec.ts,
        outcome: { rank: mine.rank, score: mine.score, meta: mine.meta },
        opponents: rec.outcomes
          .filter((o) => o.playerId !== playerId)
          .map((o) => ({ playerId: o.playerId, rank: o.rank })),
      };
    });
}

// You-vs-opponent record across every game both players appear in. A lower rank
// wins; equal rank is a draw.
export function headToHead(
  records: GameRecord[],
  playerIdA: string,
  playerIdB: string,
): HeadToHeadRecord {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let games = 0;
  for (const rec of records) {
    const a = rec.outcomes.find((o) => o.playerId === playerIdA);
    const b = rec.outcomes.find((o) => o.playerId === playerIdB);
    if (!a || !b) continue;
    games += 1;
    if (a.rank < b.rank) wins += 1;
    else if (a.rank > b.rank) losses += 1;
    else draws += 1;
  }
  return { wins, losses, draws, games };
}

// Evaluate a game's declared achievements against a player's history. Pure:
// returns the ids whose predicate is true. Dedup (don't re-award) is the
// store's job, not this function's.
//   achievements: [{ id, name?, predicate: (playerId, newRecord, playerRecords) => boolean }]
//   playerRecords: every record this player appears in, including newRecord.
export function checkAchievements(
  achievements: Achievement[],
  playerId: string,
  newRecord: GameRecord,
  playerRecords: GameRecord[],
): string[] {
  const unlocked: string[] = [];
  for (const a of achievements) {
    if (a.predicate(playerId, newRecord, playerRecords)) unlocked.push(a.id);
  }
  return unlocked;
}
