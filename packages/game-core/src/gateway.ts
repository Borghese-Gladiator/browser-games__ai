// Single gateway hosting every multiplayer game. Fastify serves the read-only
// HTTP surface and the built client; Socket.IO carries the game protocol. Clients
// connect once, then speak the 14 named events wired in socket.ts (mapped from the
// former t-tagged frames). The gateway owns the heartbeat clock, periodic
// snapshots, boot restore, and a graceful drain.

import fs from 'node:fs';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.ts';
import { adapters } from './games.ts';
import { OutcomeStore, AchievementStore, SnapshotStore } from './store.ts';
import { checkAchievements } from '@portal/shared/leaderboard';
import { log } from './logger.ts';
import {
  Session,
  HEARTBEAT,
  broadcastRoom,
  handleMessage,
  registerSocketEvents,
  resolveRateLimit,
  runHeartbeat,
  pingAll,
} from './socket.ts';
import type { LobbyHooks } from './socket.ts';
import { registerHttpRoutes, resolveStaticDir } from './http.ts';
import type { Funnel, Metrics } from './http.ts';
import { TokenBucket } from '@portal/shared/rateLimit';
import type { EngineState, Outcome } from './types.ts';
import type { Room } from './rooms.ts';

const SNAPSHOT_INTERVAL_MS = 60_000;

export interface GatewayOptions {
  port?: number;
  outcomesPath?: string;
  achievementsPath?: string;
  snapshotsPath?: string;
  staticDir?: string | null;
  manager?: RoomManager;
}

export interface Gateway {
  app: FastifyInstance;
  io: Server;
  shutdown(graceMs?: number): Promise<void>;
}

export function createGateway(opts: GatewayOptions = {}): Gateway {
  const {
    port = 3001,
    outcomesPath = './outcomes.json',
    achievementsPath = './achievements.json',
    snapshotsPath = './snapshots',
    staticDir = null,
  } = opts;

  const resolvedStaticDir = resolveStaticDir(staticDir);
  const outcomeStore = new OutcomeStore(outcomesPath);
  const achievementStore = new AchievementStore(achievementsPath);
  const snapshotStore = new SnapshotStore(snapshotsPath);

  const funnel: Record<string, Funnel> = {};
  function getFunnel(gid: string): Funnel {
    if (!funnel[gid]) funnel[gid] = { lobbyViews: 0, roomsCreated: 0, gamesStarted: 0, gamesFinished: 0 };
    return funnel[gid];
  }
  const metrics: Metrics = {
    msgCount: 0,
    msgWindowStart: Date.now(),
    totalRoomsCreated: 0,
    totalRoomsFinished: 0,
  };

  // The single framework-side hook every game flows through when it ends: persist
  // the outcome and record newly-unlocked achievements per player.
  function onGameEnd(outcome: Outcome, { gameId, roomCode }: { gameId: string; roomCode: string }): void {
    const record = outcomeStore.record({ gameId, roomCode, outcomes: outcome.outcomes });
    getFunnel(gameId).gamesFinished++;
    metrics.totalRoomsFinished++;
    log.info('game ended', { gameId, roomCode });
    const achievements = adapters[gameId]?.achievements ?? [];
    if (achievements.length === 0) return;
    for (const { playerId } of outcome.outcomes) {
      const playerRecords = outcomeStore.all().filter((r) => r.outcomes.some((o) => o.playerId === playerId));
      for (const achievementId of checkAchievements(achievements, playerId, record, playerRecords)) {
        achievementStore.record({ playerId, achievementId, gameId });
      }
    }
  }

  function onGameStart({ gameId, roomCode }: { gameId: string; roomCode: string }): void {
    getFunnel(gameId).gamesStarted++;
    log.info('game started', { gameId, roomCode });
  }

  const manager = opts.manager ?? new RoomManager(adapters, { onGameEnd, onGameStart });

  let draining = false;
  const rateLimitMap = new Map<string, TokenBucket>();
  const rateLimit = resolveRateLimit();

  // Lobby watchers: sessions that asked for a game's room list get pushed a fresh
  // `rooms` frame whenever that game's membership changes.
  const lobbyWatchers = new Map<string, Set<Session>>();
  function watchLobby(session: Session, gameId: string): void {
    if (!gameId) return;
    if (!lobbyWatchers.has(gameId)) lobbyWatchers.set(gameId, new Set());
    lobbyWatchers.get(gameId)!.add(session);
  }
  function unwatchLobby(session: Session): void {
    for (const set of lobbyWatchers.values()) set.delete(session);
  }
  function broadcastLobby(gameId: string): void {
    const watchers = lobbyWatchers.get(gameId);
    if (!watchers || watchers.size === 0) return;
    const rooms = manager.listRooms(gameId);
    for (const s of watchers) {
      if (s.client) s.send({ t: 'rooms', rooms });
      else watchers.delete(s);
    }
  }
  const lobbyHooks: LobbyHooks = { onLobbyChange: broadcastLobby, watchLobby };

  // Resume in-flight rooms persisted before the last shutdown/crash.
  for (const code of snapshotStore.list()) {
    try {
      manager.restoreRoom(snapshotStore.load(code));
      log.info('room restored', { roomCode: code });
    } catch (e) {
      log.error('snapshot restore failed', { roomCode: code, err: (e as Error).message });
      snapshotStore.delete(code);
    }
  }

  const app = Fastify();
  const io = new Server(app.server, { cors: { origin: '*' } });
  const startedAt = Date.now();

  registerHttpRoutes(app, { manager, outcomeStore, io, metrics, funnel, startedAt });

  if (resolvedStaticDir) {
    app.register(fastifyStatic, { root: resolvedStaticDir });
    // Unmatched paths fall back to the build's 404.html, mirroring the old server.
    app.setNotFoundHandler((_req, reply) => {
      const notFound = `${resolvedStaticDir}/404.html`;
      if (fs.existsSync(notFound)) {
        reply.code(404).header('Content-Type', 'text/html; charset=utf-8').send(fs.readFileSync(notFound));
      } else {
        reply.code(404).send({ error: 'not found' });
      }
    });
  }

  registerSocketEvents(io, {
    manager,
    logger: log,
    lobbyHooks,
    unwatchLobby,
    metrics,
    getFunnel,
    rateLimit,
    rateLimitMap,
    isDraining: () => draining,
  });

  app.listen({ port, host: '0.0.0.0' }).then(() => {
    log.info('gateway listening', { port });
    if (resolvedStaticDir) log.info('serving static client', { dir: resolvedStaticDir });
  }).catch((e) => {
    log.error('gateway listen failed', { err: (e as Error).message });
  });

  const broadcast = (room: Room<EngineState>) => broadcastRoom(room);

  // The single heartbeat clock: ping every socket, then run room maintenance.
  const heartbeat = setInterval(() => {
    pingAll(io);
    runHeartbeat(manager, broadcast, HEARTBEAT);
  }, HEARTBEAT.PING_MS);

  // Periodic persistence so a restart can resume active rooms.
  const snapshotTimer = setInterval(() => {
    for (const room of manager.rooms.values()) {
      try { snapshotStore.save(room.code, room.snapshot()); } catch {}
    }
  }, SNAPSHOT_INTERVAL_MS);

  // Graceful drain: stop accepting new joins, snapshot every active room, warn
  // clients a refresh is coming, then hard-close after the grace window.
  function shutdown(graceMs = 10_000): Promise<void> {
    draining = true;
    clearInterval(heartbeat);
    clearInterval(snapshotTimer);
    for (const room of manager.rooms.values()) {
      try { snapshotStore.save(room.code, room.snapshot()); } catch {}
    }
    io.emit('draining', { t: 'draining', resumeIn: graceMs });
    return new Promise((resolve) => {
      setTimeout(() => {
        io.close();
        app.close().finally(() => resolve());
      }, graceMs);
    });
  }

  return { app, io, shutdown };
}

export { RoomManager, adapters, handleMessage, runHeartbeat, Session, broadcastRoom };
