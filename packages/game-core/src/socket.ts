// Socket.IO transport for the game gateway. The 14 client message types map onto
// named Socket.IO events; every socket joins one room per game (game:CODE) and
// one per-player room (player:PLAYERID). The core dispatch (handleMessage) stays
// transport-agnostic — it depends only on the manager and the session — so it is
// unit-tested with a fake socket that captures emit calls.

import crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { RoomManager, Room } from './rooms.ts';
import { ROOM_GRACE_MS } from './rooms.ts';
import { sanitizeName } from '@portal/shared/sanitize';
import { PROTOCOL_VERSION } from '@portal/shared/version';
import { validateMessage } from '@portal/shared/validate';
import { TokenBucket } from '@portal/shared/rateLimit';
import { log } from './logger.ts';
import type { Logger } from './logger.ts';
import type {
  EngineState,
  InboundMessage,
  OutboundMessage,
  Outcome,
  Presence,
  SocketLike,
} from './types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isValidUUID(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

// One heartbeat clock drives everything: presence dots, latency, dead-socket
// reaping, and turn-timeout enforcement.
export interface HeartbeatOpts {
  DEAD_MS: number;
  GRACE_MS: number;
  FORFEIT_MS: number;
  ROOM_GRACE_MS?: number;
}

export const HEARTBEAT = {
  PING_MS: 5000,
  DEAD_MS: 15000,
  GRACE_MS: 10000,
  FORFEIT_MS: 60000,
};

export interface RateLimitConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

const RATE_LIMIT: RateLimitConfig = { capacity: 30, refillRate: 2, refillIntervalMs: 1000 };

// The whole e2e suite shares one long-lived gateway and one per-IP bucket, so a
// production-tight limit produces false "rate limit exceeded" failures under the
// suite's combined load. RATE_LIMIT_CAPACITY lets the test webServer widen it.
export function resolveRateLimit(): RateLimitConfig {
  const cap = Number(process.env.RATE_LIMIT_CAPACITY);
  return Number.isFinite(cap) && cap > 0 ? { ...RATE_LIMIT, capacity: cap } : RATE_LIMIT;
}

export function getRateBucket(map: Map<string, TokenBucket>, ip: string, cfg: RateLimitConfig): TokenBucket {
  let bucket = map.get(ip);
  if (!bucket) {
    bucket = new TokenBucket(cfg);
    map.set(ip, bucket);
  }
  return bucket;
}

function isOpen(client: SocketLike): boolean {
  return client != null && client.connected !== false;
}

// Per-connection session. Tracks which room (if any) this socket is in and
// whether it's a spectator. The playerId is supplied by the client (localStorage
// UUID) so a returning player keeps the same identity across reconnects.
export class Session {
  client: SocketLike;
  playerId: string;
  room: Room<EngineState> | null;
  spectator: boolean;

  constructor(client: SocketLike, playerId: string) {
    this.client = client;
    this.playerId = playerId;
    this.room = null;
    this.spectator = false;
  }

  // Emit a server->client frame as a named Socket.IO event carrying the frame.
  send(obj: OutboundMessage): void {
    this.client?.emit(obj.t, obj);
  }

  // Key used to find this connection in the room's member/spectator maps.
  get key(): string {
    return this.spectator ? `spec:${this.playerId}` : this.playerId;
  }
}

export interface LobbyHooks {
  onLobbyChange?(gameId: string): void;
  watchLobby?(session: Session, gameId: string): void;
}

// Broadcast the current per-seat state to every seated member and spectator.
// Each seat gets its own private view (effectively its player:PLAYERID room);
// spectators always get the seatless view.
export function broadcastRoom(room: Room<EngineState>): void {
  for (const { id, client, isBot } of room.members.values()) {
    if (isBot || !isOpen(client)) continue;
    client!.emit('state', {
      t: 'state',
      ...(room.viewFor(id) as object),
      presence: room.presence(),
      isHost: id === room.host,
    });
  }
  for (const { client } of room.spectators.values()) {
    if (!isOpen(client)) continue;
    client!.emit('state', {
      t: 'state',
      ...(room.adapter.engine.publicState(room.state, -1) as object),
      presence: room.presence() as Presence[],
      isHost: false,
    });
  }
}

// Broadcast a single shared chat payload to everyone in the room (members and
// spectators alike). Unlike broadcastRoom, the payload is identical for all.
export function broadcastChat(room: Room<EngineState>, msg: OutboundMessage): void {
  for (const { client, isBot } of room.members.values()) {
    if (isBot || !isOpen(client)) continue;
    client!.emit('chat', msg);
  }
  for (const { client } of room.spectators.values()) {
    if (isOpen(client)) client!.emit('chat', msg);
  }
}

function requireRoom(session: Session): Room<EngineState> {
  if (!session.room) throw new Error('not in a room');
  return session.room;
}

// Seat a player, join their Socket.IO rooms, and send joined + state.
function joinRoom(room: Room<EngineState>, session: Session, name: string): void {
  const seat = room.addPlayer(session.playerId, name, session.client);
  session.spectator = false;
  session.room = room;
  session.client?.join?.(`game:${room.code}`);
  session.client?.join?.(`player:${session.playerId}`);
  session.send({
    t: 'joined',
    code: room.code,
    seat,
    isHost: session.playerId === room.host,
    options: room.options,
    engineVersion: room.adapter.engineVersion,
  });
  broadcastRoom(room);
}

// Core dispatch. Transport-agnostic: depends only on the manager and the session.
// Exported for tests. Effects happen via session.send / broadcastRoom.
export function handleMessage(
  manager: RoomManager,
  session: Session,
  msg: InboundMessage,
  logger: Logger | null = null,
  hooks: LobbyHooks = {},
): void {
  const onLobbyChange = hooks.onLobbyChange ?? (() => {});
  try {
    switch (msg.t) {
      case 'lobby:list': {
        hooks.watchLobby?.(session, msg.gameId as string);
        session.send({ t: 'rooms', rooms: manager.listRooms(msg.gameId as string) });
        return;
      }
      case 'lobby:create': {
        const name = sanitizeName(msg.name);
        const room = manager.createRoom(msg.gameId as string, msg.options as Record<string, unknown>);
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:join': {
        const name = sanitizeName(msg.name);
        const room = manager.getRoom(msg.code as string);
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:quickmatch': {
        const name = sanitizeName(msg.name);
        const room = manager.quickMatch(msg.gameId as string, msg.options as Record<string, unknown>);
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:leave': {
        const room = session.room;
        if (!room) {
          session.send({ t: 'left' });
          return;
        }
        const gameId = room.gameId;
        if (session.spectator) room.removeSpectator(session.key);
        else room.removePlayer(session.playerId);
        session.client?.leave?.(`game:${room.code}`);
        session.client?.leave?.(`player:${session.playerId}`);
        session.room = null;
        session.spectator = false;
        if (room.isEmpty) manager.deleteRoom(room.code);
        else broadcastRoom(room);
        session.send({ t: 'left' });
        session.send({ t: 'rooms', rooms: manager.listRooms(gameId) });
        onLobbyChange(gameId);
        return;
      }
      case 'lobby:spectate': {
        const room = manager.getRoom(msg.code as string);
        session.spectator = true;
        session.room = room;
        room.addSpectator(session.key, session.client);
        session.client?.join?.(`game:${room.code}`);
        session.send({ t: 'joined', code: room.code, seat: -1, isHost: false, options: room.options });
        broadcastRoom(room);
        return;
      }
      case 'host:kick': {
        const room = requireRoom(session);
        room.kick(session.playerId, msg.targetId as string);
        broadcastRoom(room);
        onLobbyChange(room.gameId);
        return;
      }
      case 'host:lock': {
        const room = requireRoom(session);
        room.lock(session.playerId, msg.locked as boolean);
        broadcastRoom(room);
        onLobbyChange(room.gameId);
        return;
      }
      case 'host:start': {
        const room = requireRoom(session);
        room.startEarly(session.playerId);
        broadcastRoom(room);
        return;
      }
      case 'pong': {
        session.room?.recordPong(session.key, { sentAt: msg.sentAt as number });
        return;
      }
      case 'game': {
        if (session.spectator) throw new Error('spectators cannot act');
        const room = requireRoom(session);
        const schema = room.adapter.validGameMessages;
        if (schema) {
          const { ok, reason } = validateMessage(schema, msg) as { ok: boolean; reason?: string };
          if (!ok) throw new Error(`invalid message: ${reason}`);
        }
        room.applyMessage(session.playerId, msg);
        broadcastRoom(room);
        return;
      }
      case 'restart': {
        if (session.spectator) throw new Error('spectators cannot act');
        const room = requireRoom(session);
        room.applyMessage(session.playerId, { restart: true });
        broadcastRoom(room);
        return;
      }
      case 'chat': {
        const room = requireRoom(session);
        const player = room.state.players.find((p) => p.id === session.playerId);
        const name = player?.name ?? 'Player';
        const text = String(msg.text ?? '').slice(0, 200);
        if (!text) return;
        broadcastChat(room, { t: 'chat', from: session.playerId, name, text, ts: Date.now() });
        return;
      }
      case 'client:error': {
        const ctx: Record<string, unknown> = { playerId: session.playerId };
        if (session.room) { ctx.roomId = session.room.code; ctx.gameId = session.room.gameId; }
        (logger ?? log).error('client error', {
          ...ctx,
          message: String(msg.message ?? '').slice(0, 500),
          stack: String(msg.stack ?? '').slice(0, 2000),
        });
        return;
      }
      default:
        throw new Error(`unknown message: ${msg.t}`);
    }
  } catch (e) {
    const ctx: Record<string, unknown> = { playerId: session.playerId };
    if (session.room) { ctx.roomId = session.room.code; ctx.gameId = session.room.gameId; }
    (logger ?? log).error('message handling failed', { ...ctx, err: (e as Error).message });
    session.send({ t: 'error', message: (e as Error).message });
  }
}

// A socket dropped. Spectators leave immediately. A *seated* player is NOT
// removed here: their seat is held so a reconnect inside the grace window
// resumes cleanly. The heartbeat reaps the seat only after DEAD_MS.
export function leave(
  manager: RoomManager,
  session: Session,
  onLobbyChange: (gameId: string) => void = () => {},
): void {
  const room = session.room;
  if (!room) return;
  const gameId = room.gameId;
  if (session.spectator) {
    room.removeSpectator(session.key);
  } else {
    const member = room.members.get(session.playerId);
    if (member) member.client = null; // held seat, no live socket
  }
  if (room.isEmpty) manager.deleteRoom(room.code);
  else broadcastRoom(room);
  session.room = null;
  onLobbyChange(gameId);
}

// One pass of room maintenance, driven by the heartbeat. Applies bot moves and
// timeout auto-actions, then reaps rooms honoring the grace window.
export function runHeartbeat(
  manager: RoomManager,
  broadcast: (room: Room<EngineState>) => void,
  opts: HeartbeatOpts,
  now: number = Date.now(),
): void {
  for (const room of manager.rooms.values()) {
    const { reaped, timeout, botMsg, botSeat } = room.tick({
      now, deadAfterMs: opts.DEAD_MS, graceMs: opts.GRACE_MS, forfeitMs: opts.FORFEIT_MS,
    });
    let changed = reaped.length > 0;

    if (botMsg && botSeat != null) {
      const botId = room.state.players[botSeat]?.id;
      if (botId) {
        try {
          room.applyMessage(botId, botMsg, { now });
          changed = true;
        } catch (e) {
          log.error('bot move failed', { roomId: room.code, gameId: room.gameId, err: (e as Error).message });
        }
      }
    } else if (timeout) {
      const playerId = room.state.players[timeout.seat]?.id;
      if (playerId) {
        try {
          room.applyMessage(playerId, timeout.msg, { now });
          changed = true;
        } catch (e) {
          log.error('timeout action failed', { roomId: room.code, gameId: room.gameId, err: (e as Error).message });
        }
      }
    }

    if (changed) broadcast(room);
  }
  manager.reapEmptyRooms(now, opts.ROOM_GRACE_MS ?? ROOM_GRACE_MS);
}

export interface SocketDeps {
  manager: RoomManager;
  logger: Logger;
  lobbyHooks: LobbyHooks;
  unwatchLobby(session: Session): void;
  metrics: { msgCount: number; msgWindowStart: number; totalRoomsCreated: number; totalRoomsFinished: number };
  getFunnel(gid: string): { lobbyViews: number; roomsCreated: number; gamesStarted: number; gamesFinished: number };
  rateLimit: RateLimitConfig;
  rateLimitMap: Map<string, TokenBucket>;
  isDraining(): boolean;
}

const INBOUND_EVENTS = [
  'lobby:list', 'lobby:create', 'lobby:join', 'lobby:quickmatch', 'lobby:leave',
  'lobby:spectate', 'host:kick', 'host:lock', 'host:start', 'game', 'restart',
  'pong', 'chat', 'client:error',
] as const;

// Bind the 14 named events, join game:CODE and player:PLAYERID rooms, apply the
// per-IP token bucket and the protocol-version handshake.
export function registerSocketEvents(io: Server, deps: SocketDeps): void {
  const { manager, logger, lobbyHooks, metrics, getFunnel, rateLimit, rateLimitMap } = deps;

  io.on('connection', (socket: Socket) => {
    const clientId = socket.handshake.query.playerId;
    const playerId = isValidUUID(clientId) ? clientId : crypto.randomUUID();
    const session = new Session(socket as unknown as SocketLike, playerId);
    const remoteIp = socket.handshake.address ?? '?';

    // Version handshake: a client left open across a deploy compares this on
    // arrival and prompts a refresh instead of silently desyncing.
    session.send({ t: 'hello', protocolVersion: PROTOCOL_VERSION });

    const dispatch = (t: string, payload: Record<string, unknown> = {}) => {
      if (!getRateBucket(rateLimitMap, remoteIp, rateLimit).consume()) {
        session.send({ t: 'error', message: 'rate limit exceeded' });
        return;
      }
      const msg: InboundMessage = { t, ...payload };
      if (deps.isDraining() && (t === 'lobby:create' || t === 'lobby:quickmatch')) {
        session.send({ t: 'error', message: 'server is shutting down' });
        return;
      }
      if (t === 'game' || t === 'restart') metrics.msgCount++;
      if (t === 'lobby:list' && msg.gameId) getFunnel(msg.gameId as string).lobbyViews++;
      if (t === 'lobby:create' || t === 'lobby:quickmatch') {
        const prevSize = manager.rooms.size;
        handleMessage(manager, session, msg, logger, lobbyHooks);
        if (manager.rooms.size > prevSize && msg.gameId) {
          getFunnel(msg.gameId as string).roomsCreated++;
          metrics.totalRoomsCreated++;
        }
        return;
      }
      handleMessage(manager, session, msg, logger, lobbyHooks);
    };

    for (const event of INBOUND_EVENTS) {
      socket.on(event, (payload?: Record<string, unknown>) => dispatch(event, payload ?? {}));
    }

    socket.on('disconnect', () => {
      deps.unwatchLobby(session);
      leave(manager, session, lobbyHooks.onLobbyChange ?? (() => {}));
    });
  });
}

// Emit a stamped ping to every connected socket so clients can reply with a pong.
export function pingAll(io: Server): void {
  io.emit('ping', { t: 'ping', sentAt: Date.now() });
}

export type { Outcome };
