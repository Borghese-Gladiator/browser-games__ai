import { createSeededRandom } from '../random/rng.ts';
import type { GameAction } from '../game/actions.ts';
import type { GameState } from '../game/state.ts';

export type Rng = () => number;

export type RandomAi = (
  state: GameState,
  actions: readonly GameAction[],
  rng: Rng,
) => GameAction;

export function createRng(seed: number): Rng {
  const source = createSeededRandom(String(seed));
  return () => source.next();
}

export function createRandomAi(seed?: number): RandomAi {
  const own = seed === undefined ? null : createRng(seed);
  return (_state, actions, rng) => {
    const source = own ?? rng;
    const index = Math.floor(source() * actions.length);
    const bounded = index < actions.length ? index : actions.length - 1;
    return actions[bounded];
  };
}
