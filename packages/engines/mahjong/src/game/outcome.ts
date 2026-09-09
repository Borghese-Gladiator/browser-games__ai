import type { Tile } from '../tiles/tile.ts';
import type { MatchedPattern } from '../scoring/scoring.ts';
import { scoreHand } from '../scoring/scoring.ts';
import type { SeatDeltas, SettlementContext } from '../scoring/settlement.ts';
import { taiwaneseSettlement } from '../scoring/settlement.ts';
import type { GameOutcome, GameState, PlayerId, PlayerState, SeatOutcome, Wind } from './state.ts';

const WINDS: readonly Wind[] = ['E', 'S', 'W', 'N'];

export function seatWindOf(seat: PlayerId, dealer: PlayerId, playerCount: number): Wind {
  return WINDS[(seat - dealer + playerCount) % playerCount];
}

export function seatWindsFor(dealer: PlayerId, playerCount: number): Wind[] {
  const winds: Wind[] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    winds.push(seatWindOf(seat as PlayerId, dealer, playerCount));
  }
  return winds;
}

export interface HandScoring {
  readonly patterns: readonly MatchedPattern[];
  readonly totalTai: number;
}

export function scoreWinner(state: GameState, winner: PlayerId, selfDraw: boolean): HandScoring {
  const held = state.players[winner];
  const seatWind = seatWindOf(winner, state.dealer, state.rules.playerCount);
  const result = scoreHand({
    hand: { concealed: held.hand, exposedMelds: held.melds },
    selfDraw,
    isDealer: winner === state.dealer,
    seatWind,
    flowers: held.flowers,
    rules: state.rules,
  });
  if (result === null) {
    return { patterns: [], totalTai: 0 };
  }
  return { patterns: result.patterns, totalTai: result.totalTai };
}

export interface OutcomeParams {
  readonly kind: 'WIN' | 'DRAW';
  readonly winner: PlayerId | null;
  readonly dealerRepeats: boolean;
  readonly dealtInSeat: PlayerId | null;
  readonly winningTile: Tile | null;
  readonly selfDraw: boolean;
  readonly patterns: readonly MatchedPattern[];
  readonly totalTai: number;
}

export interface BuiltOutcome {
  readonly outcome: GameOutcome;
  readonly players: PlayerState[];
  readonly deltas: SeatDeltas;
}

export function buildOutcome(state: GameState, params: OutcomeParams): BuiltOutcome {
  const playerCount = state.rules.playerCount;
  const ctx: SettlementContext = {
    winner: params.winner,
    dealtInSeat: params.dealtInSeat,
    selfDraw: params.selfDraw,
    exhaustiveDraw: params.kind === 'DRAW',
    playerCount,
  };
  const settlement = state.rules.settlement ?? taiwaneseSettlement;
  const deltas = settlement(params.totalTai, ctx);
  const players = state.players.map((player, seat) => ({
    ...player,
    score: player.score + deltas[seat],
  }));
  const seats: SeatOutcome[] = players.map((player, seat) => ({
    seat: seat as PlayerId,
    delta: deltas[seat],
    score: player.score,
  }));
  const outcome: GameOutcome = {
    kind: params.kind,
    winner: params.winner,
    dealerRepeats: params.dealerRepeats,
    dealtInSeat: params.dealtInSeat,
    winningTile: params.winningTile,
    selfDraw: params.selfDraw,
    patterns: params.patterns,
    totalTai: params.totalTai,
    seats,
  };
  return { outcome, players, deltas };
}
