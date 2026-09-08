import { describe, it, expect } from 'vitest';
import { RoomManager } from './rooms.js';
import { runHeartbeat } from './gateway.js';
import type { Adapter, EngineState, GameEngine } from './types.ts';

// A fake multi-seat "claim window" game: when the table fills, every seat owes a
// decision at once (activeSeat is -1). A seat resolves itself by acting; a bot
// seat is driven by botMove; a silent or merely-present seat is resolved once the
// window's hard deadline lapses via resolveWindow. This exercises the generalized
// turn layer without any real game engine.

interface WindowState extends EngineState {
  pending: number[];
  acted: Array<{ seat: number; via: string }>;
  windowClosed: boolean;
}

const engine: GameEngine<WindowState> = {
  createGame: () => ({ players: [], phase: 'lobby', pending: [], acted: [], windowClosed: false }),
  addPlayer: (state, { id, name }) => ({
    ...state,
    players: [...state.players, { id, name, seat: state.players.length }],
  }),
  removePlayer: (state, playerId) => ({
    ...state,
    players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
  }),
  publicState: (state, seat) => ({ pending: state.pending, mySeat: seat, windowClosed: state.windowClosed }),
};

const windowAdapter: Adapter<WindowState> = {
  engine,
  minPlayers: 4,
  maxPlayers: 4,
  autoStart: (state) =>
    state.players.length === 4 ? { ...state, phase: 'window', pending: [0, 1, 2, 3] } : null,
  onMessage: (state, _playerId, msg) => {
    if (msg.resolve !== undefined) {
      const seat = msg.resolve as number;
      return {
        ...state,
        pending: state.pending.filter((s) => s !== seat),
        acted: [...state.acted, { seat, via: String(msg.via) }],
      };
    }
    return state;
  },
  activeSeat: () => -1,
  pendingSeats: (state) => state.pending,
  timeoutAction: () => null,
  botMove: (_state, seat) => ({ resolve: seat, via: 'bot' }),
  resolveWindow: (state) => ({
    ...state,
    acted: [...state.acted, ...state.pending.map((seat) => ({ seat, via: 'window' }))],
    pending: [],
    windowClosed: true,
  }),
};

const asEngine = (a: Adapter<WindowState>): Adapter<EngineState> => a as unknown as Adapter<EngineState>;

const liveClient = { connected: true, readyState: 1, emit: () => {}, join: () => {}, leave: () => {} };

function openWindow() {
  const m = new RoomManager({ test: asEngine(windowAdapter) });
  const room = m.createRoom('test') as unknown as import('./rooms.js').Room<WindowState>;
  room.addPlayer('responder', 'Responder', liveClient, { now: 0 });
  room.addPlayer('silent', 'Silent', liveClient, { now: 0 });
  room.addBot(2); // bot at seat 2
  room.addPlayer('passer', 'Passer', liveClient, { now: 0 });
  return { m, room };
}

const opts = { DEAD_MS: 100000, GRACE_MS: 1000, FORFEIT_MS: 3000 };

function actedBy(room: import('./rooms.js').Room<WindowState>): Record<number, string> {
  return Object.fromEntries(room.state.acted.map((a) => [a.seat, a.via]));
}

describe('multi-seat claim window', () => {
  it('closes on deadline expiry with responding, silent, and bot seats', () => {
    const { m, room } = openWindow();

    // The passer acts on its own; the window stays open for everyone else.
    room.recordPong('responder', { now: 2500 });
    room.applyMessage('passer', { resolve: 3, via: 'self' }, { now: 0 });
    expect(room.state.pending).toEqual([0, 1, 2]);
    expect(room.state.windowClosed).toBe(false);

    // Anchor the window clock so the deadline is deterministic.
    room.windowOpenedAt = 0;

    const broadcasts: string[] = [];
    runHeartbeat(m, (rm) => broadcasts.push(rm.code), opts, opts.FORFEIT_MS);

    expect(room.state.windowClosed).toBe(true);
    expect(room.state.pending).toEqual([]);
    expect(actedBy(room)).toEqual({ 0: 'window', 1: 'window', 2: 'bot', 3: 'self' });
    expect(broadcasts).toContain(room.code);
  });

  it('a seat that passes does not block the others before the deadline', () => {
    const { m, room } = openWindow();

    room.applyMessage('passer', { resolve: 3, via: 'self' }, { now: 0 });
    room.windowOpenedAt = 0;

    const broadcasts: string[] = [];
    // Well before the deadline: the bot still resolves, but the window stays open
    // and the silent/responding seats are not forced.
    runHeartbeat(m, (rm) => broadcasts.push(rm.code), opts, 100);

    expect(room.state.windowClosed).toBe(false);
    expect(room.state.pending).toEqual([0, 1]);
    expect(actedBy(room)).toEqual({ 2: 'bot', 3: 'self' });
    expect(broadcasts).toContain(room.code);
  });
});
