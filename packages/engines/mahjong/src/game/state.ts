import type { Tile } from '../tiles/tile.js';
import type { Meld } from '../tiles/meld.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import type { TurnState } from './turn.js';
import type { GameEvent } from './events.js';

export type PlayerId = 0 | 1 | 2 | 3;

export type Wind = 'E' | 'S' | 'W' | 'N';

export type GamePhase = 'DEALING' | 'PLAYING' | 'FINISHED';

export interface PlayerState {
  readonly hand: readonly Tile[];
  readonly melds: readonly Meld[];
  readonly flowers: readonly Tile[];
  readonly discards: readonly Tile[];
}

export interface Wall {
  readonly tiles: readonly Tile[];
  readonly drawIndex: number;
  readonly replacementIndex: number;
}

export interface DiscardRef {
  readonly player: PlayerId;
  readonly tile: Tile;
}

export interface GameConfig {
  readonly rules: TaiwaneseRules;
  readonly seed: string | number;
  readonly dealer: PlayerId;
  readonly roundWind: Wind;
}

export interface GameOutcome {
  readonly kind: 'WIN' | 'DRAW';
  readonly winner: PlayerId | null;
  readonly dealerRepeats: boolean;
}

export interface GameState {
  readonly config: GameConfig;
  readonly rules: TaiwaneseRules;
  readonly wall: Wall;
  readonly players: readonly PlayerState[];
  readonly dealer: PlayerId;
  readonly currentPlayer: PlayerId;
  readonly roundWind: Wind;
  readonly turn: TurnState;
  readonly lastDiscard: DiscardRef | null;
  readonly phase: GamePhase;
  readonly outcome: GameOutcome | null;
  readonly events: readonly GameEvent[];
  readonly nextSeq: number;
}

export function getPlayer(state: GameState, player: PlayerId): PlayerState {
  return state.players[player];
}

export function withPlayer(state: GameState, player: PlayerId, next: PlayerState): GameState {
  const players = state.players.slice();
  players[player] = next;
  return { ...state, players };
}

export function isTerminal(state: GameState): boolean {
  return state.phase === 'FINISHED';
}

export function liveWallCount(wall: Wall): number {
  return wall.replacementIndex - wall.drawIndex + 1;
}
