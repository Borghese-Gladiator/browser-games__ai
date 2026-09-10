import type { PlayerId } from '../game/state.ts';

export type SeatDeltas = number[];

export interface SettlementContext {
  readonly winner: PlayerId | null;
  readonly dealtInSeat: PlayerId | null;
  readonly selfDraw: boolean;
  readonly exhaustiveDraw: boolean;
  readonly playerCount: number;
}

export type SettlementRule = (totalTai: number, ctx: SettlementContext) => SeatDeltas;

export const POINTS_PER_TAI = 2;

function assertSumZero(deltas: SeatDeltas): void {
  const sum = deltas.reduce((total, value) => total + value, 0);
  if (sum !== 0) {
    throw new Error(`settlement deltas must sum to zero but summed to ${sum}`);
  }
}

export function settle(totalTai: number, ctx: SettlementContext): SeatDeltas {
  const deltas: SeatDeltas = new Array(ctx.playerCount).fill(0);
  if (ctx.exhaustiveDraw || ctx.winner === null) {
    assertSumZero(deltas);
    return deltas;
  }
  const amount = totalTai * POINTS_PER_TAI;
  if (ctx.selfDraw) {
    for (let seat = 0; seat < ctx.playerCount; seat++) {
      if (seat === ctx.winner) {
        continue;
      }
      deltas[seat] -= amount;
      deltas[ctx.winner] += amount;
    }
  } else if (ctx.dealtInSeat !== null) {
    deltas[ctx.dealtInSeat] -= amount;
    deltas[ctx.winner] += amount;
  }
  assertSumZero(deltas);
  return deltas;
}

export const taiwaneseSettlement: SettlementRule = settle;
