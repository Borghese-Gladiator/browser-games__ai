import type { Tile } from '../tiles/tile.js';
import type { RandomSource } from '../random/rng.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import { createSeededRandom } from '../random/rng.js';
import { createTaiwaneseTileSet } from '../tiles/tile-set.js';
import { shuffleTiles } from '../tiles/shuffle.js';
import type { GameConfig, GameOutcome, GameState, PlayerId, PlayerState, Wall } from './state.js';
import { getPlayer, withPlayer } from './state.js';
import type { ApplyResult } from './result.js';
import type { GameError } from './errors.js';
import type { GameEvent } from './events.js';
import { recordEvent } from './events.js';
import { dealerContinues, initialTurn } from './turn.js';

export type ReplaceFlowersResult =
  | {
      readonly ok: true;
      readonly exhausted: boolean;
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | { readonly ok: false; readonly error: GameError };

function isFlower(tile: Tile): boolean {
  return tile.suit === 'flower';
}

function removeAt<T>(items: readonly T[], index: number): T[] {
  return [...items.slice(0, index), ...items.slice(index + 1)];
}

export function buildWall(rules: TaiwaneseRules, random: RandomSource): Wall {
  const tiles = shuffleTiles(createTaiwaneseTileSet(), random);
  return { tiles, drawIndex: 0, replacementIndex: tiles.length - 1 };
}

export function createGame(config: GameConfig): GameState {
  const rules = config.rules;
  const random = createSeededRandom(String(config.seed));
  const wall = buildWall(rules, random);
  const players: PlayerState[] = Array.from({ length: rules.playerCount }, () => ({
    hand: [],
    melds: [],
    flowers: [],
    discards: [],
  }));
  return {
    config,
    rules,
    wall,
    players,
    dealer: config.dealer,
    currentPlayer: config.dealer,
    roundWind: config.roundWind,
    turn: { phase: 'NEEDS_DRAW', player: config.dealer, drawnTile: null },
    lastDiscard: null,
    pendingClaim: null,
    phase: 'DEALING',
    outcome: null,
    events: [],
    nextSeq: 0,
  };
}

export function drawFromWall(state: GameState): { readonly state: GameState; readonly tile: Tile | null } {
  const { wall } = state;
  if (wall.drawIndex > wall.replacementIndex) {
    return { state, tile: null };
  }
  const tile = wall.tiles[wall.drawIndex];
  const nextWall: Wall = { ...wall, drawIndex: wall.drawIndex + 1 };
  return { state: { ...state, wall: nextWall }, tile };
}

export function drawReplacement(
  state: GameState,
): { readonly state: GameState; readonly tile: Tile | null } {
  const { wall } = state;
  if (wall.replacementIndex < wall.drawIndex) {
    return { state, tile: null };
  }
  const tile = wall.tiles[wall.replacementIndex];
  const nextWall: Wall = { ...wall, replacementIndex: wall.replacementIndex - 1 };
  return { state: { ...state, wall: nextWall }, tile };
}

export function finishAsDraw(state: GameState): ApplyResult {
  const outcome: GameOutcome = {
    kind: 'DRAW',
    winner: null,
    dealerRepeats: dealerContinues(state, { kind: 'DRAW', winner: null, dealerRepeats: false }),
  };
  const finished: GameState = { ...state, phase: 'FINISHED', outcome };
  const recorded = recordEvent(finished, { type: 'WALL_EXHAUSTED' });
  return { ok: true, state: recorded.state, events: [recorded.event] };
}

export function replaceFlowers(state: GameState, player: PlayerId): ReplaceFlowersResult {
  const held = getPlayer(state, player);
  const flowerIndex = held.hand.findIndex(isFlower);
  if (flowerIndex === -1) {
    return { ok: true, exhausted: false, state, events: [] };
  }
  const flower = held.hand[flowerIndex];
  const handWithout = removeAt(held.hand, flowerIndex);
  const drawn = drawReplacement(state);
  if (drawn.tile === null) {
    const revealed: PlayerState = {
      ...held,
      hand: handWithout,
      flowers: [...held.flowers, flower],
    };
    const stateRevealed = withPlayer(state, player, revealed);
    const recorded = recordEvent(stateRevealed, {
      type: 'FLOWER_REPLACED',
      player,
      flower,
      replacement: null,
    });
    return { ok: true, exhausted: true, state: recorded.state, events: [recorded.event] };
  }
  const replacement = drawn.tile;
  const replaced: PlayerState = {
    ...held,
    hand: [...handWithout, replacement],
    flowers: [...held.flowers, flower],
  };
  const stateWithTile = withPlayer(drawn.state, player, replaced);
  const recorded = recordEvent(stateWithTile, {
    type: 'FLOWER_REPLACED',
    player,
    flower,
    replacement,
  });
  const rest = replaceFlowers(recorded.state, player);
  if (!rest.ok) {
    return rest;
  }
  return {
    ok: true,
    exhausted: rest.exhausted,
    state: rest.state,
    events: [recorded.event, ...rest.events],
  };
}

function dealTiles(state: GameState, player: PlayerId, count: number): GameState {
  let current = state;
  for (let i = 0; i < count; i++) {
    const drawn = drawFromWall(current);
    if (drawn.tile === null) {
      return current;
    }
    const held = getPlayer(drawn.state, player);
    current = withPlayer(drawn.state, player, { ...held, hand: [...held.hand, drawn.tile] });
  }
  return current;
}

export function dealHand(state: GameState): ApplyResult {
  const rules = state.rules;
  const dealer = state.dealer;
  let current = state;
  for (let player = 0; player < rules.playerCount; player++) {
    current = dealTiles(current, player as PlayerId, rules.concealedHandSize);
  }
  const dealerDraw = drawFromWall(current);
  if (dealerDraw.tile === null) {
    return { ok: false, error: { code: 'WALL_EMPTY', message: 'wall too small to deal', action: { type: 'DEAL' } } };
  }
  const dealerHeld = getPlayer(dealerDraw.state, dealer);
  current = withPlayer(dealerDraw.state, dealer, {
    ...dealerHeld,
    hand: [...dealerHeld.hand, dealerDraw.tile],
  });
  current = {
    ...current,
    phase: 'PLAYING',
    currentPlayer: dealer,
    turn: initialTurn(dealer),
  };
  const dealt = recordEvent(current, { type: 'HAND_DEALT', dealer });
  current = dealt.state;
  const events: GameEvent[] = [dealt.event];
  for (let player = 0; player < rules.playerCount; player++) {
    const replaced = replaceFlowers(current, player as PlayerId);
    if (!replaced.ok) {
      return replaced;
    }
    current = replaced.state;
    events.push(...replaced.events);
    if (replaced.exhausted) {
      const draw = finishAsDraw(current);
      if (!draw.ok) {
        return draw;
      }
      return { ok: true, state: draw.state, events: [...events, ...draw.events] };
    }
  }
  return { ok: true, state: current, events };
}
