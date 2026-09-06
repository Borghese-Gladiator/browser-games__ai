import type { GameState } from './state.js';
import type { GameEvent } from './events.js';
import type { GameError } from './errors.js';

export type ApplyResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: GameError };
