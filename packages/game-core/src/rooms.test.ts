import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RoomManager, Room, ROOM_GRACE_MS, reapRoom } from './rooms.js';
import { createFileEventStore } from './eventStore.ts';
import type { Adapter, EngineState, GameEngine, RoomSnapshot } from './types.ts';

// A tiny fake engine so room/manager behavior is tested without real game logic.
// It implements removePlayer so seat-truth assertions read engine state.players.
interface FakeState extends EngineState {
  started: boolean;
  moved?: boolean;
  n?: number;
}

const fakeEngine: GameEngine<FakeState> = {
  createGame: () => ({ players: [], started: false }),
  addPlayer: (state, { id, name }) => {
    if (state.players.length >= 4) throw new Error('table full');
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return { ...state, players: [...state.players, { id, name, seat: state.players.length }] };
  },
  removePlayer: (state, playerId) => ({
    ...state,
    players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
  }),
  publicState: (state, seat) => ({ players: state.players, started: state.started, mySeat: seat }),
};

const asAdapter = (a: Adapter<FakeState>): Adapter<EngineState> => a as unknown as Adapter<EngineState>;
const asRoom = <T extends EngineState>(r: Room<EngineState>): Room<T> => r as unknown as Room<T>;

function makeAdapter(overrides: Partial<Adapter<FakeState>> = {}): Adapter<EngineState> {
  return asAdapter({
    engine: fakeEngine,
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: (state) => (state.players.length === 4 ? { ...state, started: true } : null),
    onMessage: (state) => state,
    ...overrides,
  });
}

function manager() {
  return new RoomManager({ test: makeAdapter() });
}

const noClient = null;

describe('RoomManager', () => {
  it('creates a room with a unique 4-char code', () => {
    const m = manager();
    const a = m.createRoom('test');
    const b = m.createRoom('test');
    expect(a.code).toHaveLength(4);
    expect(a.code).not.toBe(b.code);
  });

  it('rejects an unknown game', () => {
    expect(() => manager().createRoom('nope')).toThrow(/unknown game/);
  });

  it('assigns sequential seats as players join', () => {
    const room = manager().createRoom('test');
    expect(room.addPlayer('p1', 'Alice', noClient)).toBe(0);
    expect(room.addPlayer('p2', 'Bob', noClient)).toBe(1);
  });

  it('rejects a player past max capacity', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'A', noClient);
    room.addPlayer('p2', 'B', noClient);
    room.addPlayer('p3', 'C', noClient);
    room.addPlayer('p4', 'D', noClient);
    expect(() => room.addPlayer('p5', 'E', noClient)).toThrow(/table full/);
  });

  it('fires autoStart when the room reaches capacity', () => {
    const room = asRoom<FakeState>(manager().createRoom('test'));
    for (const [id, n] of [['p1', 'A'], ['p2', 'B'], ['p3', 'C']]) room.addPlayer(id, n, noClient);
    expect(room.state.started).toBe(false);
    room.addPlayer('p4', 'D', noClient);
    expect(room.state.started).toBe(true);
  });

  it('keeps rooms isolated from one another', () => {
    const m = manager();
    const r1 = m.createRoom('test');
    const r2 = m.createRoom('test');
    r1.addPlayer('p1', 'Alice', noClient);
    expect(r1.playerCount).toBe(1);
    expect(r2.playerCount).toBe(0);
  });

  it('lists only open (non-full) rooms for a game', () => {
    const m = manager();
    const full = m.createRoom('test');
    for (const [id, n] of [['a', 'A'], ['b', 'B'], ['c', 'C'], ['d', 'D']]) {
      full.addPlayer(id, n, noClient);
    }
    const open = m.createRoom('test');
    open.addPlayer('e', 'E', noClient);
    const listed = m.listRooms('test');
    expect(listed.map((r) => r.code)).toEqual([open.code]);
    expect(listed[0]).toMatchObject({ players: 1, max: 4 });
  });

  it('viewFor returns the caller seat', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', noClient);
    room.addPlayer('p2', 'Bob', noClient);
    expect((room.viewFor('p2') as { mySeat: number }).mySeat).toBe(1);
  });

  it('re-seats a player after removal without stale engine seats', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', noClient);
    room.removePlayer('p1'); // frees the engine seat
    expect(room.state.players).toHaveLength(0);
    const seat = room.addPlayer('p1', 'Alice', noClient); // rejoin
    expect(seat).toBe(0);
    expect(room.state.players).toHaveLength(1);
  });
});

// --- Reconnect token: secret per seat, verified before a held-seat restore ----

describe('Room reconnect token', () => {
  it('mints a token on the first seat and requires it to restore a held seat', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', noClient);
    const token = room.tokenFor('p1');
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // A held-seat restore with the wrong secret is rejected.
    expect(() =>
      room.addPlayer('p1', 'Alice', noClient, { presentedToken: 'wrong' }),
    ).toThrow(/invalid reconnect token/);

    // The correct secret restores the same seat.
    expect(room.addPlayer('p1', 'Alice', noClient, { presentedToken: token })).toBe(0);
  });

  it('assertOwner passes with the stored token and throws otherwise', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', noClient);
    const token = room.tokenFor('p1');
    expect(() => room.assertOwner('p1', token)).not.toThrow();
    expect(() => room.assertOwner('p1', 'nope')).toThrow(/not authorized/);
    expect(() => room.assertOwner('p1', null)).toThrow(/not authorized/);
  });

  it('never places the token in the summary, presence, view, or snapshot', () => {
    const room = manager().createRoom('test');
    room.addPlayer('p1', 'Alice', noClient);
    const token = room.tokenFor('p1');
    expect(JSON.stringify(room.summary())).not.toContain(token);
    expect(JSON.stringify(room.presence())).not.toContain(token);
    expect(JSON.stringify(room.viewFor('p1'))).not.toContain(token);
    expect(JSON.stringify(room.snapshot())).not.toContain(token);
  });
});

// --- Seat truth: the engine is the single source of seat state ------------

describe('Room seat truth', () => {
  it('lobby:leave (removePlayer) frees the engine seat, not just the member map', () => {
    const room = manager().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    expect(room.state.players.map((p) => p.id)).toEqual(['h', 'g']);

    room.removePlayer('g');
    // Assert engine state, not members.size: the seat is gone from the engine.
    expect(room.state.players.map((p) => p.id)).toEqual(['h']);
    expect(room.state.players).toHaveLength(1);
  });

  it('kick frees the engine seat and re-seats the remaining players', () => {
    const room = manager().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.addPlayer('x', 'Extra', noClient);

    room.kick('h', 'g');
    expect(room.state.players.map((p) => p.id)).toEqual(['h', 'x']);
    expect(room.state.players.map((p) => p.seat)).toEqual([0, 1]);
  });

  it('applyMessage rejects a kicked player before mutating state', () => {
    const room = asRoom<FakeState>(
      new RoomManager({ test: makeAdapter({ onMessage: (s) => ({ ...s, moved: true }) }) }).createRoom('test'),
    );
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.kick('h', 'g');

    expect(() => room.applyMessage('g', { go: true })).toThrow(/kicked/);
    expect(room.state.moved).toBeUndefined();
    expect(room.isKicked('g')).toBe(true);
  });
});

// --- Rooms / matchmaking platform layer ----------------------------------

interface TurnState extends EngineState {
  turn: number;
  log: Array<{ playerId: string; msg: unknown }>;
  options?: Record<string, unknown>;
}

const turnEngine: GameEngine<TurnState> = {
  createGame: (options = {}) => ({ players: [], turn: 0, log: [], options }),
  addPlayer: (state, { id, name }) => ({
    ...state,
    players: [...state.players, { id, name, seat: state.players.length }],
  }),
  removePlayer: (state, playerId) => ({
    ...state,
    players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
  }),
  publicState: (state, seat) => ({ turn: state.turn, mySeat: seat, log: state.log }),
};

function turnAdapter(overrides: Partial<Adapter<TurnState>> = {}): Adapter<EngineState> {
  const a: Adapter<TurnState> = {
    engine: turnEngine,
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: () => null,
    onMessage: (state, playerId, msg) => ({
      ...state,
      turn: (state.turn + 1) % state.players.length,
      log: [...state.log, { playerId, msg }],
    }),
    activeSeat: (state) => (state.players.length ? state.turn : -1),
    timeoutAction: (_state, seat) => ({ skip: seat }),
    botMove: (_state, seat) => ({ bot: seat }),
    optionsSchema: { stakes: { type: 'enum', values: ['low', 'high'], default: 'low' } },
    ...overrides,
  };
  return a as unknown as Adapter<EngineState>;
}

const mgr = () => new RoomManager({ test: turnAdapter() });

describe('Room host controls', () => {
  it('makes the first human the host', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    expect(room.host).toBe('h');
  });

  it('lets the host lock the room, blocking new joins', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.lock('h', true);
    expect(() => room.addPlayer('g', 'Guest', noClient)).toThrow(/room locked/);
  });

  it('rejects host controls from a non-host', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    expect(() => room.lock('g', true)).toThrow(/host only/);
    expect(() => room.kick('g', 'h')).toThrow(/host only/);
  });

  it('kicks a member but never the host, freeing the engine seat', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.kick('h', 'g');
    expect(room.state.players.map((p) => p.id)).toEqual(['h']);
    expect(() => room.kick('h', 'h')).toThrow(/cannot kick the host/);
  });

  it('start-early fills empty seats with bots and starts', () => {
    const m = new RoomManager({
      test: turnAdapter({ autoStart: (state) => ({ ...state, started: true }) }),
    });
    const room = asRoom<TurnState & { started?: boolean }>(m.createRoom('test'));
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.startEarly('h');
    expect(room.isFull).toBe(true);
    expect(room.botSeats.size).toBe(2);
    expect(room.state.started).toBe(true);
  });

  it('start-early requires minPlayers', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    expect(() => room.startEarly('h')).toThrow(/not enough players/);
  });
});

describe('Room bots & spectators', () => {
  it('fills remaining seats with bots', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    expect(room.fillWithBots()).toBe(3);
    expect(room.isFull).toBe(true);
    expect(room.botSeats).toEqual(new Set([1, 2, 3]));
  });

  it('a spectator never receives another seat private view', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addSpectator('spec:x', noClient);
    expect((room.viewFor('spec:x') as { mySeat: number }).mySeat).toBe(-1);
  });

  it('counts a bot-only room as having no humans (for GC)', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.fillWithBots();
    expect(room.hasHumanMembers).toBe(true);
    room.removePlayer('h');
    expect(room.hasHumanMembers).toBe(false);
  });
});

describe('Room.tick (heartbeat-driven)', () => {
  const tickOpts = { deadAfterMs: 100, graceMs: 50, forfeitMs: 1000 };

  it('reaps a member whose pong is stale', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient, { now: 0 });
    room.addPlayer('g', 'Guest', noClient, { now: 0 });
    const { reaped } = room.tick({ now: 200, ...tickOpts });
    expect(reaped.sort()).toEqual(['g', 'h']);
    expect(room.members.size).toBe(0);
  });

  it('keeps a member alive after a fresh pong', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient, { now: 0 });
    room.recordPong('h', { now: 180 });
    const { reaped } = room.tick({ now: 200, ...tickOpts });
    expect(reaped).toEqual([]);
  });

  it('auto-acts (timeout) for the active seat when its player is dark', () => {
    const room = asRoom<TurnState>(mgr().createRoom('test'));
    room.addPlayer('h', 'Host', noClient, { now: 0 });
    room.addPlayer('g', 'Guest', noClient, { now: 0 });
    room.state.turn = 1;
    room.windowOpenedAt = 0;
    room.recordPong('h', { now: 190 });
    const { timeouts } = room.tick({ now: 200, ...tickOpts });
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toMatchObject({ seat: 1, reason: 'disconnect' });
  });

  it('drives a bot move on the bot seat turn', () => {
    const room = asRoom<TurnState>(mgr().createRoom('test'));
    room.addPlayer('h', 'Host', noClient, { now: 0 });
    room.fillWithBots();
    room.state.turn = 1;
    room.recordPong('h', { now: 0 });
    const { botMsgs } = room.tick({ now: 0, ...tickOpts });
    expect(botMsgs).toEqual([{ seat: 1, msg: { bot: 1 } }]);
  });

  // An adapter that exposes pendingSeats only for a multi-seat window (empty on a
  // normal turn, like mahjong outside a claim window) still falls back to the
  // single active seat, so a bot on that seat is driven and the turn never stalls.
  it('drives the active seat when pendingSeats is empty on a normal turn', () => {
    const adapter = turnAdapter({ pendingSeats: () => [] });
    const room = asRoom<TurnState>(new RoomManager({ test: adapter }).createRoom('test'));
    room.addPlayer('h', 'Host', noClient, { now: 0 });
    room.fillWithBots();
    room.state.turn = 1;
    room.recordPong('h', { now: 0 });
    const { botMsgs } = room.tick({ now: 0, ...tickOpts });
    expect(botMsgs).toEqual([{ seat: 1, msg: { bot: 1 } }]);
  });
});

describe('RoomManager quick-match & GC', () => {
  it('creates a fresh room when none is open', () => {
    const m = mgr();
    const room = m.quickMatch('test');
    expect(room.playerCount).toBe(0);
    expect(m.rooms.size).toBe(1);
  });

  it('reuses the fullest open room instead of creating one', () => {
    const m = mgr();
    const a = m.createRoom('test');
    a.addPlayer('p1', 'A', noClient);
    a.addPlayer('p2', 'B', noClient);
    const b = m.createRoom('test');
    b.addPlayer('p3', 'C', noClient);
    expect(m.quickMatch('test').code).toBe(a.code);
  });

  it('plumbs validated options into the engine on create', () => {
    const m = mgr();
    const room = asRoom<TurnState>(m.createRoom('test', { stakes: 'high' }));
    expect(room.options).toEqual({ stakes: 'high' });
    expect(room.state.options).toEqual({ stakes: 'high' });
  });

  it('rejects invalid options at creation', () => {
    expect(() => mgr().createRoom('test', { stakes: 'nope' })).toThrow(/invalid option stakes/);
  });

  it('GCs a bot-only room only after the grace window lapses', () => {
    const m = mgr();
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.fillWithBots();
    room.removePlayer('h'); // only bots remain -> reap-empty
    // Within the grace window the bot table survives a blip.
    expect(m.reapEmptyRooms(1000)).toEqual([]);
    expect(m.rooms.size).toBe(1);
    // Past the grace window it is collected.
    expect(m.reapEmptyRooms(1000 + ROOM_GRACE_MS)).toEqual([room.code]);
    expect(m.rooms.size).toBe(0);
  });

  it('a reconnecting human clears emptySince so the room is not reaped', () => {
    const m = mgr();
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.fillWithBots();
    room.removePlayer('h');
    expect(m.reapEmptyRooms(0)).toEqual([]); // marks emptySince = 0
    room.addPlayer('h2', 'Human', noClient); // human returns
    // Even well past the window, a room with a live human is never reaped.
    expect(m.reapEmptyRooms(ROOM_GRACE_MS * 2)).toEqual([]);
    expect(room.emptySince).toBeNull();
  });
});

describe('Room event log', () => {
  it('applyMessage appends an entry with stateHash, seq, playerId, msg', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.applyMessage('h', { skip: 0 });
    expect(room.eventLog).toHaveLength(1);
    const e = room.eventLog[0];
    expect(e.seq).toBe(0);
    expect(e.playerId).toBe('h');
    expect(e.msg).toEqual({ skip: 0 });
    expect(typeof e.stateHash).toBe('string');
    expect(e.stateHash).toHaveLength(16);
  });

  it('never truncates the event log past 200 entries', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    for (let i = 0; i < 201; i++) room.applyMessage('h', { skip: i });
    expect(room.eventLog).toHaveLength(201);
    expect(room.eventLog[0].msg).toEqual({ skip: 0 });
    expect(room.eventLog[0].seq).toBe(0);
  });

  it('phaseEnteredAt is set when state.phase changes', () => {
    const phaseAdapter = makeAdapter({
      onMessage: (state, _pid, msg) => ({ ...state, phase: (msg as { phase: string }).phase }),
    });
    const m = new RoomManager({ test: phaseAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    expect(room.phaseEnteredAt).toBeNull();
    room.applyMessage('h', { phase: 'active' });
    expect(room.phaseEnteredAt).toBeGreaterThan(0);
  });

  it('seq keeps advancing with no reuse and no truncation', () => {
    const room = mgr().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    for (let i = 0; i < 205; i++) room.applyMessage('h', { skip: i });
    expect(room.eventLog).toHaveLength(205);
    expect(room.eventLog[0].seq).toBe(0);
    expect(room.eventLog[room.eventLog.length - 1].seq).toBe(204);
  });
});

describe('feature flag / disabled game', () => {
  it('createRoom throws for a disabled adapter', () => {
    const m = new RoomManager({ off: makeAdapter({ enabled: false }) });
    expect(() => m.createRoom('off')).toThrow(/disabled/);
  });

  it('createRoom allows an explicitly enabled adapter', () => {
    const m = new RoomManager({ on: makeAdapter({ enabled: true }) });
    expect(m.createRoom('on').code).toHaveLength(4);
  });
});

describe('anti-cheat hook', () => {
  function anticheatManager() {
    return new RoomManager({
      test: makeAdapter({
        anticheat: (_state, _pid, msg) => ((msg as { illegal?: boolean }).illegal ? 'illegal action' : null),
        onMessage: (state) => ({ ...state, moved: true }),
      }),
    });
  }

  it('rejects an illegal action and does not mutate state', () => {
    const room = asRoom<FakeState>(anticheatManager().createRoom('test'));
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    expect(() => room.applyMessage('h', { illegal: true })).toThrow(/anticheat: illegal action/);
    expect(room.state.moved).toBeUndefined();
    expect(room.eventLog).toHaveLength(0);
  });

  it('allows a legal action through', () => {
    const room = asRoom<FakeState>(anticheatManager().createRoom('test'));
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.applyMessage('h', { ok: true });
    expect(room.state.moved).toBe(true);
  });
});

describe('snapshot / restore', () => {
  it('round-trips room state and members through a snapshot', () => {
    const m = new RoomManager({ test: makeAdapter({ onMessage: (s) => ({ ...s, n: (s.n ?? 0) + 1 }) }) });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    room.applyMessage('h', { go: true });

    const snap = room.snapshot();

    const m2 = new RoomManager({ test: makeAdapter() });
    m2.restoreRoom(snap);
    const restored = m2.getRoom(room.code);

    expect(restored.state).toEqual(room.state);
    expect(restored._eventSeq).toBe(room._eventSeq);
    expect(restored.host).toBe('h');
    expect(restored.members.get('h')!.seat).toBe(0);
    expect(restored.members.get('h')!.client).toBeNull();
  });

  it('restoreRoom skips a disabled game', () => {
    const m = new RoomManager({ off: makeAdapter({ enabled: false }) });
    const snap = { code: 'AAAA', gameId: 'off', options: {}, state: { players: [] }, members: [] } as unknown as RoomSnapshot;
    m.restoreRoom(snap);
    expect(m.rooms.has('AAAA')).toBe(false);
  });
});

describe('reapRoom event flush', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // qa: event-log-exceeds-200-entries-survives-intact (survives reaping too)
  it('flushes a >200-entry event log to the durable store on reap', async () => {
    dir = mkdtempSync(join(tmpdir(), 'reap-'));
    const eventStore = createFileEventStore(dir);
    const room = manager().createRoom('test');
    room.addPlayer('h', 'Host', noClient);
    room.addPlayer('g', 'Guest', noClient);
    for (let i = 0; i < 250; i++) room.applyMessage('h', { skip: i });

    await reapRoom(room, eventStore);

    const log = await eventStore.readLog('test');
    expect(log).toHaveLength(250);
    expect(log.map((e) => e.sequence)).toEqual(Array.from({ length: 250 }, (_, i) => i));
    expect(log[0].stateHash).toBe(room.eventLog[0].stateHash);
    expect(log[249].stateHash).toBe(room.eventLog[249].stateHash);
  });

  it('reapEmptyRooms flushes a reaped room to the injected event store', async () => {
    dir = mkdtempSync(join(tmpdir(), 'reap-'));
    const eventStore = createFileEventStore(dir);
    const m = new RoomManager({ test: makeAdapter() }, { eventStore });
    const room = m.createRoom('test');
    room.applyMessage('h', { move: 1 });

    m.reapEmptyRooms(0);
    expect(m.reapEmptyRooms(ROOM_GRACE_MS * 2)).toEqual([room.code]);

    // The flush is fire-and-forget; allow the microtask queue to drain.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const log = await eventStore.readLog('test');
    expect(log).toHaveLength(1);
    expect(log[0].payload).toMatchObject({ msg: { move: 1 } });
  });
});
