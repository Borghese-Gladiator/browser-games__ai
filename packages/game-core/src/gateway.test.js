import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { RoomManager } from './rooms.js';
import { handleMessage, runHeartbeat } from './gateway.js';

// Recreates the gateway's Session shape with a capturing fake client so the
// lobby/game dispatch can be tested without a real WebSocket.
function fakeSession() {
  const sent = [];
  const client = { readyState: 1, send: (raw) => sent.push(JSON.parse(raw)) };
  return {
    client,
    playerId: crypto.randomUUID(),
    room: null,
    sent,
    send(obj) {
      client.send(JSON.stringify(obj));
    },
  };
}

const fakeEngine = {
  createGame: () => ({ players: [] }),
  addPlayer: (state, { id, name }) => {
    if (state.players.some((p) => p.name === name)) throw new Error('name taken');
    return { ...state, players: [...state.players, { id, name, seat: state.players.length }] };
  },
  publicState: (state, seat) => ({ players: state.players, mySeat: seat }),
};

const adapter = {
  engine: fakeEngine,
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: () => null,
  onMessage: (state, playerId, msg) => ({ ...state, lastMsg: msg, lastPlayer: playerId }),
};

describe('gateway handleMessage', () => {
  let manager;
  beforeEach(() => {
    manager = new RoomManager({ test: adapter });
  });

  it('lists open rooms', () => {
    manager.createRoom('test');
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:list', gameId: 'test' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'rooms' });
    expect(s.sent.at(-1).rooms).toHaveLength(1);
  });

  it('creates a room and replies joined with a code and seat', () => {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const joined = s.sent.find((m) => m.t === 'joined');
    expect(joined.seat).toBe(0);
    expect(joined.code).toHaveLength(4);
    expect(s.room).not.toBeNull();
  });

  it('lets a second player join an existing room by code', () => {
    const host = fakeSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;

    const guest = fakeSession();
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });
    expect(guest.sent.find((m) => m.t === 'joined').seat).toBe(1);
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

// gateway sessions carry a `spectator` flag and a derived `key`; the real
// Session class lives in gateway.js, so the test session mirrors its shape.
function platformSession() {
  const s = fakeSession();
  s.spectator = false;
  Object.defineProperty(s, 'key', {
    get() {
      return this.spectator ? `spec:${this.playerId}` : this.playerId;
    },
  });
  return s;
}

describe('gateway platform messages', () => {
  let manager;
  beforeEach(() => {
    manager = new RoomManager({ test: adapter });
  });

  it('quick-match seats a player, creating a room when none is open', () => {
    const s = platformSession();
    handleMessage(manager, s, { t: 'lobby:quickmatch', gameId: 'test', name: 'Alice' });
    expect(s.sent.find((m) => m.t === 'joined')).toMatchObject({ seat: 0, isHost: true });
  });

  it('quick-match reuses an open room', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;
    const s = platformSession();
    handleMessage(manager, s, { t: 'lobby:quickmatch', gameId: 'test', name: 'Bob' });
    expect(s.room.code).toBe(code);
  });

  it('a spectator joins with seat -1 and cannot act', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;

    const spec = platformSession();
    handleMessage(manager, spec, { t: 'lobby:spectate', gameId: 'test', code });
    expect(spec.sent.find((m) => m.t === 'joined')).toMatchObject({ seat: -1 });

    handleMessage(manager, spec, { t: 'game', cardId: 'X' });
    expect(spec.sent.at(-1)).toMatchObject({ t: 'error', message: 'spectators cannot act' });
  });

  it('enforces host-only controls', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;
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
    // No throw, member still present; pong updated lastPong (smoke).
    expect(s.room.members.get(s.playerId)).toBeTruthy();
  });
});

describe('gateway central validation', () => {
  // Adapter that declares a message schema; the gateway must reject shapes that
  // don't match before they reach the engine.
  const schemaAdapter = {
    ...adapter,
    validGameMessages: [{ cardId: 'string' }, { restart: 'boolean' }],
  };

  function joinedSession(manager) {
    const s = fakeSession();
    handleMessage(manager, s, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    s.sent.length = 0;
    return s;
  }

  it('passes a schema-valid game message to the engine', () => {
    const m = new RoomManager({ test: schemaAdapter });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', cardId: 'AS' });
    expect(s.room.state.lastMsg).toMatchObject({ cardId: 'AS' });
    expect(s.sent.at(-1)).toMatchObject({ t: 'state' });
  });

  it('rejects a malformed game message without mutating state', () => {
    const m = new RoomManager({ test: schemaAdapter });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', __evil: true });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error' });
    expect(s.sent.at(-1).message).toMatch(/invalid message/);
    expect(s.room.state.lastMsg).toBeUndefined();
  });

  it('rejects a wrong-typed game message', () => {
    const m = new RoomManager({ test: schemaAdapter });
    const s = joinedSession(m);
    handleMessage(m, s, { t: 'game', cardId: 42 });
    expect(s.sent.at(-1)).toMatchObject({ t: 'error' });
    expect(s.room.state.lastMsg).toBeUndefined();
  });
});

describe('gateway lobby leave + live list', () => {
  let manager;
  beforeEach(() => {
    manager = new RoomManager({ test: adapter });
  });

  it('lobby:leave frees the seat and acks with left + fresh rooms', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const guest = platformSession();
    const code = host.sent.find((m) => m.t === 'joined').code;
    handleMessage(manager, guest, { t: 'lobby:join', gameId: 'test', code, name: 'Bob' });
    const room = manager.getRoom(code);
    expect(room.members.size).toBe(2);

    guest.sent.length = 0;
    handleMessage(manager, guest, { t: 'lobby:leave' });

    expect(room.members.has(guest.playerId)).toBe(false);
    expect(room.members.size).toBe(1);
    expect(guest.room).toBeNull();
    expect(guest.sent.some((m) => m.t === 'left')).toBe(true);
    expect(guest.sent.at(-1)).toMatchObject({ t: 'rooms' });
  });

  it('lobby:leave on the last member deletes the room', () => {
    const host = platformSession();
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'test', name: 'Alice' });
    const code = host.sent.find((m) => m.t === 'joined').code;
    handleMessage(manager, host, { t: 'lobby:leave' });
    expect(manager.rooms.has(code)).toBe(false);
  });

  it('pushes a fresh rooms frame to lobby watchers on membership change', () => {
    const watcher = platformSession();
    const hooks = { onLobbyChange: broadcastLobby, watchLobby };
    // A watcher set: gameId -> Set<session>, mirroring the gateway closure.
    const watchers = new Map();
    function watchLobby(session, gameId) {
      if (!watchers.has(gameId)) watchers.set(gameId, new Set());
      watchers.get(gameId).add(session);
    }
    function broadcastLobby(gameId) {
      const frame = JSON.stringify({ t: 'rooms', rooms: manager.listRooms(gameId) });
      for (const s of watchers.get(gameId) ?? []) s.client.send(frame);
    }

    handleMessage(manager, watcher, { t: 'lobby:list', gameId: 'test' }, null, hooks);
    watcher.sent.length = 0;

    const creator = platformSession();
    handleMessage(manager, creator, { t: 'lobby:create', gameId: 'test', name: 'Alice' }, null, hooks);

    const pushed = watcher.sent.filter((m) => m.t === 'rooms');
    expect(pushed.length).toBe(1);
    expect(pushed[0].rooms).toHaveLength(1);
  });
});

describe('runHeartbeat', () => {
  // Adapter with a turn pointer so timeout enforcement is observable.
  const turnAdapter = {
    engine: {
      createGame: () => ({ players: [], turn: 0, folded: [] }),
      addPlayer: (state, { id, name }) => ({
        ...state,
        players: [...state.players, { id, name, seat: state.players.length }],
      }),
      publicState: (state, seat) => ({ turn: state.turn, mySeat: seat, folded: state.folded }),
    },
    minPlayers: 2,
    maxPlayers: 4,
    autoStart: () => null,
    onMessage: (state, playerId, msg) => ({
      ...state,
      folded: msg.fold ? [...state.folded, playerId] : state.folded,
      turn: (state.turn + 1) % state.players.length,
    }),
    activeSeat: (state) => (state.players.length ? state.turn : -1),
    timeoutAction: () => ({ fold: true }),
    botMove: () => ({ bot: true }),
  };

  it('auto-folds a dark active player and broadcasts (cannot stall)', () => {
    const m = new RoomManager({ test: turnAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', { readyState: 1, send: () => {} }, { now: 0 });
    room.addPlayer('g', 'Guest', { readyState: 1, send: () => {} }, { now: 0 });
    room.state.turn = 0; // host to act
    room.turnStartedAt = 0;
    room.recordPong('g', { now: 9000 }); // guest live; host dark

    const broadcasts = [];
    runHeartbeat(m, (rm) => broadcasts.push(rm.code), { deadAfterMs: 100000, graceMs: 1000, forfeitMs: 60000 }, 9000);

    expect(room.state.folded).toContain('h'); // host auto-folded
    expect(broadcasts).toContain(room.code);
  });

  it('GCs a room once all humans are reaped', () => {
    const m = new RoomManager({ test: turnAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', { readyState: 1, send: () => {} }, { now: 0 });
    runHeartbeat(m, () => {}, { deadAfterMs: 100, graceMs: 50, forfeitMs: 1000 }, 5000);
    expect(m.rooms.size).toBe(0);
  });

  it('does not propagate an engine exception from a timeout action', () => {
    const throwingAdapter = {
      ...turnAdapter,
      onMessage: () => { throw new Error('engine boom'); },
    };
    const m = new RoomManager({ test: throwingAdapter });
    const room = m.createRoom('test');
    room.addPlayer('h', 'Host', { readyState: 1, send: () => {} }, { now: 0 });
    room.addPlayer('g', 'Guest', { readyState: 1, send: () => {} }, { now: 0 });
    room.state.turn = 0;
    room.turnStartedAt = 0;
    room.recordPong('g', { now: 9000 });

    expect(() =>
      runHeartbeat(m, () => {}, { deadAfterMs: 100000, graceMs: 1000, forfeitMs: 60000 }, 9000),
    ).not.toThrow();
  });
});
