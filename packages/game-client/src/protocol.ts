// Typed client<->server protocol shared by the hook and the games. Each message
// is delivered as a named Socket.IO event whose name is the `t` tag; the payload
// is the rest of the frame. The reconnectToken appears only on the owner's
// `joined` frame and never in any per-seat public state.

export interface RoomSummary {
  code: string;
  players: number;
  max: number;
  locked: boolean;
  host: string | null;
}

// Per-seat presence dot data broadcast with state. Carries no secret.
export interface Presence {
  seat: number;
  isBot: boolean;
  latencyMs: number;
}

// Engine-agnostic per-seat public view surfaced to games. Game-specific fields
// arrive through the index signature.
export interface GameState {
  phase?: string;
  isHost?: boolean;
  activeSeat?: number;
  presence: Presence[];
  [k: string]: unknown;
}

export interface ChatMessage {
  t: 'chat';
  from: string;
  name: string;
  text: string;
  ts: number;
}

// Every server frame, discriminated by `t`.
export type ServerMessage =
  | { t: 'hello'; protocolVersion: string }
  | { t: 'rooms'; rooms: RoomSummary[] }
  | {
      t: 'joined';
      code: string;
      seat: number;
      isHost: boolean;
      options: Record<string, unknown>;
      reconnectToken?: string;
      engineVersion?: number;
    }
  | { t: 'left' }
  | ({ t: 'state' } & GameState)
  | ChatMessage
  | { t: 'ping'; sentAt: number }
  | { t: 'draining'; resumeIn: number }
  | { t: 'error'; message: string };

// Every outbound frame the hook can buffer or send.
export type ClientMessage =
  | { t: 'lobby:list'; gameId: string }
  | { t: 'lobby:create'; gameId: string; name: string; options?: Record<string, unknown> }
  | { t: 'lobby:join'; gameId: string; code: string; name: string }
  | { t: 'lobby:quickmatch'; gameId: string; name: string; options?: Record<string, unknown> }
  | { t: 'lobby:spectate'; gameId: string; code: string }
  | { t: 'lobby:leave' }
  | { t: 'host:kick'; targetId: string }
  | { t: 'host:lock'; locked: boolean }
  | { t: 'host:start' }
  | { t: 'game'; [k: string]: unknown }
  | { t: 'restart' }
  | { t: 'chat'; text: string }
  | { t: 'pong'; sentAt: number };

// Socket.IO handshake.auth shape the gateway reads for identity and seat restore.
export interface HandshakeAuth {
  playerId: string;
  reconnectToken?: string;
}
