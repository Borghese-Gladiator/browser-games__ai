// Single WebSocket gateway hosting every multiplayer game. Clients connect once,
// then speak a small protocol: lobby messages to create/list/join rooms, and
// game messages routed to the room's engine via its adapter.
//
// Protocol (client -> server):
//   { t: 'lobby:list',       gameId }
//   { t: 'lobby:create',     gameId, name, options? }
//   { t: 'lobby:join',       gameId, code, name }
//   { t: 'lobby:quickmatch', gameId, name, options? }   // "Play now"
//   { t: 'lobby:spectate',   gameId, code }             // watch, no seat
//   { t: 'lobby:leave' }                                // free seat, back to lobby
//   { t: 'host:kick',  targetId }                       // host only
//   { t: 'host:lock',  locked }                         // host only
//   { t: 'host:start' }                                 // host only, start early
//   { t: 'game',       ...gameMsg }                     // after joining a room
//   { t: 'restart' }                                    // new hand/deal, in-room
//   { t: 'pong',       sentAt }                          // heartbeat reply
//
// Server -> client:
//   { t: 'rooms',    rooms: [{code, players, max, locked, host}] }
//   { t: 'joined',   code, seat, isHost, options }       // seat -1 = spectator
//   { t: 'left' }                                         // ack of lobby:leave
//   { t: 'state',    ...publicState, presence, isHost }
//   { t: 'ping',     sentAt }                             // heartbeat
//   { t: 'error',    message }
//
// The connection-handling logic is split out as handleMessage so it can be unit
// tested with a fake client (anything with .send()).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';
import { adapters } from './games.js';
import { OutcomeStore, AchievementStore, SnapshotStore } from './store.js';
import { sanitizeName } from '@portal/shared/sanitize';
import { PROTOCOL_VERSION } from '@portal/shared/version';
import { validateMessage } from '@portal/shared/validate';
import { TokenBucket } from '@portal/shared/rateLimit';
import {
  computeBoard,
  matchHistory,
  headToHead,
  checkAchievements,
} from '@portal/shared/leaderboard';
import { log } from './logger.js';
import { isSlowGame, rollupMessagesPerSec } from '@portal/shared/metrics';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUUID(s) {
  return typeof s === 'string' && UUID_RE.test(s);
}

// One heartbeat clock drives everything: presence dots, latency, dead-socket
// reaping, and turn-timeout enforcement. PING_MS is how often we ping; a socket
// silent for DEAD_MS is reaped; GRACE_MS is how long a dark seated player's turn
// waits before auto-action; FORFEIT_MS is the hard cap even for present idlers.
const HEARTBEAT = {
  PING_MS: 5000,
  DEAD_MS: 15000,
  GRACE_MS: 10000,
  FORFEIT_MS: 60000,
};

const RATE_LIMIT = { capacity: 30, refillRate: 2, refillIntervalMs: 1000 };
// The whole e2e suite shares one long-lived gateway and one per-IP bucket, so a
// production-tight limit produces false "rate limit exceeded" failures under the
// suite's combined load. RATE_LIMIT_CAPACITY lets the test webServer widen it.
function resolveRateLimit() {
  const cap = Number(process.env.RATE_LIMIT_CAPACITY);
  return Number.isFinite(cap) && cap > 0 ? { ...RATE_LIMIT, capacity: cap } : RATE_LIMIT;
}
const SNAPSHOT_INTERVAL_MS = 60_000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Serve a file from the built client (dist/). Resolves the request path inside
// staticDir, rejecting any traversal that escapes the root. A request for a
// directory serves its index.html. Unmatched paths fall back to the 404.html
// the build copied from /public. Returns true if it sent a response.
function serveStatic(staticDir, pathname, res) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const resolved = path.resolve(staticDir, rel);
  if (resolved !== staticDir && !resolved.startsWith(staticDir + path.sep)) {
    res.statusCode = 403;
    res.end('forbidden');
    return true;
  }

  let filePath = resolved;
  let stat = null;
  try {
    stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stat = fs.statSync(filePath);
    }
  } catch {
    stat = null;
  }

  if (!stat) {
    const notFound = path.join(staticDir, '404.html');
    res.statusCode = 404;
    if (fs.existsSync(notFound)) {
      res.setHeader('Content-Type', CONTENT_TYPES['.html']);
      res.end(fs.readFileSync(notFound));
    } else {
      res.end('not found');
    }
    return true;
  }

  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath)] ?? 'application/octet-stream');
  res.end(fs.readFileSync(filePath));
  return true;
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

// Per-connection session. Tracks which room (if any) this socket is in and
// whether it's a spectator. The playerId is supplied by the client (localStorage
// UUID) so a returning player keeps the same identity across reconnects.
class Session {
  constructor(client, playerId) {
    this.client = client;
    this.playerId = playerId;
    this.room = null;
    this.spectator = false;
  }
  send(obj) {
    this.client.send(JSON.stringify(obj));
  }
  // Key used to find this connection in the room's member/spectator maps.
  get key() {
    return this.spectator ? `spec:${this.playerId}` : this.playerId;
  }
}

function isOpen(client) {
  return client && (client.readyState === undefined || client.readyState === 1);
}

// Broadcast the current per-seat state to every seated member and spectator.
// Spectators are keyed separately and always get the seatless view.
function broadcastRoom(room) {
  for (const { id, client, isBot } of room.members.values()) {
    if (isBot || !isOpen(client)) continue;
    client.send(
      JSON.stringify({
        t: 'state',
        ...room.viewFor(id),
        presence: room.presence(),
        isHost: id === room.host,
      }),
    );
  }
  for (const { client } of room.spectators.values()) {
    if (!isOpen(client)) continue;
    client.send(
      JSON.stringify({
        t: 'state',
        ...room.adapter.engine.publicState(room.state, -1),
        presence: room.presence(),
        isHost: false,
      }),
    );
  }
}

// Broadcast a single shared chat payload to everyone in the room (members and
// spectators alike). Unlike broadcastRoom, the payload is identical for all —
// chat has no per-seat view.
function broadcastChat(room, msg) {
  const raw = JSON.stringify(msg);
  for (const { client, isBot } of room.members.values()) {
    if (isBot || !isOpen(client)) continue;
    client.send(raw);
  }
  for (const { client } of room.spectators.values()) {
    if (isOpen(client)) client.send(raw);
  }
}

// Core dispatch. Pure-ish: depends only on the manager and the session. Exported
// for tests. Returns nothing; effects happen via session.send / broadcastRoom.
export function handleMessage(manager, session, msg, logger = null, hooks = {}) {
  const onLobbyChange = hooks.onLobbyChange ?? (() => {});
  try {
    switch (msg.t) {
      case 'lobby:list': {
        hooks.watchLobby?.(session, msg.gameId);
        session.send({ t: 'rooms', rooms: manager.listRooms(msg.gameId) });
        return;
      }
      case 'lobby:create': {
        const name = sanitizeName(msg.name); // throws → outer catch → error reply
        const room = manager.createRoom(msg.gameId, msg.options); // validateOptions may throw
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:join': {
        const name = sanitizeName(msg.name);
        const room = manager.getRoom(msg.code);
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:quickmatch': {
        const name = sanitizeName(msg.name);
        const room = manager.quickMatch(msg.gameId, msg.options);
        joinRoom(room, session, name);
        onLobbyChange(room.gameId);
        return;
      }
      case 'lobby:leave': {
        // Explicit "back to lobby": unlike a socket close (which holds the seat
        // for the reconnect grace window), this frees the seat now so the room
        // opens up immediately, then re-sends this player the fresh room list.
        const room = session.room;
        if (!room) {
          session.send({ t: 'left' });
          return;
        }
        const gameId = room.gameId;
        if (session.spectator) room.removeSpectator(session.key);
        else room.removePlayer(session.playerId);
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
        const room = manager.getRoom(msg.code);
        session.spectator = true;
        session.room = room;
        room.addSpectator(session.key, session.client);
        session.send({ t: 'joined', code: room.code, seat: -1, isHost: false, options: room.options });
        broadcastRoom(room);
        return;
      }
      case 'host:kick': {
        requireRoom(session).kick(session.playerId, msg.targetId);
        broadcastRoom(session.room);
        onLobbyChange(session.room.gameId);
        return;
      }
      case 'host:lock': {
        requireRoom(session).lock(session.playerId, msg.locked);
        broadcastRoom(session.room);
        onLobbyChange(session.room.gameId);
        return;
      }
      case 'host:start': {
        requireRoom(session).startEarly(session.playerId);
        broadcastRoom(session.room);
        return;
      }
      case 'pong': {
        session.room?.recordPong(session.key, { sentAt: msg.sentAt });
        return;
      }
      case 'game': {
        if (session.spectator) throw new Error('spectators cannot act');
        const room = requireRoom(session);
        const schema = room.adapter.validGameMessages;
        if (schema) {
          const { ok, reason } = validateMessage(schema, msg);
          if (!ok) throw new Error(`invalid message: ${reason}`);
        }
        room.applyMessage(session.playerId, msg);
        broadcastRoom(session.room);
        return;
      }
      case 'restart': {
        if (session.spectator) throw new Error('spectators cannot act');
        requireRoom(session).applyMessage(session.playerId, { restart: true });
        broadcastRoom(session.room);
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
        const ctx = { playerId: session.playerId };
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
    const ctx = { playerId: session.playerId };
    if (session.room) { ctx.roomId = session.room.code; ctx.gameId = session.room.gameId; }
    (logger ?? log).error('message handling failed', { ...ctx, err: e.message });
    session.send({ t: 'error', message: e.message });
  }
}

function requireRoom(session) {
  if (!session.room) throw new Error('not in a room');
  return session.room;
}

function joinRoom(room, session, name) {
  const seat = room.addPlayer(session.playerId, name, session.client);
  session.spectator = false;
  session.room = room;
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

export function createGateway({
  port = 3001,
  outcomesPath = './outcomes.json',
  achievementsPath = './achievements.json',
  snapshotsPath = './snapshots',
  staticDir = null,
  manager,
} = {}) {
  const resolvedStaticDir = staticDir ? path.resolve(staticDir) : null;
  const outcomeStore = new OutcomeStore(outcomesPath);
  const achievementStore = new AchievementStore(achievementsPath);

  const funnel = {};
  function getFunnel(gid) {
    if (!funnel[gid]) funnel[gid] = { lobbyViews: 0, roomsCreated: 0, gamesStarted: 0, gamesFinished: 0 };
    return funnel[gid];
  }
  let totalRoomsCreated = 0;
  let totalRoomsFinished = 0;
  let msgCount = 0;
  let msgWindowStart = Date.now();

  // The single framework-side hook every game flows through when it ends. The
  // adapter declared the scoring (outcome) and any achievement predicates; here
  // we persist the outcome and record newly-unlocked achievements per player.
  function onGameEnd(outcome, { gameId, roomCode }) {
    const record = outcomeStore.record({ gameId, roomCode, outcomes: outcome.outcomes });
    getFunnel(gameId).gamesFinished++;
    totalRoomsFinished++;
    log.info('game ended', { gameId, roomCode });
    const achievements = adapters[gameId]?.achievements ?? [];
    if (achievements.length === 0) return;
    for (const { playerId } of outcome.outcomes) {
      const playerRecords = outcomeStore
        .all()
        .filter((r) => r.outcomes.some((o) => o.playerId === playerId));
      for (const achievementId of checkAchievements(achievements, playerId, record, playerRecords)) {
        achievementStore.record({ playerId, achievementId, gameId });
      }
    }
  }

  function onGameStart({ gameId, roomCode }) {
    getFunnel(gameId).gamesStarted++;
    log.info('game started', { gameId, roomCode });
  }

  if (!manager) manager = new RoomManager(adapters, { onGameEnd, onGameStart });

  const snapshotStore = new SnapshotStore(snapshotsPath);
  let draining = false;
  const rateLimitMap = new Map();

  // Lobby watchers: sessions that have asked for a game's room list get pushed a
  // fresh `rooms` frame whenever that game's membership changes, so the open-room
  // list stays live instead of only updating on an explicit refresh.
  const lobbyWatchers = new Map(); // gameId -> Set<session>
  function watchLobby(session, gameId) {
    if (!gameId) return;
    if (!lobbyWatchers.has(gameId)) lobbyWatchers.set(gameId, new Set());
    lobbyWatchers.get(gameId).add(session);
  }
  function unwatchLobby(session) {
    for (const set of lobbyWatchers.values()) set.delete(session);
  }
  function broadcastLobby(gameId) {
    const watchers = lobbyWatchers.get(gameId);
    if (!watchers || watchers.size === 0) return;
    const frame = JSON.stringify({ t: 'rooms', rooms: manager.listRooms(gameId) });
    for (const s of watchers) {
      if (isOpen(s.client)) s.client.send(frame);
      else watchers.delete(s);
    }
  }
  const lobbyHooks = { onLobbyChange: broadcastLobby, watchLobby };
  const rateLimit = resolveRateLimit();
  function getRateBucket(ip) {
    if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, new TokenBucket(rateLimit));
    return rateLimitMap.get(ip);
  }

  // Resume in-flight rooms persisted before the last shutdown/crash.
  for (const code of snapshotStore.list()) {
    try {
      manager.restoreRoom(snapshotStore.load(code));
      log.info('room restored', { roomCode: code });
    } catch (e) {
      log.error('snapshot restore failed', { roomCode: code, err: e.message });
      snapshotStore.delete(code);
    }
  }

  // Read-only HTTP surface for leaderboards / history / head-to-head, served on
  // the same port as the WebSocket gateway. All views derive from outcomeStore.
  function handleHttp(req, res) {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (url.pathname === '/admin') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(ADMIN_HTML);
      return;
    }

    if (url.pathname === '/stats') {
      res.setHeader('Content-Type', 'application/json');
      const now = Date.now();
      const mps = rollupMessagesPerSec(msgCount, now - msgWindowStart);
      msgCount = 0;
      msgWindowStart = now;
      let seated = 0, spectating = 0;
      const roomsByGame = {};
      const roomList = [];
      for (const room of manager.rooms.values()) {
        const gid = room.gameId;
        roomsByGame[gid] = (roomsByGame[gid] ?? 0) + 1;
        seated += room.members.size;
        spectating += room.spectators.size;
        let totalLat = 0, latCount = 0;
        for (const m of room.members.values()) {
          if (!m.isBot) { totalLat += m.latencyMs; latCount++; }
        }
        roomList.push({
          code: room.code,
          gameId: gid,
          memberCount: room.members.size,
          spectatorCount: room.spectators.size,
          phase: room.state?.phase ?? null,
          ageMs: now - room.createdAt,
          avgLatencyMs: latCount > 0 ? Math.round(totalLat / latCount) : 0,
          slowGame: isSlowGame(room.phaseEnteredAt, now),
          eventLogSize: room.eventLog.length,
          lastEvent: room.eventLog[room.eventLog.length - 1] ?? null,
        });
      }
      res.end(JSON.stringify({
        activeConnections: wss.clients.size,
        roomsByGame,
        seated,
        spectating,
        messagesPerSec: mps,
        roomsCreated: totalRoomsCreated,
        roomsFinished: totalRoomsFinished,
        funnelByGame: funnel,
        rooms: roomList,
      }));
      return;
    }

    const records = outcomeStore.all();
    if (url.pathname === '/api/leaderboard') {
      res.setHeader('Content-Type', 'application/json');
      const entries = computeBoard(records, {
        gameId: url.searchParams.get('gameId') || undefined,
        roomCode: url.searchParams.get('roomCode') || undefined,
        window: url.searchParams.get('window') || 'all-time',
      });
      res.end(JSON.stringify({ entries }));
    } else if (url.pathname === '/api/history') {
      res.setHeader('Content-Type', 'application/json');
      const playerId = url.searchParams.get('playerId');
      res.end(JSON.stringify({ games: matchHistory(records, playerId) }));
    } else if (url.pathname === '/api/h2h') {
      res.setHeader('Content-Type', 'application/json');
      const stats = headToHead(
        records,
        url.searchParams.get('playerA'),
        url.searchParams.get('playerB'),
      );
      res.end(JSON.stringify(stats));
    } else if (resolvedStaticDir) {
      serveStatic(resolvedStaticDir, url.pathname, res);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    }
  }

  const httpServer = createServer(handleHttp);
  const wss = new WebSocketServer({ server: httpServer });
  httpServer.listen(port);
  console.log(`Game gateway listening on :${port}`);
  if (resolvedStaticDir) console.log(`Serving static client from ${resolvedStaticDir}`);

  wss.on('connection', (ws, req) => {
    const params = new URL(req.url, 'http://localhost').searchParams;
    const clientId = params.get('playerId');
    const playerId = isValidUUID(clientId) ? clientId : crypto.randomUUID();
    const session = new Session(ws, playerId);
    const remoteIp = req.socket.remoteAddress ?? '?';
    // Version handshake: a client left open across a deploy compares this on
    // arrival and prompts a refresh instead of silently desyncing.
    session.send({ t: 'hello', protocolVersion: PROTOCOL_VERSION });
    ws.on('message', (raw) => {
      if (!getRateBucket(remoteIp).consume()) {
        session.send({ t: 'error', message: 'rate limit exceeded' });
        return;
      }
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (draining && (msg.t === 'lobby:create' || msg.t === 'lobby:quickmatch')) {
        session.send({ t: 'error', message: 'server is shutting down' });
        return;
      }
      // Funnel and message-rate accounting happen here so handleMessage stays stateless.
      if (msg.t === 'game' || msg.t === 'restart') msgCount++;
      if (msg.t === 'lobby:list' && msg.gameId) getFunnel(msg.gameId).lobbyViews++;
      if (msg.t === 'lobby:create' || msg.t === 'lobby:quickmatch') {
        const prevSize = manager.rooms.size;
        handleMessage(manager, session, msg, log, lobbyHooks);
        if (manager.rooms.size > prevSize && msg.gameId) {
          getFunnel(msg.gameId).roomsCreated++;
          totalRoomsCreated++;
        }
        return;
      }
      handleMessage(manager, session, msg, log, lobbyHooks);
    });
    ws.on('close', () => {
      unwatchLobby(session);
      leave(manager, session, broadcastLobby);
    });
    ws.on('error', () => {
      unwatchLobby(session);
      leave(manager, session, broadcastLobby);
    });
  });

  // The single heartbeat clock. Each tick pings every connected socket and runs
  // room-level reaping / bot moves / turn-timeout enforcement.
  const heartbeat = setInterval(() => {
    pingAll(wss);
    runHeartbeat(manager, broadcastRoom, HEARTBEAT);
  }, HEARTBEAT.PING_MS);
  wss.on('close', () => clearInterval(heartbeat));

  // Periodic persistence so a restart can resume active rooms.
  const snapshotTimer = setInterval(() => {
    for (const room of manager.rooms.values()) {
      try { snapshotStore.save(room.code, room.snapshot()); } catch {}
    }
  }, SNAPSHOT_INTERVAL_MS);
  wss.on('close', () => clearInterval(snapshotTimer));

  // Graceful drain: stop accepting new joins, snapshot every active room, tell
  // clients a refresh is coming, then hard-close after the grace window.
  function shutdown(graceMs = 10_000) {
    draining = true;
    clearInterval(heartbeat);
    clearInterval(snapshotTimer);
    for (const room of manager.rooms.values()) {
      try { snapshotStore.save(room.code, room.snapshot()); } catch {}
    }
    const notice = JSON.stringify({ t: 'draining', resumeIn: graceMs });
    for (const ws of wss.clients) if (isOpen(ws)) ws.send(notice);
    httpServer.close();
    return new Promise((resolve) => setTimeout(() => {
      for (const ws of wss.clients) ws.terminate();
      resolve();
    }, graceMs));
  }

  return { wss, shutdown };
}

// Ping every open socket so clients can reply with a pong; the sentAt stamp lets
// the room compute round-trip latency.
function pingAll(wss) {
  const ping = JSON.stringify({ t: 'ping', sentAt: Date.now() });
  for (const ws of wss.clients) {
    if (isOpen(ws)) ws.send(ping);
  }
}

// One pass of room maintenance, driven by the heartbeat. Exported and parameterized
// over `broadcast` and the timing opts so it can be unit/integration tested with a
// fake clock. Applies bot moves and timeout auto-actions, then GCs empty rooms.
export function runHeartbeat(manager, broadcast, opts, now = Date.now()) {
  for (const room of manager.rooms.values()) {
    const { reaped, timeout, botMsg, botSeat } = room.tick({ now, ...opts });
    let changed = reaped.length > 0;

    if (botMsg) {
      const botId = room.state.players[botSeat]?.id;
      if (botId) {
        try {
          room.applyMessage(botId, botMsg, { now });
          changed = true;
        } catch (e) {
          log.error('bot move failed', { roomId: room.code, gameId: room.gameId, err: e.message });
        }
      }
    } else if (timeout) {
      // Auto-act for the dark/idle seat so the game cannot stall. The engine
      // attributes the action to that seat's playerId.
      const playerId = room.state.players[timeout.seat]?.id;
      if (playerId) {
        try {
          room.applyMessage(playerId, timeout.msg, { now });
          changed = true;
        } catch (e) {
          log.error('timeout action failed', { roomId: room.code, gameId: room.gameId, err: e.message });
        }
      }
    }

    if (changed) broadcast(room);
  }
  manager.reapEmptyRooms();
}

// A socket dropped. Spectators leave immediately. A *seated* player is NOT
// removed here: their seat is held so a reconnect inside the grace window
// resumes cleanly. The heartbeat reaps the seat only after the socket has been
// silent past DEAD_MS, and the turn timer auto-acts for them meanwhile so the
// game never stalls. We just mark the socket closed so presence reflects it.
function leave(manager, session, onLobbyChange = () => {}) {
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

export { RoomManager, adapters };
