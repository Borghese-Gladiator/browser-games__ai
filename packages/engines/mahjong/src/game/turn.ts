import type { Tile } from '../tiles/tile.js';
import type { TaiwaneseRules } from '../rules/taiwanese.js';
import type { PlayerId, GameState, GameOutcome } from './state.js';

export type TurnPhase = 'NEEDS_DRAW' | 'NEEDS_DISCARD' | 'CLAIM_RESOLUTION';

export interface TurnState {
  readonly phase: TurnPhase;
  readonly player: PlayerId;
  readonly drawnTile: Tile | null;
}

export function playerCount(rules: TaiwaneseRules): number {
  return rules.playerCount;
}

export function nextPlayer(rules: TaiwaneseRules, player: PlayerId): PlayerId {
  return ((player + 1) % rules.playerCount) as PlayerId;
}

export function initialTurn(dealer: PlayerId): TurnState {
  return { phase: 'NEEDS_DISCARD', player: dealer, drawnTile: null };
}

export function nextTurn(state: GameState): GameState {
  const player = nextPlayer(state.rules, state.currentPlayer);
  const turn: TurnState = { phase: 'NEEDS_DRAW', player, drawnTile: null };
  return { ...state, currentPlayer: player, turn };
}

export function advanceDealer(rules: TaiwaneseRules, dealer: PlayerId): PlayerId {
  return nextPlayer(rules, dealer);
}

export function dealerContinues(state: GameState, outcome: GameOutcome): boolean {
  if (outcome.kind === 'DRAW') {
    return true;
  }
  return outcome.winner === state.dealer && state.rules.dealerRepeatsOnWin;
}
