import type { Tile } from '../tiles/tile.ts';
import type { Meld } from '../tiles/meld.ts';
import { tileToKind } from '../tiles/tile-kind.ts';
import type { TaiwaneseRules } from '../rules/taiwanese.ts';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import type { HandInput } from '../hand/winning.ts';
import type { DiscardAction, GameAction } from '../game/actions.ts';
import type { GameState } from '../game/state.ts';
import { getPlayer } from '../game/state.ts';
import type { Rng } from './random.ts';
import { completionDistance, rankDiscards } from '@browser-games/engine-mahjong-analysis';

function removeMatching(tiles: readonly Tile[], target: Tile, limit: number): Tile[] {
  const result = tiles.slice();
  const targetKind = tileToKind(target);
  let removed = 0;
  for (let index = result.length - 1; index >= 0 && removed < limit; index -= 1) {
    if (result[index].suit === 'flower') {
      continue;
    }
    if (tileToKind(result[index]) === targetKind) {
      result.splice(index, 1);
      removed += 1;
    }
  }
  return result;
}

export function shouldClaimPong(
  input: HandInput,
  discard: Tile,
  rules: TaiwaneseRules = DEFAULT_TAIWANESE_RULES,
): boolean {
  const remaining = removeMatching(input.concealed, discard, 2);
  if (input.concealed.length - remaining.length < 2) {
    return false;
  }
  const pong: Meld = { kind: 'pong', tiles: [discard, discard, discard] };
  const before = completionDistance({
    concealed: input.concealed,
    exposedMelds: input.exposedMelds,
    rules,
  });
  const after = completionDistance({
    concealed: remaining,
    exposedMelds: [...input.exposedMelds, pong],
    rules,
  });
  return after < before;
}

export type StandardAi = (
  state: GameState,
  actions: readonly GameAction[],
  rng: Rng,
) => GameAction;

function chooseAction(state: GameState, actions: readonly GameAction[]): GameAction {
  const win = actions.find((action) => action.type === 'DECLARE_WIN');
  if (win) {
    return win;
  }
  const draw = actions.find((action) => action.type === 'DRAW');
  if (draw) {
    return draw;
  }
  const pass = actions.find((action) => action.type === 'PASS_CLAIM');
  if (pass) {
    const pong = actions.find((action) => action.type === 'CLAIM_PONG');
    if (pong && state.pendingClaim) {
      const held = getPlayer(state, pong.player);
      const improving = shouldClaimPong(
        { concealed: held.hand, exposedMelds: held.melds },
        state.pendingClaim.discard.tile,
        state.rules,
      );
      if (improving) {
        return pong;
      }
    }
    return pass;
  }
  const discards = actions.filter((action): action is DiscardAction => action.type === 'DISCARD');
  if (discards.length > 0) {
    const player = discards[0].player;
    const held = getPlayer(state, player);
    const ranked = rankDiscards({
      concealed: held.hand,
      exposedMelds: held.melds,
      rules: state.rules,
    });
    if (ranked.length > 0) {
      const best = ranked[0].kind;
      const match = discards.find((action) => tileToKind(action.tile) === best);
      if (match) {
        return match;
      }
    }
    return discards[0];
  }
  return actions[0];
}

export function createStandardAi(_seed?: number): StandardAi {
  return (state, actions, _rng) => chooseAction(state, actions);
}
