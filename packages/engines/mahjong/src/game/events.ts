import type { Tile } from '../tiles/tile.js';
import type { PlayerId, GameState } from './state.js';
import type { TurnPhase } from './turn.js';

export interface GameEventBase {
  readonly seq: number;
}

export interface HandDealtEvent extends GameEventBase {
  readonly type: 'HAND_DEALT';
  readonly dealer: PlayerId;
}

export interface TileDrawnEvent extends GameEventBase {
  readonly type: 'TILE_DRAWN';
  readonly player: PlayerId;
  readonly tile: Tile;
}

export interface FlowerReplacedEvent extends GameEventBase {
  readonly type: 'FLOWER_REPLACED';
  readonly player: PlayerId;
  readonly flower: Tile;
  readonly replacement: Tile;
}

export interface TileDiscardedEvent extends GameEventBase {
  readonly type: 'TILE_DISCARDED';
  readonly player: PlayerId;
  readonly tile: Tile;
}

export interface TurnAdvancedEvent extends GameEventBase {
  readonly type: 'TURN_ADVANCED';
  readonly player: PlayerId;
  readonly phase: TurnPhase;
}

export interface WallExhaustedEvent extends GameEventBase {
  readonly type: 'WALL_EXHAUSTED';
}

export interface HandWonEvent extends GameEventBase {
  readonly type: 'HAND_WON';
  readonly player: PlayerId;
  readonly selfDraw: boolean;
}

export type GameEvent =
  | HandDealtEvent
  | TileDrawnEvent
  | FlowerReplacedEvent
  | TileDiscardedEvent
  | TurnAdvancedEvent
  | WallExhaustedEvent
  | HandWonEvent;

export type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type GameEventDraft = DistributiveOmit<GameEvent, 'seq'>;

export function recordEvent(
  state: GameState,
  draft: GameEventDraft,
): { readonly state: GameState; readonly event: GameEvent } {
  const event = { ...draft, seq: state.nextSeq } as GameEvent;
  const nextState: GameState = {
    ...state,
    events: [...state.events, event],
    nextSeq: state.nextSeq + 1,
  };
  return { state: nextState, event };
}

export function recordEvents(
  state: GameState,
  drafts: readonly GameEventDraft[],
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const draft of drafts) {
    const result = recordEvent(current, draft);
    current = result.state;
    events.push(result.event);
  }
  return { state: current, events };
}
