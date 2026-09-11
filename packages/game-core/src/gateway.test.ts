import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { RoomManager, ROOM_GRACE_MS } from './rooms.js';
import { handleMessage, runHeartbeat } from './gateway.js';
import type { Adapter, EngineState, GameEngine } from './types.ts';

type Frame = Record<string, unknown>;

interface FakeSession {
  client: { connected: boolean; emit: (event: string, payload: Frame) => void };
  playerId: string;
  reconnectToken: string | null;
  room: any;
  sent: Frame[];
  spectator: boolean;
  readonly key: string;
  send(obj: Frame): void;
}

// Recreates the gateway's Session shape with a capturing fake Socket.IO socket so
// the lobby/game dispatch can be tested without a real transport. Both direct
// replies (session.send) and broadcasts (member.client.emit) land in `sent`.
function fakeSession(): FakeSession {
  const sent: Frame[] = [];
  const client = { connected: true, emit: (_event: string, payload: Frame) => { sent.push(payload); } };
  const playerId = crypto.randomUUID();
  return {
    client,
    playerId,
    reconnectToken: null,
    room: null,
    sent,
    spectator: false,
    get key() {
      return this.spectator ? `spec:${this.playerId}` : this.playerId;
    },
    send(obj: Frame) {
      client.emit(String(obj.t), obj);
    },
  };
}

interface FakeEngineState extends EngineState {
  lastMsg?: unknown;
  lastPlayer?: string;
}

const fakeEngine: GameEngine<FakeEngineState> = {
  createGame: () => ({ players: [] }),
  addPlayer: (state, { id, name }) => {
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return { ...state, players: [...state.players, { id, name, seat: state.players.length }] };
  },
  removePlayer: (state, playerId) => ({
    ...state,
    players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
  }),
  publicState: (state, seat) => ({ players: state.players, mySeat: seat }),
};

const asEngine = (a: Adapter<FakeEngineState>): Adapter<EngineState> => a as unknown as Adapter<EngineState>;

const adapter: Adapter<FakeEngineState> = {
  engine: fakeEngine,
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: () => null,
  onMessage: (state, playerId, msg) => ({ ...state, lastMsg: msg, lastPlayer: playerId }),
};

describe('gateway handleMessage', () => {
  let manager: RoomManager;
  beforeEach(() => {
    manager = new RoomManager({ test: asEngine(adapter) });
  });

  it('lists open rooms', () => {
    manager.createRoom('test');
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:list', gameId: 'test' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'rooms' });
    expect((s.sent.at(-1) as { rooms: unknown[] }).rooms).toHaveLength(1);
  });

  it('creates a room and replies joined with a code and seat', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const joined = s.sent.find((m) => m.t === 'joined') as { seat: number; code: string };
    expect(joined.seat).toBe(0);
    expect(joined.code).toHaveLength(4);
    expect(s.room).not.toBeNull();
  });

  it('lets a second player join an existing room by code', () => {
    const host = fakeSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;

    const guest = fakeSession();
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });
    expect((guest.sent.find((m) => m.t === 'joined') as { seat: number }).seat).toBe(1);
  });

  it('errors when joining a bad code', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:join', gameId: 'test', code: 'ZZZZ', name: 'Bob' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error', message: 'room not found' });
  });

  it('routes a game message to the room engine and broadcasts state', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    s.sent.length = 0;
    handleMessage(manager, s, { t: 'game', cardId: 'X' });
    expect(s.room.state.lastMsg).toMatchObject({ cardId: 'X' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'state' });
  });

  it('rejects a game message before joining a room', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'game', cardId: 'X' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error', message: 'not in a room' });
  });

  it('keeps two rooms independent', () => {
    const a = fakeSession();
    const b = fakeSession();
    handleMessage(manager, a, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    handleMessage(manager, b, { t: 'lobby:create', gameId: 'test', name: 'Bob' });
    expect(a.room.code).not.toBe(b.room.code);
    handleMessage(manager, a, { t: 'game', cardId: 'fromA' });
    expect(b.room.state.lastMsg).toBeUndefined();
  });
});

// fakeSession already carries the spectator flag and derived key the platform
// messages rely on, so platformSession is just an alias.
const platformSession = fakeSession;

describe('gateway platform messages', () => {
  let manager: RoomManager;
  beforeEach(() => {
    manager = new RoomManager({ test: asEngine(adapter) });
  });

  it('quick-match seats a player, creating a room when none is open', () => {
    const s = platformSession();
    handleMessage(manager, s, { t: 'lobby:quickmatch', gameId: 'test', name: 'Alice' });
    expect(s.sent.find((m) => m.t === 'joined')).toMatchObject({ seat: 0, isHost: true });
  });

  it('quick-match reuses an open room', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;
    const s = platformSession();
    handleMessage(manager, s, { t: 'lobby:quickmatch', gameId: 'test', name: 'Bob' });
    expect(s.room.code).toBe(code);
  });

  it('a spectator joins with seat -1 and cannot act', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;

    const spec = platformSession();
    handleMessage(manager, spec, { t: 'lobby:spectate', gameId: 'test', code });
    expect(spec.sent.find((m) => m.t === 'joined')).toMatchObject({ seat: -1 });

    handleMessage(manager, spec, { t: 'game', cardId: 'X' });
    expect(spec.sent.at(-1)).toMatchObject({ t: 'error', message: 'spectators cannot act' });
  });

  it('enforces host-only controls', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;
    const guest = platformSession();
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });

    handleMessage(manager, guest, { t: 'host:lock', locked: true });
    expect(guest.sent.at(-1)).toMatchObject({ t: 'error', message: 'host only' });

    handleMessage(manager, host, { t: 'host:lock', locked: true });
    expect(host.room.locked).toBe(true);
  });

  it('records a pong against the session key', () => {
    const s = platformSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    handleMessage(manager, s, { t: 'pong', sentAt: 1000 });
    expect(s.room.members.get(s.playerId)).toBeTruthy();
  });

  it('kick removes the target seat from engine state and blocks their moves', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;
    const guest = platformSession();
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });

    handleMessage(manager, host, { t: 'host:kick', targetId: guest.playerId });
    const room = manager.getRoom(code);
    // Assert engine seat truth, not members.size.
    expect(room.state.players.map((p) => p.id)).toEqual([host.playerId]);

    guest.sent.length = 0;
    handleMessage(manager, guest, { t: 'game', cardId: 'X' });
    expect(guest.sent.at(-1)).toMatchObject({ t: 'error' });
    expect((guest.sent.at(-1) as { message: string }).message).toMatch(/kicked/);
  });
});

describe('gateway central validation', () => {
  const schemaAdapter: Adapter<EngineState> = {
    ...adapter,
    validGameMessages: [{ cardId: 'string' }, { restart: 'boolean' }],
  };

  function joinedSession(m: RoomManager): FakeSession {
    const s = fakeSession();
    handleMessage(m, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    s.sent.length = 0;
    return s;
  }

  it('passes a schema-valid game message to the engine', () => {
    const m = new RoomManager({ test: asEngine(schemaAdapter) });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', cardId: 'AS' });
    expect(s.room.state.lastMsg).toMatchObject({ cardId: 'AS' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'state' });
  });

  it('rejects a malformed game message without mutating state', () => {
    const m = new RoomManager({ test: asEngine(schemaAdapter) });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', __evil: true });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error' });
    expect((s.sent.at(-1) as { message: string }).message).toMatch(/invalid message/);
    expect(s.room.state.lastMsg).toBeUndefined();
  });

  it('rejects a wrong-typed game message', () => {
    const m = new RoomManager({ test: asEngine(schemaAdapter) });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', cardId: 42 });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error' });
    expect(s.room.state.lastMsg).toBeUndefined();
  });
});

describe('gateway lobby leave + live list', () => {
  let manager: RoomManager;
  beforeEach(() => {
    manager = new RoomManager({ test: asEngine(adapter) });
  });

  it('lobby:leave frees the engine seat and acks with left + fresh rooms', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const guest = platformSession();
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });
    const room = manager.getRoom(code);
    expect(room.state.players).toHaveLength(2);

    guest.sent.length = 0;
    handleMessage(manager, guest, { t: 'lobby:leave' });

    // Assert engine seat truth: the guest's seat is gone from the engine.
    expect(room.state.players.map((p) => p.id)).toEqual([host.playerId]);
    expect(guest.room).toBeNull();
    expect(guest.sent.some((m) => m.t === 'left')).toBe(true);
    expect(guest.sent.at(-1)).toMatchObject({ t: 'rooms' });
  });

  it('lobby:leave on the last member deletes the room', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (host.sent.find((m) => m.t === 'joined') as { code: string }).code;
    handleMessage(manager, host, { t: 'lobby:leave' });
    expect(manager.rooms.has(code)).toBe(false);
  });

  it('pushes a fresh rooms frame to lobby watchers on membership change', () => {
    const watcher = platformSession();
    const watchers = new Map<string, Set<FakeSession>>();
    function watchLobby(session: FakeSession, gameId: string) {
      if (!watchers.has(gameId)) watchers.set(gameId, new Set());
      watchers.get(gameId)!.add(session);
    }
    function broadcastLobby(gameId: string) {
      for (const s of watchers.get(gameId) ?? []) s.send({ t: 'rooms', rooms: manager.listRooms(gameId) });
    }
    const hooks = { onLobbyChange: broadcastLobby, watchLobby };

    handleMessage(manager, watcher, { t: 'lobby:list', gameId: 'test' }, null, hooks);
    watcher.sent.length = 0;

    const creator = platformSession();
    handleMessage(manager, creator, { t: 'lobby:create', gameId: 'test', name: 'Alice' }, null, hooks);

    const pushed = watcher.sent.filter((m) => m.t === 'rooms') as Array<{ rooms: unknown[] }>;
    expect(pushed.length).toBe(1);
    expect(pushed[0].rooms).toHaveLength(1);
  });
});

describe('gateway reconnect token', () => {
  let manager: RoomManager;
  beforeEach(() => {
    manager = new RoomManager({ test: asEngine(adapter) });
  });

  it('returns a reconnectToken to the owner in joined but not in broadcast state', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const joined = s.sent.find((m) => m.t === 'joined') as { reconnectToken?: string };
    expect(typeof joined.reconnectToken).toBe('string');
    expect((joined.reconnectToken as string).length).toBeGreaterThan(0);
    // The token is adopted onto the session and never appears in any state frame.
    for (const frame of s.sent.filter((m) => m.t === 'state')) {
      expect(frame).not.toHaveProperty('reconnectToken');
    }
  });

  it('rejects a seat restore that presents the wrong token', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = (s.sent.find((m) => m.t === 'joined') as { code: string }).code;

    // A reconnect on a fresh session for the same player, but with a bad secret.
    const reconnect = fakeSession();
    reconnect.playerId = s.playerId;
    reconnect.reconnectToken = 'not-the-real-token';
    handleMessage(manager, reconnect, { t: 'lobby:join', gameId: 'test', code, name: 'Alice' });
    expect(reconnect.sent.at(-1)).toMatchObject({ t: 'error', message: 'invalid reconnect token' });
  });

  it('rejects a host action when the session token does not match', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    // Tamper with the presented secret, then attempt a host control.
    s.reconnectToken = 'tampered';
    handleMessage(manager, s, { t: 'host:lock', locked: true });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error', message: 'not authorized' });
    expect(s.room.locked).toBe(false);
  });
});

describe('runHeartbeat', () => {
  interface TurnState extends EngineState {
    turn: number;
    folded: string[];
  }
  const turnAdapter: Adapter<EngineState> = {
    engine: {
      createGame: () => ({ players: [], turn: 0, folded: [] }),
      addPlayer: (state: TurnState, { id, name }: { id: string; name: string }) => ({
        ...state,
        players: [...state.players, { id, name, seat: state.players.length }],
      }),
      removePlayer: (state: TurnState, playerId: string) => ({
        ...state,
        players: state.players.filter((p) => p.id !== playerId).map((p, i) => ({ ...p, seat: i })),
      }),
      publicState: (state: TurnState, seat: number) => ({ turn: state.turn, mySeat: seat, folded: state.folded }),
    },
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: () => null,
    onMessage: (state: TurnState, playerId: string, msg: { fold?: boolean }) => ({
      ...state,
      folded: msg.fold ? [...state.folded, playerId] : state.folded,
      turn: (state.turn + 1) % state.players.length,
    }),
    activeSeat: (state: TurnState) => (state.players.length ? state.turn : -1),
    timeoutAction: () => ({ fold: true }),
    botMove: () => ({ bot: true }),
  } as unknown as Adapter<EngineState>;

  const liveClient = { readyState: 1, emit: () => {}, send: () => {} };

  it('auto-folds a dark active player and broadcasts (cannot stall)', () => {
    const m = new RoomManager({ test: turnAdapter });
    const room = m.createRoom('test') as any;
    room.addPlayer('h', 'Host', liveClient, { now: 0 });
    room.addPlayer('g', 'Guest', liveClient, { now: 0 });
    room.state.turn = 0;
    room.windowOpenedAt = 0;
    room.recordPong('g', { now: 9000 });

    const broadcasts: string[] = [];
    runHeartbeat(m, (rm: any) => broadcasts.push(rm.code), { DEAD_MS: 100000, GRACE_MS: 1000, FORFEIT_MS: 60000 }, 9000);

    expect(room.state.folded).toContain('h');
    expect(broadcasts).toContain(room.code);
  });

  it('GCs a room only after the grace window once all humans are reaped', () => {
    const m = new RoomManager({ test: turnAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', liveClient, { now: 0 });
    // First tick reaps the dead human and marks the room empty (t=5000).
    runHeartbeat(m, () => {}, { DEAD_MS: 100, GRACE_MS: 50, FORFEIT_MS: 1000 }, 5000);
    expect(m.rooms.size).toBe(1);
    // A later tick past the grace window collects it.
    runHeartbeat(m, () => {}, { DEAD_MS: 100, GRACE_MS: 50, FORFEIT_MS: 1000 }, 5000 + ROOM_GRACE_MS);
    expect(m.rooms.size).toBe(0);
  });

  it('does not propagate an engine exception from a timeout action', () => {
    const throwingAdapter = {
      ...turnAdapter,
      onMessage: () => { throw new Error('engine boom'); },
    } as unknown as Adapter<EngineState>;
    const m = new RoomManager({ test: throwingAdapter });
    const room = m.createRoom('test') as any;
    room.addPlayer('h', 'Host', liveClient, { now: 0 });
    room.addPlayer('g', 'Guest', liveClient, { now: 0 });
    room.state.turn = 0;
    room.windowOpenedAt = 0;
    room.recordPong('g', { now: 9000 });

    expect(() =>
      runHeartbeat(m, () => {}, { DEAD_MS: 100000, GRACE_MS: 1000, FORFEIT_MS: 60000 }, 9000),
    ).not.toThrow();
  });
});
