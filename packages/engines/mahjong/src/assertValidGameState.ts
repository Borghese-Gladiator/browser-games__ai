import type { Tile } from './tiles/tile.js';
import { createTaiwaneseTileSet } from './tiles/tile-set.js';
import type { GameState, PlayerState } from './game/state.js';

export interface AssertOptions {
  readonly seed?: number;
  readonly turn?: number;
}

export class InvalidGameStateError extends Error {
  readonly rule: string;
  readonly seed?: number;
  readonly turn?: number;

  constructor(rule: string, detail: string, options?: AssertOptions) {
    const context: string[] = [];
    if (options?.seed !== undefined) {
      context.push(`seed=${options.seed}`);
    }
    if (options?.turn !== undefined) {
      context.push(`turn=${options.turn}`);
    }
    const suffix = context.length > 0 ? ` [${context.join(' ')}]` : '';
    super(`${rule}: ${detail}${suffix}`);
    this.name = 'InvalidGameStateError';
    this.rule = rule;
    this.seed = options?.seed;
    this.turn = options?.turn;
  }
}

const CANONICAL_IDS: readonly string[] = createTaiwaneseTileSet().map((tile) => tile.id);
const CANONICAL_COUNT = CANONICAL_IDS.length;
const CANONICAL_ID_SET: ReadonlySet<string> = new Set(CANONICAL_IDS);

interface TileEntry {
  readonly id: string;
  readonly where: string;
}

function liveWallTiles(state: GameState): readonly Tile[] {
  const { tiles, drawIndex, replacementIndex } = state.wall;
  if (replacementIndex < drawIndex) {
    return [];
  }
  return tiles.slice(drawIndex, replacementIndex + 1);
}

function collectTileEntries(state: GameState): TileEntry[] {
  const entries: TileEntry[] = [];
  for (const tile of liveWallTiles(state)) {
    entries.push({ id: tile.id, where: 'wall' });
  }
  state.players.forEach((player: PlayerState, seat: number) => {
    for (const tile of player.hand) {
      entries.push({ id: tile.id, where: `hand[${seat}]` });
    }
    player.melds.forEach((meld, meldIndex) => {
      for (const tile of meld.tiles) {
        entries.push({ id: tile.id, where: `meld[${seat}][${meldIndex}]` });
      }
    });
    for (const tile of player.flowers) {
      entries.push({ id: tile.id, where: `flowers[${seat}]` });
    }
    for (const tile of player.discards) {
      entries.push({ id: tile.id, where: `discards[${seat}]` });
    }
  });
  return entries;
}

export function collectAllTiles(state: GameState): Tile[] {
  const tiles: Tile[] = [];
  for (const tile of liveWallTiles(state)) {
    tiles.push(tile);
  }
  for (const player of state.players) {
    tiles.push(...player.hand);
    for (const meld of player.melds) {
      tiles.push(...meld.tiles);
    }
    tiles.push(...player.flowers);
    tiles.push(...player.discards);
  }
  return tiles;
}

function assertNoTileInTwoPlaces(state: GameState, options?: AssertOptions): void {
  const seen = new Map<string, string>();
  for (const entry of collectTileEntries(state)) {
    const previous = seen.get(entry.id);
    if (previous !== undefined) {
      throw new InvalidGameStateError(
        'NO_TILE_IN_TWO_PLACES',
        `tile ${entry.id} appears in ${previous} and ${entry.where}`,
        options,
      );
    }
    seen.set(entry.id, entry.where);
  }
}

function assertTileConservation(state: GameState, options?: AssertOptions): void {
  const entries = collectTileEntries(state);
  if (entries.length !== CANONICAL_COUNT) {
    throw new InvalidGameStateError(
      'TILE_CONSERVATION',
      `expected ${CANONICAL_COUNT} tiles but found ${entries.length}`,
      options,
    );
  }
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== CANONICAL_COUNT) {
    throw new InvalidGameStateError(
      'TILE_CONSERVATION',
      `expected ${CANONICAL_COUNT} distinct tiles but found ${ids.size}`,
      options,
    );
  }
  for (const id of ids) {
    if (!CANONICAL_ID_SET.has(id)) {
      throw new InvalidGameStateError('TILE_CONSERVATION', `unknown tile id ${id}`, options);
    }
  }
}

function assertHandSizes(state: GameState, options?: AssertOptions): void {
  const base = state.rules.concealedHandSize;
  state.players.forEach((player: PlayerState, seat: number) => {
    const lower = base - 3 * player.melds.length;
    const size = player.hand.length;
    if (size < lower || size > lower + 1) {
      throw new InvalidGameStateError(
        'HAND_SIZE',
        `hand[${seat}] size ${size} outside [${lower}, ${lower + 1}] with ${player.melds.length} melds`,
        options,
      );
    }
  });
}

function assertNoFlowerInHand(state: GameState, options?: AssertOptions): void {
  state.players.forEach((player: PlayerState, seat: number) => {
    for (const tile of player.hand) {
      if (tile.suit === 'flower') {
        throw new InvalidGameStateError(
          'NO_FLOWER_IN_HAND',
          `hand[${seat}] holds flower tile ${tile.id}`,
          options,
        );
      }
    }
    for (const tile of player.flowers) {
      if (tile.suit !== 'flower') {
        throw new InvalidGameStateError(
          'FLOWER_SET_PURE',
          `flowers[${seat}] holds non-flower tile ${tile.id}`,
          options,
        );
      }
    }
  });
}

function assertWallAndPhase(state: GameState, options?: AssertOptions): void {
  const { wall } = state;
  const size = wall.tiles.length;
  if (wall.drawIndex < 0) {
    throw new InvalidGameStateError('WALL_BOUNDS', `drawIndex ${wall.drawIndex} is negative`, options);
  }
  if (wall.replacementIndex > size - 1) {
    throw new InvalidGameStateError(
      'WALL_BOUNDS',
      `replacementIndex ${wall.replacementIndex} exceeds wall size ${size}`,
      options,
    );
  }
  if (wall.replacementIndex < wall.drawIndex - 1) {
    throw new InvalidGameStateError(
      'WALL_BOUNDS',
      `live wall count is negative (drawIndex=${wall.drawIndex} replacementIndex=${wall.replacementIndex})`,
      options,
    );
  }

  const playerCount = state.rules.playerCount;
  if (state.players.length !== playerCount) {
    throw new InvalidGameStateError(
      'PLAYER_COUNT',
      `expected ${playerCount} players but found ${state.players.length}`,
      options,
    );
  }
  if (state.currentPlayer < 0 || state.currentPlayer >= playerCount) {
    throw new InvalidGameStateError(
      'CURRENT_PLAYER',
      `currentPlayer ${state.currentPlayer} is not a valid seat`,
      options,
    );
  }
  if (state.turn.player < 0 || state.turn.player >= playerCount) {
    throw new InvalidGameStateError(
      'CURRENT_PLAYER',
      `turn.player ${state.turn.player} is not a valid seat`,
      options,
    );
  }

  if (state.phase === 'PLAYING') {
    if (state.outcome !== null) {
      throw new InvalidGameStateError('PHASE_CONSISTENCY', 'PLAYING state has an outcome', options);
    }
    if (state.pendingClaim && state.turn.phase !== 'CLAIM_RESOLUTION') {
      throw new InvalidGameStateError(
        'PHASE_CONSISTENCY',
        `pending claim requires turn phase CLAIM_RESOLUTION but found ${state.turn.phase}`,
        options,
      );
    }
    if (state.turn.phase === 'CLAIM_RESOLUTION' && !state.pendingClaim) {
      throw new InvalidGameStateError(
        'PHASE_CONSISTENCY',
        'turn phase CLAIM_RESOLUTION requires a pending claim',
        options,
      );
    }
  } else if (state.phase === 'FINISHED') {
    if (state.outcome === null) {
      throw new InvalidGameStateError('PHASE_CONSISTENCY', 'FINISHED state has no outcome', options);
    }
    if (state.pendingClaim !== null) {
      throw new InvalidGameStateError(
        'PHASE_CONSISTENCY',
        'FINISHED state still has a pending claim',
        options,
      );
    }
  } else if (state.phase === 'DEALING') {
    if (state.outcome !== null) {
      throw new InvalidGameStateError('PHASE_CONSISTENCY', 'DEALING state has an outcome', options);
    }
  } else {
    throw new InvalidGameStateError('PHASE_CONSISTENCY', `unknown phase ${state.phase}`, options);
  }

  let previous = -1;
  for (const event of state.events) {
    if (event.seq <= previous) {
      throw new InvalidGameStateError(
        'SEQUENCE_ORDER',
        `event seq ${event.seq} is not greater than previous ${previous}`,
        options,
      );
    }
    previous = event.seq;
  }
  if (state.nextSeq !== state.events.length) {
    throw new InvalidGameStateError(
      'SEQUENCE_ORDER',
      `nextSeq ${state.nextSeq} does not match event count ${state.events.length}`,
      options,
    );
  }
}

export function assertValidGameState(state: GameState, options?: AssertOptions): void {
  assertWallAndPhase(state, options);
  assertNoTileInTwoPlaces(state, options);
  assertTileConservation(state, options);
  assertNoFlowerInHand(state, options);
  if (state.phase === 'PLAYING') {
    assertHandSizes(state, options);
  }
}
