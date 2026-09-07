// Adapter registry: maps a gameId to its pure engine plus the small amount of
// per-game glue the generic gateway needs. Everything game-specific lives here;
// rooms.ts and gateway.ts stay engine-agnostic.
//
// To add a new multiplayer game: import its engine and add one entry here.

import * as poker from '@browser-games/engine-poker';
import * as shengJi from '@browser-games/engine-sheng-ji';
import * as reversi from '@browser-games/engine-reversi';
import * as president from '@browser-games/engine-president';
import * as mahjong from '@browser-games/engine-mahjong';
import type { PokerState, PokerAction } from '@browser-games/engine-poker';
import type { ShengJiState } from '@browser-games/engine-sheng-ji';
import type { ReversiState, Move } from '@browser-games/engine-reversi';
import type { PresidentState, PresidentAction } from '@browser-games/engine-president';
import type {
  GameState as MahjongGameState,
  GameConfig as MahjongConfig,
  GameAction as MahjongAction,
  PlayerId as MahjongPlayerId,
  Tile as MahjongTile,
  TaiwaneseRules,
} from '@browser-games/engine-mahjong';
import type { GameRecord } from '@portal/shared/leaderboard';
import type { Adapter, AdapterTable, EngineState, GameMessage, Outcome, GameEngine } from './types.ts';
import type { OptionsBag, OptionsSchema } from './options.ts';

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

// ---------------------------------------------------------------------------
// Mahjong (Taiwanese, 16-tile). The engine is a pure reducer over a GameState
// with no seat identity. The adapter wraps it: `players` maps a playerId to a
// seat, `game` holds the engine state (null in the lobby), and every wire tile
// id is resolved against the actual hand before it reaches the engine.
// ---------------------------------------------------------------------------

interface MahjongSeat {
  id: string;
  seat: number;
  name: string;
}

export interface MahjongState extends EngineState {
  players: MahjongSeat[];
  rules: TaiwaneseRules;
  seed: number;
  game: MahjongGameState | null;
  phase: string;
}

interface MahjongAvailableAction {
  type: 'draw' | 'discard' | 'pong' | 'kong' | 'chow' | 'win' | 'pass';
  tile?: string;
  tiles?: string[];
  label: string;
}

const mahjongAi = mahjong.createStandardAi();

// Build the per-room ruleset from the validated options bag.
function mahjongRules(options?: OptionsBag): TaiwaneseRules {
  const base = mahjong.DEFAULT_TAIWANESE_RULES;
  if (!options) return { ...base };
  return {
    ...base,
    flowersEnabled: options.flowers !== undefined ? Boolean(options.flowers) : base.flowersEnabled,
    sevenPairsEnabled:
      options.sevenPairs !== undefined ? Boolean(options.sevenPairs) : base.sevenPairsEnabled,
    minimumTai: typeof options.minimumTai === 'number' ? options.minimumTai : base.minimumTai,
  };
}

// The per-room options schema, derived from a ruleset so a room can pick
// variants.
function mahjongOptionsSchema(rules: TaiwaneseRules): OptionsSchema {
  return {
    flowers: { type: 'boolean', default: rules.flowersEnabled },
    sevenPairs: { type: 'boolean', default: rules.sevenPairsEnabled },
    minimumTai: { type: 'int', min: 0, max: 10, default: rules.minimumTai },
  };
}

// Fold a fresh engine state back into the wrapper, keeping seat identity and
// mirroring phase/activeSeat for the generic gateway.
function wrapMahjong(state: MahjongState, game: MahjongGameState): MahjongState {
  return {
    ...state,
    game,
    phase: game.phase,
    activeSeat: game.pendingClaim ? -1 : game.turn.player,
  };
}

function mahjongSeatOf(state: MahjongState, playerId: string): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('unknown player');
  return player.seat;
}

// Resolve one wire tile id against the player's actual hand. Throw on a
// malformed id or a tile the player does not hold.
function resolveWireTile(hand: readonly MahjongTile[], wireTileId: unknown): MahjongTile {
  if (typeof wireTileId !== 'string' || wireTileId.length === 0) {
    throw new Error(`malformed tile id: ${String(wireTileId)}`);
  }
  const tile = hand.find((t) => t.id === wireTileId);
  if (!tile) throw new Error(`tile ${wireTileId} not in hand`);
  return tile;
}

function resolveWireTiles(hand: readonly MahjongTile[], ids: unknown): MahjongTile[] {
  if (!Array.isArray(ids)) throw new Error('malformed tiles');
  return ids.map((id) => resolveWireTile(hand, id));
}

// Deal a fresh hand from the wrapper's rules and seed.
function mahjongDeal(state: MahjongState): MahjongState {
  const config: MahjongConfig = { rules: state.rules, seed: state.seed, dealer: 0, roundWind: 'E' };
  const created = mahjong.createGame(config);
  const dealt = mahjong.applyAction(created, { type: 'DEAL' });
  if (!dealt.ok) throw new Error(`mahjong deal failed: ${dealt.error.code}`);
  return wrapMahjong(state, dealt.state);
}

function mahjongActiveSeat(state: MahjongState): number {
  const game = state.game;
  if (!game || game.phase !== 'PLAYING') return -1;
  if (game.pendingClaim) return -1;
  return game.turn.player;
}

function mahjongPendingSeats(state: MahjongState): number[] {
  const game = state.game;
  if (!game || !game.pendingClaim) return [];
  return [...game.pendingClaim.pending];
}

// Close an expired claim window once, by engine precedence, rather than
// replaying a per-seat timeout for every silent claimer.
function mahjongResolveWindow(state: MahjongState): MahjongState {
  const game = state.game;
  if (!game || !game.pendingClaim) return state;
  const result = mahjong.resolveClaimWindow(game);
  if (!result.ok) throw new Error(`mahjong resolveWindow failed: ${result.error.code}`);
  return wrapMahjong(state, result.state);
}

// Collect the ids of `count` concealed tiles that match `tile`'s kind.
function mahjongSameKindIds(hand: readonly MahjongTile[], tile: MahjongTile, count: number): string[] {
  return hand
    .filter((t) => mahjong.sameKind(t, tile))
    .slice(0, count)
    .map((t) => t.id);
}

function mahjongMatchDiscard(game: MahjongGameState, seat: number, count: number): string[] {
  const window = game.pendingClaim;
  if (!window) throw new Error('no claim window');
  return mahjongSameKindIds(game.players[seat].hand, window.discard.tile, count);
}

// Turn an engine action into the wire message onMessage will re-validate. Bot
// and timeout moves flow back through onMessage, so this never bypasses the
// tile-ownership checks.
function mahjongActionToMessage(game: MahjongGameState, action: MahjongAction): GameMessage {
  switch (action.type) {
    case 'DRAW':
      return { draw: true };
    case 'DISCARD':
      return { discard: action.tile.id };
    case 'DECLARE_WIN':
      return { claim: { type: 'win', tiles: [] } };
    case 'PASS_CLAIM':
      return { pass: true };
    case 'CLAIM_CHOW':
      return { claim: { type: 'chow', tiles: action.tiles.map((t) => t.id) } };
    case 'CLAIM_PONG':
      return { claim: { type: 'pong', tiles: mahjongMatchDiscard(game, action.player, 2) } };
    case 'CLAIM_KONG': {
      const tiles = action.concealed
        ? mahjongSameKindIds(game.players[action.player].hand, action.tile as MahjongTile, 4)
        : mahjongMatchDiscard(game, action.player, 3);
      return { claim: { type: 'kong', tiles } };
    }
    default:
      throw new Error('unknown mahjong action');
  }
}

function mahjongClaimToAction(
  game: MahjongGameState,
  seat: MahjongPlayerId,
  raw: unknown,
): MahjongAction {
  if (typeof raw !== 'object' || raw === null) throw new Error('malformed claim');
  const claim = raw as { type?: unknown; tiles?: unknown };
  const held = game.players[seat];
  const tiles = resolveWireTiles(held.hand, claim.tiles ?? []);
  switch (claim.type) {
    case 'win':
      return { type: 'DECLARE_WIN', player: seat };
    case 'pong':
      return { type: 'CLAIM_PONG', player: seat };
    case 'chow':
      if (tiles.length !== 2) throw new Error('a chow needs two tiles');
      return { type: 'CLAIM_CHOW', player: seat, tiles: [tiles[0], tiles[1]] };
    case 'kong':
      if (game.pendingClaim) {
        return { type: 'CLAIM_KONG', player: seat, concealed: false, tile: game.pendingClaim.discard.tile };
      }
      if (tiles.length === 0) throw new Error('a concealed kong needs a tile');
      return { type: 'CLAIM_KONG', player: seat, concealed: true, tile: tiles[0] };
    default:
      throw new Error(`unknown claim type: ${String(claim.type)}`);
  }
}

function mahjongMessageToAction(
  game: MahjongGameState,
  seat: MahjongPlayerId,
  msg: GameMessage,
): MahjongAction {
  const held = game.players[seat];
  if (msg.draw) return { type: 'DRAW', player: seat };
  if (msg.discard !== undefined) {
    return { type: 'DISCARD', player: seat, tile: resolveWireTile(held.hand, msg.discard) };
  }
  if (msg.claim !== undefined) return mahjongClaimToAction(game, seat, msg.claim);
  if (msg.pass) return { type: 'PASS_CLAIM', player: seat };
  throw new Error('unknown mahjong message');
}

function mahjongOnMessage(state: MahjongState, playerId: string, msg: GameMessage): MahjongState {
  const seat = mahjongSeatOf(state, playerId) as MahjongPlayerId;
  if (msg.restart) return mahjongDeal({ ...state, seed: state.seed + 1 });
  const game = state.game;
  if (!game) throw new Error('mahjong hand not started');
  const action = mahjongMessageToAction(game, seat, msg);
  const result = mahjong.applyAction(game, action);
  if (!result.ok) throw new Error(`mahjong: ${result.error.message ?? result.error.code}`);
  return wrapMahjong(state, result.state);
}

function mahjongAnticheat(state: MahjongState, playerId: string, msg: GameMessage): string | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 'not a player';
  if (msg.restart) return null;
  if (player.seat === mahjongActiveSeat(state)) return null;
  if (mahjongPendingSeats(state).includes(player.seat)) return null;
  return 'action out of turn';
}

function mahjongBotMove(state: MahjongState, seat: number): GameMessage | null {
  const game = state.game;
  if (!game || game.phase !== 'PLAYING') return null;
  const actions = mahjong.getAvailableActions(game, seat as MahjongPlayerId);
  if (actions.length === 0) return null;
  return mahjongActionToMessage(game, mahjongAi(game, actions, Math.random));
}

// On a timeout: pass an open claim, or discard the just-drawn tile, so the
// table never stalls.
function mahjongTimeout(state: MahjongState, seat: number): GameMessage | null {
  const game = state.game;
  if (!game || game.phase !== 'PLAYING') return null;
  if (game.pendingClaim) {
    return game.pendingClaim.pending.includes(seat as MahjongPlayerId) ? { pass: true } : null;
  }
  if (game.turn.player !== seat) return null;
  if (game.turn.phase === 'NEEDS_DRAW') return { draw: true };
  if (game.turn.phase === 'NEEDS_DISCARD') {
    const held = game.players[seat];
    const tile = game.turn.drawnTile ?? held.hand[held.hand.length - 1] ?? null;
    return tile ? { discard: tile.id } : null;
  }
  return null;
}

function mahjongGetOutcome(state: MahjongState): Outcome | null {
  const game = state.game;
  if (!game || game.phase !== 'FINISHED' || !game.outcome) return null;
  const outcome = game.outcome;
  return {
    outcomes: state.players.map((p) => {
      const isWinner = outcome.kind === 'WIN' && outcome.winner === p.seat;
      const rank = outcome.kind === 'DRAW' ? 1 : isWinner ? 1 : 2;
      return {
        playerId: p.id,
        rank,
        score: isWinner ? 1 : 0,
        meta: { kind: outcome.kind, winner: outcome.winner },
      };
    }),
  };
}

function mahjongTileName(tile: MahjongTile): string {
  if (tile.suit === 'flower') return `${tile.flower ?? 'flower'}`;
  if (tile.suit === 'honor') return `${tile.honor ?? 'honor'}`;
  const suit = tile.suit === 'characters' ? 'characters' : tile.suit === 'bamboo' ? 'bamboo' : 'dots';
  return `${tile.rank} ${suit}`;
}

function mahjongCloneMeld(meld: MahjongGameState['players'][number]['melds'][number]): {
  kind: string;
  tiles: string[];
} {
  return { kind: meld.kind, tiles: meld.tiles.map((t) => t.id) };
}

// The legal actions for one seat, mapped to wire shapes the React action bar
// renders verbatim.
function mahjongAvailableActions(game: MahjongGameState, seat: number): MahjongAvailableAction[] {
  const out: MahjongAvailableAction[] = [];
  for (const a of mahjong.getAvailableActions(game, seat as MahjongPlayerId)) {
    switch (a.type) {
      case 'DRAW':
        out.push({ type: 'draw', label: 'Draw' });
        break;
      case 'DISCARD':
        out.push({ type: 'discard', tile: a.tile.id, label: `Discard ${mahjongTileName(a.tile)}` });
        break;
      case 'DECLARE_WIN':
        out.push({ type: 'win', label: 'Win' });
        break;
      case 'PASS_CLAIM':
        out.push({ type: 'pass', label: 'Pass' });
        break;
      case 'CLAIM_CHOW':
        out.push({ type: 'chow', tiles: a.tiles.map((t) => t.id), label: 'Chow' });
        break;
      case 'CLAIM_PONG':
        out.push({ type: 'pong', tiles: mahjongMatchDiscard(game, a.player, 2), label: 'Pong' });
        break;
      case 'CLAIM_KONG': {
        const tiles = a.concealed
          ? mahjongSameKindIds(game.players[a.player].hand, a.tile as MahjongTile, 4)
          : mahjongMatchDiscard(game, a.player, 3);
        out.push({ type: 'kong', tiles, label: 'Kong' });
        break;
      }
    }
  }
  return out;
}

// Per-seat public view: reveal only the requesting seat's concealed hand.
// Opponents expose count, melds, flowers, and discards only.
function mahjongPublicState(state: MahjongState, seat: number): unknown {
  const players = state.players.map((p) => ({ seat: p.seat, name: p.name }));
  const game = state.game;
  if (!game) {
    return {
      phase: state.phase,
      activeSeat: -1,
      pendingSeats: [],
      wallCount: 0,
      lastDiscard: null,
      players,
      mySeat: seat,
      myHand: [],
      myMelds: [],
      myFlowers: [],
      opponents: [],
      availableActions: [],
      result: null,
    };
  }
  const me = seat >= 0 && seat < game.players.length ? game.players[seat] : null;
  const opponents = game.players
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i !== seat)
    .map(({ p, i }) => ({
      seat: i,
      name: state.players[i]?.name ?? '',
      count: p.hand.length,
      melds: p.melds.map(mahjongCloneMeld),
      flowers: p.flowers.map((t) => t.id),
      discards: p.discards.map((t) => t.id),
    }));
  const lastDiscard = game.lastDiscard
    ? { seat: game.lastDiscard.player, tile: game.lastDiscard.tile.id }
    : null;
  return {
    phase: game.phase,
    activeSeat: mahjongActiveSeat(state),
    pendingSeats: mahjongPendingSeats(state),
    wallCount: mahjong.liveWallCount(game.wall),
    lastDiscard,
    players,
    mySeat: seat,
    myHand: me ? me.hand.map((t) => t.id) : [],
    myMelds: me ? me.melds.map(mahjongCloneMeld) : [],
    myFlowers: me ? me.flowers.map((t) => t.id) : [],
    opponents,
    availableActions: me ? mahjongAvailableActions(game, seat) : [],
    result: mahjongGetOutcome(state),
  };
}

const mahjongEngine: GameEngine<MahjongState> = {
  createGame: (options) => ({
    players: [],
    rules: mahjongRules(options),
    seed: Math.floor(Math.random() * 1_000_000_000),
    game: null,
    phase: 'lobby',
    activeSeat: -1,
  }),
  addPlayer: (state, { id, name }) => {
    if (state.players.length >= 4) throw new Error('table full');
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return { ...state, players: [...state.players, { id, name, seat: state.players.length }] };
  },
  removePlayer: (state, playerId) => ({
    ...state,
    players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
  }),
  publicState: (state, seat) => mahjongPublicState(state, seat),
};

export const mahjongAdapter: Adapter<MahjongState> = {
  id: 'mahjong',
  engine: mahjongEngine,
  engineVersion: '0.1.0',
  enabled: true,
  validGameMessages: [
    { draw: 'boolean' },
    { discard: 'string' },
    { claim: 'object' },
    { pass: 'boolean' },
    { restart: 'boolean' },
  ],
  anticheat: mahjongAnticheat,
  minPlayers: 4,
  maxPlayers: 4,
  autoStart: (state) => (state.players.length === 4 && !state.game ? mahjongDeal(state) : null),
  onMessage: mahjongOnMessage,
  optionsSchema: mahjongOptionsSchema(mahjong.DEFAULT_TAIWANESE_RULES),
  activeSeat: mahjongActiveSeat,
  pendingSeats: mahjongPendingSeats,
  resolveWindow: mahjongResolveWindow,
  timeoutAction: mahjongTimeout,
  botMove: mahjongBotMove,
  getOutcome: mahjongGetOutcome,
  achievements: [{ id: 'mahjong-first-win', name: 'First Win', predicate: isFirstWin }],
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
  mahjong: mahjongAdapter as unknown as Adapter<EngineState>,
  '_infra-test': infraTestAdapter,
};
