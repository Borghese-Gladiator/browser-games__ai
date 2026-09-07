// The real, exported return type of useGameSocket. Games consume this to drop
// their `any` annotations.
import type { RoomSummary, GameState, ChatMessage } from './protocol.ts';

// Drives <ConnectionBanner>. A named union of the unchanged states.
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// Local room state after a successful join; seat -1 marks a spectator.
export interface JoinedRoom {
  code: string;
  seat: number;
  isHost: boolean;
  options: Record<string, unknown>;
}

export interface UseGameSocketApi {
  connected: boolean;
  connectionStatus: ConnectionStatus;
  rooms: RoomSummary[];
  room: JoinedRoom | null;
  gameState: GameState | null;
  chatMessages: ChatMessage[];
  sendChat(text: string): void;
  error: string;
  needsRefresh: boolean;
  listRooms(): void;
  createRoom(name: string, options?: Record<string, unknown>): void;
  joinRoom(code: string, name: string): void;
  quickMatch(name: string, options?: Record<string, unknown>): void;
  spectate(code: string): void;
  leaveRoom(): void;
  kick(targetId: string): void;
  lockRoom(locked: boolean): void;
  startEarly(): void;
  send(payload: Record<string, unknown>): void;
  restart(): void;
}
