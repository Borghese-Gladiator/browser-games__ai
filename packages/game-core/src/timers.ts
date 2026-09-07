// Pure turn-timeout decisions. The gateway runs one heartbeat clock; on each
// tick it asks this module whether the seat whose turn it is has run out of
// time, and if so what auto-action to apply so the game can never stall.
//
// Inputs are plain data so this is unit-testable without sockets or timers:
//   adapter.activeSeat(state) -> seat index whose turn it is, or -1 / null.
//   adapter.timeoutAction(state, seat) -> the game message to apply on timeout
//      (e.g. { action: { type: 'fold' } } for poker). null means "no auto-action".
//
// A seat is "live" if its member responded to a ping inside the grace window.
// We only time out a seat that is BOTH the active turn AND not live — a present
// player simply taking their time is never auto-acted on; only a dark one is.

import type { Adapter, EngineState, TimeoutDecision } from './types.ts';

// Has this seat exceeded its turn time? `turnStartedAt` is when the seat became
// active; `now` and `turnTimeoutMs` are the clock + budget.
export function isTurnExpired(
  turnStartedAt: number | null,
  now: number,
  turnTimeoutMs: number,
): boolean {
  if (turnStartedAt == null) return false;
  return now - turnStartedAt >= turnTimeoutMs;
}

// Decide the timeout action for the room, or null if nothing should happen.
// `liveSeats` is the set of seats whose player is currently connected & ponging.
// We auto-act when the turn is expired AND (the active player is dark, OR the
// turn is hard-expired past the longer `forfeitMs` even for a present-but-idle
// player — so an AFK human can't freeze the table indefinitely either).
export function decideTimeout<TState extends EngineState>(
  { state, adapter, turnStartedAt, liveSeats }: {
    state: TState;
    adapter: Adapter<TState>;
    turnStartedAt: number | null;
    liveSeats: Set<number>;
  },
  { now, graceMs, forfeitMs }: { now: number; graceMs: number; forfeitMs: number },
): TimeoutDecision | null {
  const seat = adapter.activeSeat?.(state);
  if (seat == null || seat < 0) return null;

  const dark = !liveSeats.has(seat);
  const graceExpired = isTurnExpired(turnStartedAt, now, graceMs);
  const forfeitExpired = isTurnExpired(turnStartedAt, now, forfeitMs);

  // Dark player: act as soon as the (short) grace window lapses. Present player:
  // only after the (longer) forfeit window, so we don't punish slow-but-there.
  if (!((dark && graceExpired) || forfeitExpired)) return null;

  const msg = adapter.timeoutAction?.(state, seat);
  if (!msg) return null;
  return { seat, msg, reason: dark ? 'disconnect' : 'idle' };
}
