import { isWinningHand } from '../hand/winning.ts';
import type { GameAction } from './actions.ts';
import type { GameState, PlayerId } from './state.ts';
import { getPlayer } from './state.ts';
import { chowCombos, concealedKongTiles, windowOption } from './claim.ts';

export function getAvailableActions(state: GameState, player: PlayerId): readonly GameAction[] {
  if (state.phase !== 'PLAYING') {
    return [];
  }
  const actions: GameAction[] = [];
  const window = state.pendingClaim;
  if (window) {
    if (!window.pending.includes(player)) {
      return [];
    }
    const option = windowOption(window, player);
    if (!option) {
      return [];
    }
    const held = getPlayer(state, player);
    const discard = window.discard;
    if (option.kinds.includes('WIN')) {
      actions.push({ type: 'DECLARE_WIN', player });
    }
    if (option.kinds.includes('KONG')) {
      actions.push({ type: 'CLAIM_KONG', player, concealed: false, tile: discard.tile });
    }
    if (option.kinds.includes('PONG')) {
      actions.push({ type: 'CLAIM_PONG', player });
    }
    if (option.kinds.includes('CHOW')) {
      for (const combo of chowCombos(held.hand, discard.tile)) {
        actions.push({ type: 'CLAIM_CHOW', player, tiles: [combo[0], combo[1]] });
      }
    }
    actions.push({ type: 'PASS_CLAIM', player });
    return actions;
  }
  if (state.turn.player !== player) {
    return [];
  }
  if (state.turn.phase === 'NEEDS_DRAW') {
    actions.push({ type: 'DRAW', player });
    return actions;
  }
  if (state.turn.phase === 'NEEDS_DISCARD') {
    const held = getPlayer(state, player);
    for (const tile of concealedKongTiles(held.hand)) {
      actions.push({ type: 'CLAIM_KONG', player, concealed: true, tile });
    }
    if (isWinningHand({ concealed: held.hand, exposedMelds: held.melds }, state.rules).winning) {
      actions.push({ type: 'DECLARE_WIN', player });
    }
    for (const tile of held.hand) {
      actions.push({ type: 'DISCARD', player, tile });
    }
    return actions;
  }
  return [];
}
