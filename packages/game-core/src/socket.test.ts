import { describe, it, expect } from 'vitest';
import { broadcastRoom } from './socket.ts';
import { RoomManager } from './rooms.js';
import type { Adapter, EngineState, GameEngine } from './types.ts';

// Minimal engine: broadcastRoom only needs seats and a publicState.
const engine: GameEngine<EngineState> = {
  createGame: () => ({ players: [] }),
  addPlayer: (state, { id, name }) => ({
    ...state,
    players: [...state.players, { id, name, seat: state.players.length }],
  }),
  publicState: (state, seat) => ({ players: state.players, mySeat: seat }),
};

const adapter: Adapter<EngineState> = {
  engine,
  minPlayers: 2,
  maxPlayers: 4,
  autoStart: () => null,
  onMessage: (state) => state,
};

// Captures every frame a seat receives. Frames stay `unknown` so the
// assertions can use toMatchObject without narrowing the payload type.
function fakeClient() {
  const sent: unknown[] = [];
  return {
    sent,
    connected: true,
    emit(_event: string, payload: unknown): void {
      sent.push(payload);
    },
  };
}

function seatedRoom() {
  const room = new RoomManager({ test: adapter }).createRoom('test');
  const host = fakeClient();
  room.addPlayer('h', 'Host', host);
  return { room, host };
}

describe('broadcastRoom', () => {
  it('sends the room lock state so a board can render it', () => {
    // Without this the in-room UI cannot tell locked from unlocked: viewFor()
    // returns only the engine's public state, which has no notion of a lock.
    const { room, host } = seatedRoom();

    broadcastRoom(room);
    expect(host.sent.at(-1)).toMatchObject({ t: 'state', locked: false });

    room.lock('h', true);
    broadcastRoom(room);
    expect(host.sent.at(-1)).toMatchObject({ t: 'state', locked: true });
  });

  it('sends the lock state to spectators too', () => {
    const { room } = seatedRoom();
    const watcher = fakeClient();
    room.addSpectator('spec:w', watcher);
    room.lock('h', true);

    broadcastRoom(room);
    expect(watcher.sent.at(-1)).toMatchObject({ t: 'state', locked: true, isHost: false });
  });
});
