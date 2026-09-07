import type { MessageSchema } from '@portal/shared/validate';
import type { Achievement } from '@portal/shared/leaderboard';
import type { OptionsSchema, OptionsBag } from './options.ts';

export type GameMessage = Record<string, unknown>;

export interface EnginePlayer {
  id: string;
  seat: number;
  name?: string;
}

export interface EngineState {
  players: EnginePlayer[];
  phase?: string;
  activeSeat?: number;
}

export interface SeatInit {
  id: string;
  name: string;
}

export interface GameEngine<TState extends EngineState> {
  createGame(options?: OptionsBag): TState;
  addPlayer(state: TState, player: SeatInit): TState;
  removePlayer?(state: TState, playerId: string): TState;
  publicState(state: TState, forSeat: number): unknown;
}

export interface PlayerOutcome {
  playerId: string;
  rank: number;
  score: number;
  meta: Record<string, unknown>;
}

export interface Outcome {
  outcomes: PlayerOutcome[];
}

export interface Adapter<TState extends EngineState> {
  id?: string;
  engine: GameEngine<TState>;
  engineVersion?: string;
  enabled?: boolean;
  minPlayers: number;
  maxPlayers: number;
  validGameMessages?: MessageSchema;
  anticheat?(state: TState, playerId: string, msg: GameMessage): string | null;
  autoStart?(state: TState): TState | null;
  onMessage(state: TState, playerId: string, msg: GameMessage): TState;
  getOutcome?(state: TState): Outcome | null;
  achievements?: Achievement[];
  optionsSchema?: OptionsSchema;
  activeSeat?(state: TState): number;
  pendingSeats?(state: TState): number[];
  timeoutAction?(state: TState, seat: number): GameMessage | null;
  resolveWindow?(state: TState): TState;
  botMove?(state: TState, seat: number): GameMessage | null;
}

export type AdapterTable = Record<string, Adapter<EngineState>>;

// Minimal transport shape so tests inject a fake socket. `emit` matches the
// Socket.IO socket surface; `join` lets the gateway put a socket into its
// game:CODE and player:PLAYERID rooms. A null client means a held seat with no
// live socket.
export type SocketLike = {
  emit(event: string, payload: unknown): void;
  join?(room: string): void;
  leave?(room: string): void;
  connected?: boolean;
  readyState?: number;
} | null;

export type OutboundMessage = { t: string; [k: string]: unknown };
export type InboundMessage = { t: string; [k: string]: unknown };

export interface Member {
  id: string;
  seat: number;
  client: SocketLike;
  isBot: boolean;
  isSpectator: boolean;
  lastPong: number;
  latencyMs: number;
}

export interface Spectator {
  client: SocketLike;
  lastPong: number;
  latencyMs: number;
}

export interface EventLogEntry {
  seq: number;
  ts: number;
  playerId: string;
  msg: GameMessage;
  stateHash: string;
}

export interface SnapshotMember {
  id: string;
  seat: number;
  isBot: boolean;
}

export interface RoomSnapshot<TState extends EngineState = EngineState> {
  code: string;
  gameId: string;
  options: OptionsBag;
  state: TState;
  eventLog: EventLogEntry[];
  _eventSeq: number;
  host: string | null;
  locked: boolean;
  windowOpenedAt?: number | null;
  _windowKey?: string;
  turnStartedAt?: number | null;
  _lastActiveSeat?: number | null;
  createdAt: number;
  phaseEnteredAt: number | null;
  _gameStarted: boolean;
  members: SnapshotMember[];
}

export interface OutcomeRecord {
  id: string;
  gameId: string;
  roomCode: string;
  ts: number;
  outcomes: PlayerOutcome[];
}

export interface AchievementUnlock {
  playerId: string;
  achievementId: string;
  gameId: string;
  ts: number;
}

export interface RoomSummary {
  code: string;
  players: number;
  max: number;
  locked: boolean;
  host: string | null;
}

export interface Presence {
  seat: number;
  isBot: boolean;
  latencyMs: number;
}

export interface TimeoutIntent {
  seat: number;
  msg: GameMessage;
  reason: 'disconnect' | 'idle';
}

export interface BotIntent {
  seat: number;
  msg: GameMessage;
}

export interface TickResult {
  reaped: string[];
  timeouts: TimeoutIntent[];
  botMsgs: BotIntent[];
  deadlineExpired: boolean;
}
