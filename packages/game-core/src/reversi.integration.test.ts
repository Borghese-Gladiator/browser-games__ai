import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from './rooms.js';
import type { Room } from './rooms.js';
import { handleMessage } from './gateway.js';
import { adapters } from './games.js';
import type { EngineState } from './types.ts';
import type { ReversiState } from '@browser-games/engine-reversi';

// Drives the real reversi adapter through the gateway's handleMessage with
// in-memory fake WebSocket clients, so lobby flow, the spectator gate, anticheat
// and broadcast are all exercised end-to-end (no real sockets).

type Frame = Record<string, unknown>;

function fakeClient() {
  const sent: Frame[] = [];
  return {
    connected: true,
    emit: (_event: string, payload: Frame) => { sent.push(payload); },
    join: () => {},
    leave: () => {},
    sent,
    last: () => sent[sent.length - 1],
    ofType: (t: string) => sent.filter((m) => m.t === t),
    joinedCode: () => sent.find((m) => m.t === 'joined')?.code as string | undefined,
  };
}

// Mirror of the gateway's Session, minimal but with the same key/spectator
// semantics handleMessage relies on.
function session(playerId: string) {
  const client = fakeClient();
  return {
    client,
    playerId,
    reconnectToken: null as string | null,
    room: null as Room<EngineState> | null,
    spectator: false,
    get key(): string {
      return this.spectator ? `spec:${this.playerId}` : this.playerId;
    },
    send(obj: Frame) {
      this.client.emit(String(obj.t), obj);
    },
  };
}

let manager: RoomManager;
beforeEach(() => {
  manager = new RoomManager({ reversi: adapters.reversi });
});

describe('reversi lobby integration', () => {
  it('creates a room, seats two players, and auto-starts', () => {
    const host = session('p0');
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'reversi', name: 'Alice' });
    const code = host.client.joinedCode()!;

    const guest = session('p1');
    handleMessage(manager, guest, { t: 'lobby:join', code, name: 'Bob' });

    const room = manager.getRoom(code);
    expect(room.state.phase).toBe('playing');
    expect(room.state.players).toHaveLength(2);
    expect(room.isFull).toBe(true);
  });

  it('admits a third user as a spectator', () => {
    const host = session('p0');
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'reversi', name: 'Alice' });
    const code = host.client.joinedCode()!;
    handleMessage(manager, session('p1'), { t: 'lobby:join', code, name: 'Bob' });

    const spec = session('s0');
    handleMessage(manager, spec, { t: 'lobby:spectate', code });
    expect(spec.client.ofType('joined')[0]).toMatchObject({ seat: -1 });
    expect(manager.getRoom(code).spectators.size).toBe(1);
  });

  it('lists only open (non-full) rooms', () => {
    const host = session('p0');
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'reversi', name: 'Alice' });
    const code = host.client.joinedCode()!;
    handleMessage(manager, session('p1'), { t: 'lobby:join', code, name: 'Bob' });

    const onlooker = session('x');
    handleMessage(manager, onlooker, { t: 'lobby:list', gameId: 'reversi' });
    expect(onlooker.client.last().rooms).toEqual([]); // full room not listed
  });
});

describe('reversi permissions', () => {
  function startedRoom() {
    const host = session('p0');
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'reversi', name: 'Alice' });
    const code = host.client.joinedCode()!;
    const guest = session('p1');
    handleMessage(manager, guest, { t: 'lobby:join', code, name: 'Bob' });
    return { code, host, guest };
  }

  it('blocks spectators from making a move', () => {
    const { code } = startedRoom();
    const spec = session('s0');
    handleMessage(manager, spec, { t: 'lobby:spectate', code });
    handleMessage(manager, spec, { t: 'game', row: 2, col: 3 });
    expect(spec.client.last()).toMatchObject({ t: 'error', message: 'spectators cannot act' });
  });

  it('rejects a move from the player whose turn it is not', () => {
    const { guest } = startedRoom();
    handleMessage(manager, guest, { t: 'game', row: 2, col: 4 });
    expect(guest.client.last()).toMatchObject({ t: 'error' });
    expect(guest.client.last().message).toMatch(/action out of turn/);
  });
});

describe('reversi gameplay broadcast', () => {
  function startedRoom() {
    const host = session('p0');
    handleMessage(manager, host, { t: 'lobby:create', gameId: 'reversi', name: 'Alice' });
    const code = host.client.joinedCode()!;
    const guest = session('p1');
    handleMessage(manager, guest, { t: 'lobby:join', code, name: 'Bob' });
    // clear the join-time state messages so we can assert on the move broadcast
    host.client.sent.length = 0;
    guest.client.sent.length = 0;
    return { code, host, guest };
  }

  it('applies a legal move and broadcasts state to both players', () => {
    const { code, host, guest } = startedRoom();
    handleMessage(manager, host, { t: 'game', row: 2, col: 3 });

    const room = manager.getRoom(code);
    const board = (room.state as ReversiState).board;
    expect(board[2 * 8 + 3]).toBe('B');
    expect(board[3 * 8 + 3]).toBe('B'); // flipped
    expect(host.client.ofType('state')).toHaveLength(1);
    expect(guest.client.ofType('state')).toHaveLength(1);
  });

  it('switches the turn to the other player after a move', () => {
    const { code, host } = startedRoom();
    handleMessage(manager, host, { t: 'game', row: 2, col: 3 });
    expect(manager.getRoom(code).state.activeSeat).toBe(1);
  });

  it('also broadcasts to a spectator after a move', () => {
    const { code, host } = startedRoom();
    const spec = session('s0');
    handleMessage(manager, spec, { t: 'lobby:spectate', code });
    spec.client.sent.length = 0;
    handleMessage(manager, host, { t: 'game', row: 2, col: 3 });
    expect(spec.client.ofType('state')).toHaveLength(1);
    expect(spec.client.last().mySeat).toBe(-1);
  });

  it('restarts the game on request', () => {
    const { code, host } = startedRoom();
    const room = manager.getRoom(code);
    room.state.phase = 'done';
    handleMessage(manager, host, { t: 'restart' });
    expect(room.state.phase).toBe('playing');
    expect(room.state.activeSeat).toBe(0);
  });
});

describe('reversi reconnection', () => {
  it('reclaims a seat on reconnect', () => {
    const room = manager.createRoom('reversi');
    const client = fakeClient();
    room.addPlayer('p0', 'Alice', client);
    room.removePlayer('p0');
    const seat = room.addPlayer('p0', 'Alice', client);
    expect(seat).toBe(0);
    expect(room.state.players).toHaveLength(1);
  });
});
