import type { GameState } from './state.ts';
import type { GameEvent } from './events.ts';
import type { GameError } from './errors.ts';

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: GameError };
