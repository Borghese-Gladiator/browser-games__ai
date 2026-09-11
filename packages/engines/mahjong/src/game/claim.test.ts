import { describe, it, expect } from 'vitest';
import type { Tile } from '../tiles/tile.ts';
import type { Meld } from '../tiles/meld.ts';
import type { TileKind } from '../tiles/tile-kind.ts';
import { kindToTile } from '../hand/test-helpers.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import type { GameConfig, GameState, PlayerState, PlayerId } from './state.ts';
import { createGame } from './deal.ts';
import { applyAction } from './reducer.ts';
import type { ApplyResult } from './result.ts';

const rules = DEFAULT_TAIWANESE_RULES;

let counter = 0;
function u(kind: TileKind): Tile {
  counter += 1;
  return kindToTile(kind, counter);
}
function h(spec: string): Tile[] {
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => u(token as TileKind));
}
function player(hand: Tile[], melds: Meld[] = []): PlayerState {
  return { hand, melds, flowers: [], discards: [], score: 0 };
}

function config(overrides: Partial<GameConfig> = {}): GameConfig {
  return { rules, seed: 'claims', dealer: 0, roundWind: 'E', ...overrides };
}

function playing(players: PlayerState[], overrides: Partial<GameState> = {}): GameState {
  const start = createGame(config());
  return {
    ...start,
    phase: 'PLAYING',
    players,
    currentPlayer: 0,
    turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null },
    ...overrides,
  };
}

function unwrap(result: ApplyResult): GameState {
  if (!result.ok) {
    throw new Error(`action failed: ${result.error.code}`);
  }
  return result.state;
}

function discardBy0(state: GameState, tile: Tile): GameState {
  return unwrap(applyAction(state, { type: 'DISCARD', player: 0, tile }));
}

describe('claim window resolution', () => {
  it('lets a pong beat a chow on the same discard', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('3p 4p')),
      player(h('5p 5p')),
      player(h('9m')),
    ]);
    let next = discardBy0(state, discard);
    const chowTiles = next.pendingClaim!.eligible.find((option) => option.seat === 1);
    expect(chowTiles?.kinds).toContain('CHOW');
    next = unwrap(
      applyAction(next, {
        type: 'CLAIM_CHOW',
        player: 1,
        tiles: [next.players[1].hand[0], next.players[1].hand[1]],
      }),
    );
    next = unwrap(applyAction(next, { type: 'CLAIM_PONG', player: 2 }));
    expect(next.currentPlayer).toBe(2);
    expect(next.players[2].melds).toHaveLength(1);
    expect(next.players[2].melds[0].kind).toBe('pong');
    expect(next.players[1].melds).toHaveLength(0);
    expect(next.events.at(-1)?.type).toBe('PONG_DECLARED');
    expect(next.turn.phase).toBe('NEEDS_DISCARD');
  });

  it('lets a win beat a pong', () => {
    const discard = u('east');
    const winner = player(h('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east'));
    const state = playing([player([discard]), player(h('9p')), winner, player(h('east east'))]);
    let next = discardBy0(state, discard);
    next = unwrap(applyAction(next, { type: 'CLAIM_PONG', player: 3 }));
    next = unwrap(applyAction(next, { type: 'DECLARE_WIN', player: 2 }));
    expect(next.phase).toBe('FINISHED');
    expect(next.outcome).toMatchObject({
      kind: 'WIN',
      winner: 2,
      dealerRepeats: false,
      dealtInSeat: 0,
      selfDraw: false,
    });
    expect(next.outcome?.winningTile?.id).toBe(discard.id);
    const won = next.events.find((event) => event.type === 'HAND_WON');
    expect(won).toMatchObject({ player: 2, selfDraw: false, discardedBy: 0 });
  });

  it('resolves two competing pongs deterministically to the nearer seat', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('9m')),
      player(h('5p 5p')),
      player(h('5p 5p')),
    ]);
    let next = discardBy0(state, discard);
    next = unwrap(applyAction(next, { type: 'CLAIM_PONG', player: 3 }));
    next = unwrap(applyAction(next, { type: 'CLAIM_PONG', player: 2 }));
    expect(next.currentPlayer).toBe(2);
    expect(next.players[2].melds).toHaveLength(1);
    expect(next.players[3].melds).toHaveLength(0);
  });

  it('offers a chow only to the seat left of the discarder', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('3p 4p')),
      player(h('3p 4p')),
      player(h('9m')),
    ]);
    const next = discardBy0(state, discard);
    const seats = next.pendingClaim!.eligible.map((option) => option.seat);
    expect(seats).toEqual([1]);
    expect(next.pendingClaim!.eligible[0].kinds).toContain('CHOW');
  });

  it('lets a pass yield the tile to the next-precedence claim', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('3p 4p')),
      player(h('5p 5p')),
      player(h('9m')),
    ]);
    let next = discardBy0(state, discard);
    next = unwrap(applyAction(next, { type: 'PASS_CLAIM', player: 2 }));
    expect(next.phase).toBe('PLAYING');
    next = unwrap(
      applyAction(next, {
        type: 'CLAIM_CHOW',
        player: 1,
        tiles: [next.players[1].hand[0], next.players[1].hand[1]],
      }),
    );
    expect(next.currentPlayer).toBe(1);
    expect(next.players[1].melds[0].kind).toBe('chow');
  });

  it('continues to the next player when every eligible seat passes', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('9m')),
      player(h('5p 5p')),
      player(h('9s')),
    ]);
    let next = discardBy0(state, discard);
    next = unwrap(applyAction(next, { type: 'PASS_CLAIM', player: 2 }));
    expect(next.pendingClaim).toBeNull();
    expect(next.currentPlayer).toBe(1);
    expect(next.turn.phase).toBe('NEEDS_DRAW');
    expect(next.events.at(-1)?.type).toBe('TURN_ADVANCED');
  });

  it('closes a claim window immediately when no seat is eligible', () => {
    const discard = u('5p');
    const state = playing([
      player([discard]),
      player(h('9m')),
      player(h('1s')),
      player(h('9s')),
    ]);
    const next = discardBy0(state, discard);
    expect(next.pendingClaim).toBeNull();
    expect(next.currentPlayer).toBe(1);
    expect(next.turn.phase).toBe('NEEDS_DRAW');
    expect(next.events.some((event) => event.type === 'TILE_DISCARDED')).toBe(true);
    expect(next.events.at(-1)?.type).toBe('TURN_ADVANCED');
  });
});

describe('concealed kong', () => {
  it('draws a replacement tile through the replacement path', () => {
    const replacement = u('7m');
    const state = playing([player(h('5p 5p 5p 5p 1m 2m'))], {
      wall: { tiles: [replacement], drawIndex: 0, replacementIndex: 0 },
    });
    const kongTile = state.players[0].hand[0];
    const next = unwrap(
      applyAction(state, { type: 'CLAIM_KONG', player: 0, concealed: true, tile: kongTile }),
    );
    expect(next.players[0].melds).toHaveLength(1);
    expect(next.players[0].melds[0].kind).toBe('kong');
    expect(next.players[0].melds[0].tiles).toHaveLength(4);
    expect(next.events.some((event) => event.type === 'KONG_DECLARED')).toBe(true);
    expect(next.events.some((event) => event.type === 'TILE_DRAWN')).toBe(true);
    expect(next.players[0].hand.some((tile) => tile.rank === 7 && tile.suit === 'characters')).toBe(
      true,
    );
    expect(next.turn.phase).toBe('NEEDS_DISCARD');
  });

  it('reveals a flower replacement drawn after a kong into flowers', () => {
    const normal = u('7m');
    const flowerTile: Tile = { id: 'flower-spring-x', suit: 'flower', flower: 'spring' };
    const state = playing([player(h('5p 5p 5p 5p 1m 2m'))], {
      wall: { tiles: [normal, flowerTile], drawIndex: 0, replacementIndex: 1 },
    });
    const kongTile = state.players[0].hand[0];
    const next = unwrap(
      applyAction(state, { type: 'CLAIM_KONG', player: 0, concealed: true, tile: kongTile }),
    );
    expect(next.players[0].flowers.map((tile) => tile.flower)).toContain('spring');
    expect(next.players[0].hand.some((tile) => tile.suit === 'flower')).toBe(false);
    expect(next.events.some((event) => event.type === 'FLOWER_REPLACED')).toBe(true);
  });
});

describe('kong at wall exhaustion', () => {
  it('ends the hand as an exhaustive draw without a short hand', () => {
    const discard = u('5p');
    const claimant = player(h('5p 5p 5p 1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s'));
    const state = playing([player([discard]), player(h('9m')), claimant, player(h('9s'))], {
      wall: { tiles: createGame(config()).wall.tiles, drawIndex: 5, replacementIndex: 4 },
    });
    let next = discardBy0(state, discard);
    next = unwrap(applyAction(next, { type: 'CLAIM_KONG', player: 2, concealed: false }));
    expect(next.phase).toBe('FINISHED');
    expect(next.outcome?.kind).toBe('DRAW');
    expect(next.events.at(-1)?.type).toBe('WALL_EXHAUSTED');
    const held = next.players[2];
    const minimum = rules.concealedHandSize - 3 * held.melds.length;
    expect(held.hand.length).toBeGreaterThanOrEqual(minimum);
  });
});

describe('dealer continuation on a win', () => {
  const winningHand = (): Tile[] =>
    h('1m 2m 3m 4m 5m 6m 7m 8m 9m 1s 2s 3s 4s 5s 6s east east');

  it('keeps the dealer when the dealer wins and NEXT_HAND repeats the dealer', () => {
    const state = playing([player(winningHand()), player([]), player([]), player([])]);
    const won = unwrap(applyAction(state, { type: 'DECLARE_WIN', player: 0 }));
    expect(won.outcome).toMatchObject({ kind: 'WIN', winner: 0, dealerRepeats: true });
    expect(won.dealer).toBe(0);
    const next = unwrap(applyAction(won, { type: 'NEXT_HAND' }));
    expect(next.dealer).toBe(0);
    expect(next.roundWind).toBe('E');
    const nextHandEvent = next.events.find((event) => event.type === 'NEXT_HAND');
    expect(nextHandEvent).toMatchObject({ dealer: 0, prevailingWind: 'E' });
  });

  it('advances the dealer on NEXT_HAND when a non-dealer wins', () => {
    const state = playing([player([]), player(winningHand()), player([]), player([])], {
      currentPlayer: 1,
      turn: { phase: 'NEEDS_DISCARD', player: 1 as PlayerId, drawnTile: null },
    });
    const won = unwrap(applyAction(state, { type: 'DECLARE_WIN', player: 1 }));
    expect(won.outcome).toMatchObject({ kind: 'WIN', winner: 1, dealerRepeats: false });
    expect(won.dealer).toBe(0);
    const next = unwrap(applyAction(won, { type: 'NEXT_HAND' }));
    expect(next.dealer).toBe(1);
    const nextHandEvent = next.events.find((event) => event.type === 'NEXT_HAND');
    expect(nextHandEvent).toMatchObject({ dealer: 1, seatWinds: ['N', 'E', 'S', 'W'] });
  });
});
