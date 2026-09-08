// Bot fill-with-AI seam. A bot is just a seated "member" with no socket; when
// it is a bot's turn the gateway asks the adapter for its move and applies it
// like any other game message. This keeps a quiet lobby playable and testable.
//
// The adapter supplies the actual policy via `botMove(state, seat) -> gameMsg`
// (trivial policies are fine — the point is the seam). This module owns only the
// bot-identity helpers and the "which pending seats are bots" decision, which is
// pure.

import crypto from 'node:crypto';
import type { Adapter, BotIntent, EngineState } from './types.ts';

// Stable, recognizable bot ids/names. A bot id is a normal playerId (a UUID) so
// it flows through the engine's seat model unchanged; we tag membership as a bot
// out-of-band (Room tracks which member ids are bots).
export function makeBot(index: number): { id: string; name: string } {
  return { id: crypto.randomUUID(), name: `Bot ${index + 1}` };
}

// Iterate every pending seat that is a bot and collect each declared bot move.
// Pure: returns one intent per bot seat the adapter has a move for.
export function botActionFor<TState extends EngineState>(
  state: TState,
  adapter: Adapter<TState>,
  botSeats: Set<number>,
  pendingSeats: Set<number>,
): BotIntent[] {
  const out: BotIntent[] = [];
  for (const seat of pendingSeats) {
    if (seat < 0 || !botSeats.has(seat)) continue;
    const msg = adapter.botMove?.(state, seat);
    if (!msg) continue;
    out.push({ seat, msg });
  }
  return out;
}
