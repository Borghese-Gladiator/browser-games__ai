// Pure turn-timeout decisions. The gateway runs one heartbeat clock; on each
// tick it asks this module which pending seats have run out of time, and what
// auto-action to apply for each so the game can never stall.
//
// Inputs are plain data so this is unit-testable without sockets or timers:
//   adapter.activeSeat(state) -> seat index whose turn it is, or -1 / null.
//   adapter.pendingSeats(state) -> seats that owe a decision when many seats act
//      in one window (absent means a single-seat turn -> [activeSeat]).
//   adapter.timeoutAction(state, seat) -> the game message to apply on timeout
//      (e.g. { action: { type: 'fold' } } for poker). null means "no auto-action".
//
// A seat is "live" if its member responded to a ping inside the grace window.
// We only time out a seat that is BOTH pending AND not live — a present player
// simply taking their time is never auto-acted on until the longer forfeit
// window; only a dark one is acted on after the shorter grace window.

import type { Adapter, EngineState, TimeoutIntent } from './types.ts';

// Has this clock exceeded its budget? `startedAt` is when it started; `now` and
// `budgetMs` are the clock + budget.
export function isTurnExpired(
  startedAt: number | null,
  now: number,
  budgetMs: number,
): boolean {
  if (startedAt == null) return false;
  return now - startedAt >= budgetMs;
}

// True when an open multi-seat window has passed its hard deadline and must
// resolve regardless of which individual seats have responded.
export function windowDeadlineExpired(
  windowOpenedAt: number | null,
  now: number,
  deadlineMs: number,
): boolean {
  return isTurnExpired(windowOpenedAt, now, deadlineMs);
}

// Decide the timeout actions for every pending seat. `liveSeats` is the set of
// seats whose player is currently connected & ponging. A seat is auto-acted when
// the window is expired AND (the seat is dark, OR the window is hard-expired past
// the longer `forfeitMs` even for a present-but-idle player — so an AFK human
// can't freeze the table indefinitely either). Returns one intent per seat that
// should be acted on this tick.
export function decideTimeout<TState extends EngineState>(
  { state, adapter, windowOpenedAt, liveSeats, pendingSeats }: {
    state: TState;
    adapter: Adapter<TState>;
    windowOpenedAt: number | null;
    liveSeats: Set<number>;
    pendingSeats: Set<number>;
  },
  { now, graceMs, forfeitMs }: { now: number; graceMs: number; forfeitMs: number },
): TimeoutIntent[] {
  const graceExpired = isTurnExpired(windowOpenedAt, now, graceMs);
  const forfeitExpired = isTurnExpired(windowOpenedAt, now, forfeitMs);

  const out: TimeoutIntent[] = [];
  for (const seat of pendingSeats) {
    if (seat < 0) continue;
    const dark = !liveSeats.has(seat);
    // Dark player: act as soon as the (short) grace window lapses. Present
    // player: only after the (longer) forfeit window, so we don't punish
    // slow-but-there.
    if (!((dark && graceExpired) || forfeitExpired)) continue;
    const msg = adapter.timeoutAction?.(state, seat);
    if (!msg) continue;
    out.push({ seat, msg, reason: dark ? 'disconnect' : 'idle' });
  }
  return out;
}
