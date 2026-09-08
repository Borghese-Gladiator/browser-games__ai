// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// A capturing fake Socket.IO client. `io()` records the connect options and
// returns a socket whose event handlers the tests drive directly.
const h = vi.hoisted(() => {
  interface Emitted {
    event: string;
    payload: Record<string, unknown>;
  }
  class FakeSocket {
    connected = false;
    opts: Record<string, unknown>;
    handlers: Record<string, ((payload?: unknown) => void)[]> = {};
    emitted: Emitted[] = [];
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
    }
    on(event: string, cb: (payload?: unknown) => void) {
      (this.handlers[event] ??= []).push(cb);
      return this;
    }
    off() {
      return this;
    }
    emit(event: string, payload: Record<string, unknown> = {}) {
      this.emitted.push({ event, payload });
      return this;
    }
    disconnect() {
      this.connected = false;
    }
    fire(event: string, payload?: unknown) {
      for (const cb of this.handlers[event] ?? []) cb(payload);
    }
    open() {
      this.connected = true;
      this.fire('connect');
    }
  }
  const sockets: FakeSocket[] = [];
  const io = (_url: string, opts: Record<string, unknown>) => {
    const s = new FakeSocket(opts);
    sockets.push(s);
    return s;
  };
  return { sockets, io, FakeSocket };
});

vi.mock('socket.io-client', () => ({ io: h.io }));

import { useGameSocket } from './useGameSocket.ts';
import { mintReconnectToken, verifyReconnectToken } from '../../game-core/src/reconnectToken.ts';

const PLAYER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function currentSocket() {
  return h.sockets[h.sockets.length - 1];
}

beforeEach(() => {
  h.sockets.length = 0;
  localStorage.clear();
  localStorage.setItem('browser-games:playerId', PLAYER_ID);
});

describe('useGameSocket outbound queue', () => {
  it('buffers frames issued before connect and flushes them on connect', () => {
    const { result } = renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();
    expect(socket.connected).toBe(false);

    act(() => result.current.listRooms());
    // Nothing is sent while the socket is not connected.
    expect(socket.emitted).toHaveLength(0);

    act(() => socket.open());
    const lobbyList = socket.emitted.filter((e) => e.event === 'lobby:list');
    expect(lobbyList).toHaveLength(1);
    expect(lobbyList[0].payload).toMatchObject({ gameId: 'poker' });
  });

  it('de-dupes identical buffered frames so a reconnect burst is collapsed', () => {
    const { result } = renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();

    act(() => {
      result.current.listRooms();
      result.current.listRooms();
    });
    act(() => socket.open());
    expect(socket.emitted.filter((e) => e.event === 'lobby:list')).toHaveLength(1);
  });
});

describe('useGameSocket identity handshake', () => {
  it('connects with playerId and the persisted reconnectToken in the handshake auth', () => {
    localStorage.setItem('browser-games:reconnectToken', 'secret-token');
    renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();
    expect(socket.opts.auth).toEqual({ playerId: PLAYER_ID, reconnectToken: 'secret-token' });
  });

  it('persists the reconnectToken returned on the owner joined frame', () => {
    renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();
    act(() => socket.open());
    act(() =>
      socket.fire('joined', {
        t: 'joined',
        code: 'WXYZ',
        seat: 0,
        isHost: true,
        options: {},
        reconnectToken: 'minted-token',
      }),
    );
    expect(localStorage.getItem('browser-games:reconnectToken')).toBe('minted-token');
    expect(localStorage.getItem('browser-games:lastRoom')).toBe('WXYZ');
  });
});

describe('reconnectToken timing-safe comparison', () => {
  it('accepts an exact match and rejects a mismatch, wrong length, or null', () => {
    const token = mintReconnectToken();
    expect(verifyReconnectToken(token, token)).toBe(true);
    expect(verifyReconnectToken(token, mintReconnectToken())).toBe(false);
    expect(verifyReconnectToken('abcd', 'abcde')).toBe(false);
    expect(verifyReconnectToken(null, token)).toBe(false);
  });
});

describe('useGameSocket auto-rejoin', () => {
  it('rejoins the persisted room code on connect', () => {
    localStorage.setItem('browser-games:lastRoom', 'ABCD');
    localStorage.setItem('browser-games:reconnectToken', 'secret-token');
    localStorage.setItem('browser-games:playerName', 'Alice');
    renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();

    act(() => socket.open());
    const rejoin = socket.emitted.find((e) => e.event === 'lobby:join');
    expect(rejoin).toBeTruthy();
    expect(rejoin!.payload).toMatchObject({ gameId: 'poker', code: 'ABCD', name: 'Alice' });
  });

  it('does not rejoin when no room is persisted', () => {
    renderHook(() => useGameSocket('poker'));
    const socket = currentSocket();
    act(() => socket.open());
    expect(socket.emitted.some((e) => e.event === 'lobby:join')).toBe(false);
  });
});
