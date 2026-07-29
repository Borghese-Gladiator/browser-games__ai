// Adapter registry: maps a gameId to its pure engine plus the small amount of
// per-game glue the generic gateway needs. Everything game-specific lives here;
// rooms.js and gateway.js stay engine-agnostic.
//
// An adapter:
//   engine       - the pure module (createGame, addPlayer, publicState, ...)
//   minPlayers   - players required before a game can start
//   maxPlayers   - seats at the table
//   autoStart    - (state) => state | null. Called after each join; return a
//                  started state when ready, else null/undefined.
//   onMessage    - (state, playerId, msg) => state. Maps an in-room game message
//                  to an engine call. `msg` is the client payload minus routing.
//   getOutcome   - (state) => { outcomes: [{playerId, rank, score, meta}] } | null.
//                  How a game declares its scoring: null until the game is over,
//                  then the per-player result. The framework persists it.
//   achievements - [{ id, name, predicate(playerId, newRecord, playerRecords) }].
//                  Unlock conditions the framework evaluates and records.
//   optionsSchema- (optional) per-room options bag spec (see options.js). Plumbed
//                  from room creation into createGame(options) so one engine can
//                  expose variants (stakes, hand count, ruleset) without a new
//                  package.
//   activeSeat   - (optional) (state) => seat whose turn it is, or -1. Used by the
//                  heartbeat-driven turn timer and the bot driver.
//   timeoutAction- (optional) (state, seat) => game msg to auto-apply when that
//                  seat's turn times out (e.g. fold). null = nothing to do.
//   botMove      - (optional) (state, seat) => game msg a bot in that seat plays.
//                  Trivial policies are fine; the seam matters, not the AI.
//
// To add a new multiplayer game: import its engine and add one entry here.

import * as poker from '@browser-games/engine-poker';
import * as shengJi from '@browser-games/engine-sheng-ji';
import * as reversi from '@browser-games/engine-reversi';
import * as president from '@browser-games/engine-president';

// True exactly once: when newRecord is the player's first recorded rank-1 finish.
const isFirstWin = (playerId, _newRecord, playerRecords) =>
  playerRecords.filter((r) => r.outcomes.some((o) => o.playerId === playerId && o.rank === 1))
    .length === 1;

// Trivial poker policy shared by the bot driver and the turn-timeout auto-action:
// never bet into uncertainty — check when free, otherwise fold. Returns a game
// message ({ action: { type } }) or null when it isn't that seat's turn.
function pokerSafeMove(state, seat) {
  const legal = poker.publicState(state, seat).legalActions;
  if (legal.length === 0) return null;
  const type = legal.includes('check') ? 'check' : 'fold';
  return { action: { type } };
}

const pokerAdapter = {
  id: 'poker',
  engine: poker,
  engineVersion: '1.0.0',
  enabled: true,
  // Shapes the gateway accepts for this game; an inbound game message must match
  // at least one before it reaches the engine.
  validGameMessages: [{ action: 'object' }, { restart: 'boolean' }],
  // Server-authoritative sanity check: reject an action submitted out of turn.
  anticheat: (state, playerId, msg) => {
    if (msg.action && state.players.find((p) => p.id === playerId)?.seat !== state.activeSeat) {
      return 'action out of turn';
    }
    return null;
  },
  minPlayers: 2,
  maxPlayers: 4,
  // Start as soon as the room is full of seats (humans + bots), or when the host
  // starts early with at least minPlayers (handled in the gateway).
  autoStart: (state) =>
    state.players.length === 4 ? poker.startHand(state) : null,
  onMessage: (state, playerId, msg) => {
    if (msg.action) return poker.applyAction(state, playerId, msg.action);
    if (msg.restart) return poker.startHand(state);
    throw new Error('unknown poker message');
  },
  optionsSchema: {
    stakes: { type: 'enum', values: ['low', 'normal', 'high'], default: 'normal' },
  },
  activeSeat: (state) => state.activeSeat,
  // On timeout the dark/idle seat checks if it's free, else folds.
  timeoutAction: (state, seat) => pokerSafeMove(state, seat),
  botMove: (state, seat) => pokerSafeMove(state, seat),
  getOutcome: (state) => {
    if (state.phase !== 'showdown' || !state.winner) return null;
    return {
      outcomes: state.players.map((p) => {
        const won = p.seat === state.winner.seat;
        return {
          playerId: p.id,
          rank: won ? 1 : 2,
          score: won ? state.winner.amount : 0,
          meta: won ? { handName: state.winner.handName } : {},
        };
      }),
    };
  },
  achievements: [{ id: 'poker-first-win', name: 'First Win', predicate: isFirstWin }],
};

// First-legal-card policy for sheng-ji bots and timeouts.
function shengJiFirstLegal(state, seat) {
  const legal = shengJi.publicState(state, seat).legalCards;
  if (!legal || legal.length === 0) return null;
  return { cardId: legal[0] };
}

const shengJiAdapter = {
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
  autoStart: (state) =>
    state.players.length === 4 ? shengJi.startDeal(state) : null,
  onMessage: (state, playerId, msg) => {
    if (msg.cardId) return shengJi.playCard(state, playerId, msg.cardId);
    if (msg.restart) return shengJi.startDeal(state);
    throw new Error('unknown sheng-ji message');
  },
  activeSeat: (state) => state.activeSeat,
  // Play the first legal card (publicState exposes legalCards for the active seat).
  timeoutAction: (state, seat) => shengJiFirstLegal(state, seat),
  botMove: (state, seat) => shengJiFirstLegal(state, seat),
  getOutcome: (state) => {
    if (state.phase !== 'deal-over' || !state.result) return null;
    const winTeam = state.result.winnerTeam;
    return {
      // Teams: seats 0&2 => team 0, seats 1&3 => team 1 (p.seat % 2).
      outcomes: state.players.map((p) => ({
        playerId: p.id,
        rank: p.seat % 2 === winTeam ? 1 : 2,
        score: state.result.teamPoints[p.seat % 2],
        meta: { winnerTeam: winTeam, teamPoints: [...state.result.teamPoints] },
      })),
    };
  },
  achievements: [{ id: 'shengji-first-win', name: 'Team Player', predicate: isFirstWin }],
};

const reversiAdapter = {
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
    if (msg.row !== undefined) return reversi.applyMove(state, playerId, msg);
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
// legal group, else pass. Returns a game message or null when it isn't their turn.
function presidentFirstLegal(state, seat) {
  const view = president.publicState(state, seat);
  if (seat !== view.activeSeat) return null;
  if (view.legalPlays && view.legalPlays.length > 0) return { cards: view.legalPlays[0] };
  if (view.canPass) return { pass: true };
  return null;
}

const presidentAdapter = {
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
  autoStart: (state) =>
    state.players.length === 4 ? president.startRound(state) : null,
  onMessage: (state, playerId, msg) => {
    if (msg.restart) return president.startRound(state);
    if (msg.pass) return president.applyAction(state, playerId, { pass: true });
    if (msg.cards) return president.applyAction(state, playerId, { cards: msg.cards });
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
const infraTestAdapter = {
  id: '_infra-test',
  engine: { createGame: () => ({}), addPlayer: (s) => s, publicState: (s) => s },
  minPlayers: 2,
  maxPlayers: 2,
  autoStart: () => null,
  onMessage: (s) => s,
  enabled: false,
};

export const adapters = {
  poker: pokerAdapter,
  'sheng-ji': shengJiAdapter,
  reversi: reversiAdapter,
  president: presidentAdapter,
  '_infra-test': infraTestAdapter,
};
