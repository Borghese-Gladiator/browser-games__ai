import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from '@browser-games/engine-mahjong';
import type {
  GameState as MahjongGameState,
  PlayerState,
  ClaimWindow,
  Tile,
} from '@browser-games/engine-mahjong';
import { mahjongAdapter, type MahjongState } from './games.ts';
import { RoomManager } from './rooms.ts';
import type { Adapter, EngineState } from './types.ts';

// Craft engine states directly so the adapter's seat-aware wrappers can be
// exercised without playing a full hand.

function tile(suit: Tile['suit'], rank: number, copy: number): Tile {
  return { id: `${suit}-${rank}-${copy}`, suit, rank };
}

function honor(kind: NonNullable<Tile['honor']>, copy: number): Tile {
  return { id: `honor-${kind}-${copy}`, suit: 'honor', honor: kind };
}

function player(partial: Partial<PlayerState> = {}): PlayerState {
  return { hand: [], melds: [], flowers: [], discards: [], score: 0, ...partial };
}

function makeGame(overrides: Partial<MahjongGameState> = {}): MahjongGameState {
  const rules = DEFAULT_TAIWANESE_RULES;
  return {
    config: { rules, seed: 1, dealer: 0, roundWind: 'E' },
    rules,
    wall: { tiles: [], drawIndex: 0, replacementIndex: -1 },
    players: [player(), player(), player(), player()],
    dealer: 0,
    currentPlayer: 0,
    roundWind: 'E',
    turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null },
    lastDiscard: null,
    pendingClaim: null,
    phase: 'PLAYING',
    outcome: null,
    events: [],
    nextSeq: 0,
    ...overrides,
  };
}

function wrap(game: MahjongGameState | null): MahjongState {
  return {
    players: [
      { id: 'p0', seat: 0, name: 'A' },
      { id: 'p1', seat: 1, name: 'B' },
      { id: 'p2', seat: 2, name: 'C' },
      { id: 'p3', seat: 3, name: 'D' },
    ],
    rules: DEFAULT_TAIWANESE_RULES,
    seed: 1,
    game,
    phase: game ? game.phase : 'lobby',
    activeSeat: game && game.pendingClaim ? -1 : game ? game.turn.player : -1,
  };
}

interface OpponentView {
  seat: number;
  count: number;
  melds: unknown[];
  flowers: string[];
  discards: string[];
}

interface PublicView {
  myHand: string[];
  opponents: OpponentView[];
  activeSeat: number;
  pendingSeats: number[];
}

describe('mahjong adapter publicState', () => {
  it('reveals only the requesting seat hand and hides every opponent hand', () => {
    const game = makeGame({
      players: [
        player({ hand: [tile('dots', 1, 1), tile('dots', 2, 1)] }),
        player({
          hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2), tile('bamboo', 5, 3)],
          discards: [tile('characters', 9, 1)],
        }),
        player({ hand: [honor('red', 1), honor('red', 2)] }),
        player({ hand: [tile('dots', 7, 1)] }),
      ],
    });
    const view = mahjongAdapter.engine.publicState(wrap(game), 0) as PublicView;

    expect(view.myHand).toEqual(['dots-1-1', 'dots-2-1']);

    const opponent = view.opponents.find((o) => o.seat === 1) as OpponentView;
    expect(opponent.count).toBe(3);
    expect(opponent.discards).toEqual(['characters-9-1']);
    // No concealed tile of any opponent leaks into the view.
    expect(JSON.stringify(view.opponents)).not.toContain('bamboo-5');
    expect(JSON.stringify(view.opponents)).not.toContain('honor-red');
    expect(Object.keys(opponent)).not.toContain('hand');
  });
});

describe('mahjong adapter pendingSeats and activeSeat', () => {
  it('is empty and points at the turn seat when no claim window is open', () => {
    const game = makeGame({ turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null } });
    const state = wrap(game);
    expect(mahjongAdapter.pendingSeats?.(state)).toEqual([]);
    expect(mahjongAdapter.activeSeat?.(state)).toBe(0);
  });

  it('lists the open claimers and reports activeSeat -1 during a window', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [
        { seat: 1, kinds: ['CHOW'] },
        { seat: 2, kinds: ['PONG'] },
      ],
      declarations: [],
      pending: [1, 2],
    };
    const game = makeGame({
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });
    const state = wrap(game);
    expect(mahjongAdapter.pendingSeats?.(state)).toEqual([1, 2]);
    expect(mahjongAdapter.activeSeat?.(state)).toBe(-1);
  });
});

describe('mahjong adapter resolveWindow', () => {
  it('closes an expired window by claim precedence (pong beats chow)', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [
        { seat: 1, kinds: ['CHOW'] },
        { seat: 2, kinds: ['PONG'] },
      ],
      declarations: [
        { seat: 1, kind: 'CHOW', tiles: [tile('bamboo', 4, 1), tile('bamboo', 6, 1)] },
        { seat: 2, kind: 'PONG', tiles: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] },
      ],
      pending: [],
    };
    const game = makeGame({
      players: [
        player({ discards: [discard] }),
        player({ hand: [tile('bamboo', 4, 1), tile('bamboo', 6, 1)] }),
        player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] }),
        player(),
      ],
      lastDiscard: { player: 0, tile: discard },
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });

    const next = mahjongAdapter.resolveWindow?.(wrap(game)) as MahjongState;
    const resolved = next.game as MahjongGameState;

    expect(resolved.pendingClaim).toBeNull();
    // Pong outranks chow: seat 2 takes the tile, seat 1 gets nothing.
    expect(resolved.players[2].melds).toHaveLength(1);
    expect(resolved.players[2].melds[0].kind).toBe('pong');
    expect(resolved.players[1].melds).toHaveLength(0);
    expect(resolved.currentPlayer).toBe(2);
    expect(resolved.turn.player).toBe(2);
  });
});

describe('mahjong adapter onMessage', () => {
  it('rejects a malformed or non-owned tile id and applies a legal discard', () => {
    const game = makeGame({
      players: [
        player({ hand: [tile('dots', 1, 1), tile('dots', 2, 1)] }),
        player({ hand: [tile('bamboo', 5, 1)] }),
        player(),
        player(),
      ],
      turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: tile('dots', 2, 1) },
    });
    const state = wrap(game);

    // Malformed id (not a string).
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 123 })).toThrow();
    // Well-formed id the player does not hold.
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 'dots-9-9' })).toThrow();
    // A tile that belongs to an opponent, not to seat 0.
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 'bamboo-5-1' })).toThrow();

    // A legal discard of an owned tile succeeds.
    const next = mahjongAdapter.onMessage(state, 'p0', { discard: 'dots-1-1' });
    const resolved = next.game as MahjongGameState;
    expect(resolved.players[0].hand.map((t) => t.id)).not.toContain('dots-1-1');
    expect(resolved.players[0].discards.map((t) => t.id)).toContain('dots-1-1');
  });
});

describe('mahjong AI seat fill', () => {
  it('fills the empty seats with bots and deals when the host starts early', () => {
    const manager = new RoomManager({
      mahjong: mahjongAdapter as unknown as Adapter<EngineState>,
    });
    const room = manager.createRoom('mahjong');
    room.addPlayer('h0', 'Alice', null);
    room.addPlayer('h1', 'Bob', null);
    expect(room.playerCount).toBe(2);

    // The shared AI-seat-fill control: the host starts with two humans and the
    // remaining seats fill with bots. minPlayers is 2, so this is allowed.
    room.startEarly('h0');

    expect(room.isFull).toBe(true);
    expect(room.botSeats.size).toBe(2);
    const state = room.state as unknown as MahjongState;
    expect(state.game).not.toBeNull();
    expect(state.phase).toBe('PLAYING');
    // Every seat drew a full concealed hand: the deal really ran.
    for (const seatPlayer of (state.game as MahjongGameState).players) {
      expect(seatPlayer.hand.length).toBeGreaterThan(0);
    }
  });
});

describe('mahjong claim window is not blocked by bots or passers', () => {
  it('auto-passes a pending seat on a timeout and always answers for a bot', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [{ seat: 1, kinds: ['PONG'] }],
      declarations: [],
      pending: [1],
    };
    const game = makeGame({
      players: [
        player({ discards: [discard] }),
        player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] }),
        player(),
        player(),
      ],
      lastDiscard: { player: 0, tile: discard },
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });
    const state = wrap(game);

    // A dark or idle seat is auto-passed at the deadline, so it cannot stall.
    expect(mahjongAdapter.timeoutAction?.(state, 1)).toEqual({ pass: true });
    // A bot always answers the window (a pass or a claim), never leaving it open.
    expect(mahjongAdapter.botMove?.(state, 1)).not.toBeNull();
  });
});
