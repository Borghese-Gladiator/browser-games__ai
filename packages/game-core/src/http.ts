// Read-only HTTP surface for the gateway, served by Fastify on the same port as
// Socket.IO: /admin (live ops page), /stats (mutating metrics roll-up),
// /api/leaderboard, /api/history, /api/h2h, and a side-effect-free GET /healthz.

import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import { PROTOCOL_VERSION } from '@portal/shared/version';
import { isSlowGame, rollupMessagesPerSec } from '@portal/shared/metrics';
import { computeBoard, matchHistory, headToHead } from '@portal/shared/leaderboard';
import type { LeaderboardWindow } from '@portal/shared/leaderboard';
import type { RoomManager } from './rooms.ts';
import type { OutcomeStore } from './store.ts';
import type { EventStore } from './eventStore.ts';
import { reviewGame } from './review.ts';

// Only games with a replay driver can be reviewed. Keep this list beside the
// driver map in review.ts.
const REVIEWABLE_GAMES = new Set(['mahjong']);

export interface Metrics {
  msgCount: number;
  msgWindowStart: number;
  totalRoomsCreated: number;
  totalRoomsFinished: number;
}

export type Funnel = { lobbyViews: number; roomsCreated: number; gamesStarted: number; gamesFinished: number };

export interface HttpDeps {
  manager: RoomManager;
  outcomeStore: OutcomeStore;
  io: Server;
  metrics: Metrics;
  funnel: Record<string, Funnel>;
  startedAt: number;
  // Optional: when present, enables the post-game review endpoints. Absent in
  // lightweight test harnesses that only exercise health/stats.
  eventStore?: EventStore;
}

export interface HealthResponse {
  ok: true;
  protocolVersion: string;
  rooms: number;
  uptimeMs: number;
}

const ADMIN_HTML = `<!DOCTYPE html><html><head><title>Game Admin</title><meta charset="utf-8">
<style>body{font-family:monospace;padding:1rem}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:.4rem .8rem;text-align:left}th{background:#f0f0f0}
.slow{color:red;font-weight:bold}</style></head><body>
<h1>Live Ops</h1><div id="s"></div><h2>Active Rooms</h2>
<table id="t"><thead><tr><th>Code</th><th>Game</th><th>Members</th><th>Spec</th>
<th>Phase</th><th>Age</th><th>Avg ms</th><th>Events</th><th>Slow?</th></tr></thead>
<tbody></tbody></table>
<script>async function r(){const d=await fetch('/stats').then(r=>r.json());
document.getElementById('s').textContent='Connections: '+d.activeConnections+
' | msg/s: '+d.messagesPerSec+' | Created: '+d.roomsCreated+' | Finished: '+d.roomsFinished;
document.querySelector('#t tbody').innerHTML=d.rooms.map(r=>
'<tr><td>'+r.code+'</td><td>'+r.gameId+'</td><td>'+r.memberCount+'</td><td>'+
r.spectatorCount+'</td><td>'+(r.phase||'-')+'</td><td>'+Math.round(r.ageMs/1000)+
's</td><td>'+r.avgLatencyMs+'</td><td>'+r.eventLogSize+'</td><td class="'+
(r.slowGame?'slow':'')+'">'+( r.slowGame?'YES':'')+'</td></tr>').join('')}
r();setInterval(r,3000)</script></body></html>`;

// Side-effect-free health payload. Never touches the message-rate window, so a
// health probe cannot skew /stats' messagesPerSec.
export function buildHealth(deps: HttpDeps): HealthResponse {
  return {
    ok: true,
    protocolVersion: PROTOCOL_VERSION,
    rooms: deps.manager.rooms.size,
    uptimeMs: Date.now() - deps.startedAt,
  };
}

// Compute /stats and roll the message-rate window. This is the mutating path:
// it resets msgCount and msgWindowStart.
export function buildStats(deps: HttpDeps, now: number = Date.now()): Record<string, unknown> {
  const { manager, metrics, funnel, io } = deps;
  const mps = rollupMessagesPerSec(metrics.msgCount, now - metrics.msgWindowStart);
  metrics.msgCount = 0;
  metrics.msgWindowStart = now;

  let seated = 0;
  let spectating = 0;
  const roomsByGame: Record<string, number> = {};
  const roomList: Array<Record<string, unknown>> = [];
  for (const room of manager.rooms.values()) {
    const gid = room.gameId;
    roomsByGame[gid] = (roomsByGame[gid] ?? 0) + 1;
    seated += room.members.size;
    spectating += room.spectators.size;
    let totalLat = 0;
    let latCount = 0;
    for (const m of room.members.values()) {
      if (!m.isBot) { totalLat += m.latencyMs; latCount++; }
    }
    roomList.push({
      code: room.code,
      gameId: gid,
      memberCount: room.members.size,
      spectatorCount: room.spectators.size,
      phase: room.state.phase ?? null,
      ageMs: now - room.createdAt,
      avgLatencyMs: latCount > 0 ? Math.round(totalLat / latCount) : 0,
      slowGame: isSlowGame(room.phaseEnteredAt, now),
      eventLogSize: room.eventLog.length,
      lastEvent: room.eventLog[room.eventLog.length - 1] ?? null,
    });
  }

  return {
    activeConnections: io.engine?.clientsCount ?? 0,
    roomsByGame,
    seated,
    spectating,
    messagesPerSec: mps,
    roomsCreated: metrics.totalRoomsCreated,
    roomsFinished: metrics.totalRoomsFinished,
    funnelByGame: funnel,
    rooms: roomList,
  };
}

// Mount /admin, /stats, /api/leaderboard, /api/history, /api/h2h, and GET /healthz.
export function registerHttpRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.addHook('onSend', (_req, reply, payload, done) => {
    reply.header('Access-Control-Allow-Origin', '*');
    done(null, payload);
  });

  app.get('/healthz', async () => buildHealth(deps));

  app.get('/admin', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return ADMIN_HTML;
  });

  app.get('/stats', async () => buildStats(deps));

  app.get('/api/leaderboard', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const entries = computeBoard(deps.outcomeStore.all(), {
      gameId: q.gameId || undefined,
      roomCode: q.roomCode || undefined,
      window: (q.window as LeaderboardWindow) || 'all-time',
    });
    return { entries };
  });

  app.get('/api/history', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return { games: matchHistory(deps.outcomeStore.all(), q.playerId ?? '') };
  });

  app.get('/api/h2h', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return headToHead(deps.outcomeStore.all(), q.playerA ?? '', q.playerB ?? '');
  });

  // List finished games that can be reviewed (those whose game type has a replay
  // driver). Derived from the outcome log; roomCode is the review key.
  app.get('/api/reviews', async () => {
    const games = deps.outcomeStore
      .all()
      .filter((r) => REVIEWABLE_GAMES.has(r.gameId))
      .map((r) => ({ gameType: r.gameId, roomCode: r.roomCode, ts: r.ts }))
      .sort((a, b) => b.ts - a.ts);
    return { games };
  });

  // Replay one finished game and return the graded per-discard review.
  app.get('/api/review/:gameId', async (req, reply) => {
    if (!deps.eventStore) {
      reply.code(503);
      return { error: 'review store unavailable' };
    }
    const { gameId } = req.params as { gameId: string };
    try {
      return await reviewGame(gameId, 'mahjong', deps.eventStore);
    } catch (e) {
      reply.code(404);
      return { error: (e as Error).message };
    }
  });
}

// Resolve a static directory to an absolute path, or null when serving no client.
export function resolveStaticDir(staticDir: string | null): string | null {
  return staticDir ? path.resolve(staticDir) : null;
}
