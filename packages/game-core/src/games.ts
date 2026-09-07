// Adapter registry: maps a gameId to its pure engine plus the small amount of
// per-game glue the generic gateway needs. Everything game-specific lives here;
// rooms.ts and gateway.ts stay engine-agnostic.
//
// To add a new multiplayer game: import its engine and add one entry here.

import * as poker from '@browser-games/engine-poker';
import * as shengJi from '@browser-games/engine-sheng-ji';
import * as reversi from '@browser-games/engine-reversi';
import * as president from '@browser-games/engine-president';
import type { PokerState, PokerAction } from '@browser-games/engine-poker';
import type { ShengJiState } from '@browser-games/engine-sheng-ji';
import type { ReversiState, Move } from '@browser-games/engine-reversi';
import type { PresidentState, PresidentAction } from '@browser-games/engine-president';
import type { GameRecord } from '@portal/shared/leaderboard';
import type { Adapter, AdapterTable, EngineState, GameMessage } from './types.ts';

// True exactly once: when newRecord is the player's first recorded rank-1 finish.
const isFirstWin = (playerId: string, _newRecord: GameRecord, playerRecords: GameRecord[]): boolean =>
  playerRecords.filter((r) => r.outcomes.some((o) => o.playerId === playerId && o.rank === 1))
    .length === 1;

// Trivial poker policy shared by the bot driver and the turn-timeout auto-action:
// never bet into uncertainty — check when free, otherwise fold.
function pokerSafeMove(state: PokerState, seat: number): GameMessage | null {
  const legal = (poker.publicState(state, seat) as { legalActions: string[] }).legalActions;
  if (legal.length === 0) return null;
  const type = legal.includes('check') ? 'check' : 'fold';
  return { action: { type } };
}

const pokerAdapter: Adapter<PokerState> = {
  id: 'poker',
  engine: poker,
  engineVersion: '1.0.0',
  enabled: true,
  validGameMessages: [{ action: 'object' }, { restart: 'boolean' }],
  anticheat: (state, playerId, msg) => {
    if (msg.action && state.players.find((p) => p.id === playerId)?.seat !== state.activeSeat) {
      return 'action out of turn';
    }
    return null;
  },
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: (state) => (state.players.length === 4 ? poker.startHand(state) : null),
  onMessage: (state, playerId, msg) => {
    if (msg.action) return poker.applyAction(state, playerId, msg.action as PokerAction);
    if (msg.restart) return poker.startHand(state);
    throw new Error('unknown poker message');
  },
  optionsSchema: {
    stakes: { type: 'enum', values: ['low', 'normal', 'high'], default: 'normal' },
  },
  activeSeat: (state) => state.activeSeat,
  timeoutAction: (state, seat) => pokerSafeMove(state, seat),
  botMove: (state, seat) => pokerSafeMove(state, seat),
  getOutcome: (state) => {
    if (state.phase !== 'showdown' || !state.winner) return null;
    return {
      outcomes: state.players.map((p) => {
        const won = p.seat === state.winner!.seat;
        return {
          playerId: p.id,
          rank: won ? 1 : 2,
          score: won ? state.winner!.amount : 0,
          meta: won ? { handName: state.winner!.handName } : {},
        };
      }),
    };
  },
  achievements: [{ id: 'poker-first-win', name: 'First Win', predicate: isFirstWin }],
};

// First-legal-card policy for sheng-ji bots and timeouts.
function shengJiFirstLegal(state: ShengJiState, seat: number): GameMessage | null {
  const legal = (shengJi.publicState(state, seat) as { legalCards?: string[] }).legalCards;
  if (!legal || legal.length === 0) return null;
  return { cardId: legal[0] };
}

const shengJiAdapter: Adapter<ShengJiState> = {
  id: 'sheng-ji',
  engine: shengJi,
  engineVersion: '1.0.0',
  enabled: true,
  validGameMessages: [{ cardId: 'string' }, { restart: 'boolean' }],
  anticheat: (state, playerId, msg) => {
    if (msg.cardId && state.players.find((p) => p.id === playerId)?.seat !== state.activeSeat) {
      return 'action out of turn';
    }
    return null;
  },
  minPlayers: 4,
  maxPlayers: 4,
  autoStart: (state) => (state.players.length === 4 ? shengJi.startDeal(state) : null),
  onMessage: (state, playerId, msg) => {
    if (msg.cardId) return shengJi.playCard(state, playerId, msg.cardId as string);
    if (msg.restart) return shengJi.startDeal(state);
    throw new Error('unknown sheng-ji message');
  },
  activeSeat: (state) => state.activeSeat,
  timeoutAction: (state, seat) => shengJiFirstLegal(state, seat),
  botMove: (state, seat) => shengJiFirstLegal(state, seat),
  getOutcome: (state) => {
    if (state.phase !== 'deal-over' || !state.result) return null;
    const winTeam = state.result.winnerTeam;
    return {
      outcomes: state.players.map((p) => ({
        playerId: p.id,
        rank: p.seat % 2 === winTeam ? 1 : 2,
        score: state.result!.teamPoints[p.seat % 2],
        meta: { winnerTeam: winTeam, teamPoints: [...state.result!.teamPoints] },
      })),
    };
  },
  achievements: [{ id: 'shengji-first-win', name: 'Team Player', predicate: isFirstWin }],
};

const reversiAdapter: Adapter<ReversiState> = {
  id: 'reversi',
  engine: reversi,
  engineVersion: '1.0.0',
  enabled: true,
  validGameMessages: [{ row: 'number', col: 'number' }, { restart: 'boolean' }],
  anticheat: (state, playerId, msg) => {
    if (msg.row !== undefined) {
      const player = state.players.find((p) => p.id === playerId);
      if (!player || player.seat !== state.activeSeat) return 'action out of turn';
    }
    return null;
  },
  minPlayers: 2,
  maxPlayers: 2,
  autoStart: (state) => (state.players.length === 2 ? reversi.startGame(state) : null),
  onMessage: (state, playerId, msg) => {
    if (msg.restart) return reversi.startGame(state);
    if (msg.row !== undefined) return reversi.applyMove(state, playerId, msg as unknown as Move);
    throw new Error('unknown reversi message');
  },
  activeSeat: (state) => state.activeSeat,
  timeoutAction: (state, seat) => {
    const moves = reversi.legalMoves(state, seat);
    return moves.length > 0 ? { row: moves[0].row, col: moves[0].col } : null;
  },
  botMove: (state, seat) => {
    const moves = reversi.legalMoves(state, seat);
    return moves.length > 0 ? { row: moves[0].row, col: moves[0].col } : null;
  },
  getOutcome: (state) => {
    if (state.phase !== 'done') return null;
    const { B, W } = state.score;
    return {
      outcomes: state.players.map((p) => ({
        playerId: p.id,
        rank: state.winner === 'draw' ? 1 : (p.color === state.winner ? 1 : 2),
        score: p.color === 'B' ? B : W,
        meta: { color: p.color, score: state.score, winner: state.winner },
      })),
    };
  },
  achievements: [{ id: 'reversi-first-win', name: 'First Win', predicate: isFirstWin }],
};

// First-legal-play policy for President bots and turn timeouts: play the lowest
// legal group, else pass.
function presidentFirstLegal(state: PresidentState, seat: number): GameMessage | null {
  const view = president.publicState(state, seat) as {
    activeSeat: number; legalPlays?: string[][]; canPass?: boolean;
  };
  if (seat !== view.activeSeat) return null;
  if (view.legalPlays && view.legalPlays.length > 0) return { cards: view.legalPlays[0] };
  if (view.canPass) return { pass: true };
  return null;
}

const presidentAdapter: Adapter<PresidentState> = {
  id: 'president',
  engine: president,
  engineVersion: '1.0.0',
  enabled: true,
  validGameMessages: [{ cards: 'object' }, { pass: 'boolean' }, { restart: 'boolean' }],
  anticheat: (state, playerId, msg) => {
    if ((msg.cards || msg.pass) &&
      state.players.find((p) => p.id === playerId)?.seat !== state.activeSeat) {
      return 'action out of turn';
    }
    return null;
  },
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: (state) => (state.players.length === 4 ? president.startRound(state) : null),
  onMessage: (state, playerId, msg) => {
    if (msg.restart) return president.startRound(state);
    if (msg.pass) return president.applyAction(state, playerId, { pass: true } as PresidentAction);
    if (msg.cards) return president.applyAction(state, playerId, { cards: msg.cards } as PresidentAction);
    throw new Error('unknown president message');
  },
  activeSeat: (state) => state.activeSeat,
  timeoutAction: (state, seat) => presidentFirstLegal(state, seat),
  botMove: (state, seat) => presidentFirstLegal(state, seat),
  getOutcome: (state) => president.getOutcome(state),
  achievements: [{ id: 'president-first-win', name: 'First Win', predicate: isFirstWin }],
};

// Disabled fixture adapter, never listed in the portal registry. It exists only
// so the disabled-game rejection path has something to exercise.
const infraTestAdapter: Adapter<EngineState> = {
  id: '_infra-test',
  engine: {
    createGame: () => ({ players: [] }),
    addPlayer: (s) => s,
    publicState: (s) => s,
  },
  minPlayers: 2,
  maxPlayers: 2,
  autoStart: () => null,
  onMessage: (s) => s,
  enabled: false,
};

export const adapters: AdapterTable = {
  poker: pokerAdapter as unknown as Adapter<EngineState>,
  'sheng-ji': shengJiAdapter as unknown as Adapter<EngineState>,
  reversi: reversiAdapter as unknown as Adapter<EngineState>,
  president: presidentAdapter as unknown as Adapter<EngineState>,
  '_infra-test': infraTestAdapter,
};
