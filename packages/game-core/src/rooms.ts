// Generic, engine-agnostic room management. A Room holds one engine game state
// plus the members (seated players, bots, and spectators) attached to it.
// RoomManager owns many rooms across many games, keyed by a short join code.
//
// No socket I/O lives here — the gateway wires sockets in and reads room data
// out. The one effect a Room performs is sending engine messages through its
// adapter (applyMessage), which is pure with respect to the outside world.

import crypto from 'node:crypto';
import { makeBot, botActionFor } from './bots.ts';
import { mintReconnectToken, verifyReconnectToken } from './reconnectToken.ts';
import { decideTimeout, windowDeadlineExpired } from './timers.ts';
import { validateOptions } from './options.ts';
import { pickQuickMatchRoom } from './matchmaking.ts';
import { hashState } from './observability.ts';
import type { EventStore } from './eventStore.ts';
import type {
  Adapter,
  AdapterTable,
  EngineState,
  GameMessage,
  Member,
  Outcome,
  Presence,
  RoomSnapshot,
  RoomSummary,
  SocketLike,
  Spectator,
  TickResult,
} from './types.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 ambiguity

// A bot-only (or fully empty) room is not deleted the instant its last human is
// reaped: it lingers for this window so a human who blips off the network for a
// few seconds can rejoin the same table instead of finding it gone.
export const ROOM_GRACE_MS = 15_000;

export function makeCode(taken: Map<string, unknown>): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) return code;
  }
}

type OnGameEnd = (outcome: Outcome) => void;
type OnGameStart = () => void;

// One game table. `adapter` is the per-game contract (see games.ts); `state` is
// whatever the engine's createGame(options) returned.
//
// Member kinds:
//   seated player — has a seat in engine state and (usually) a live socket.
//   bot           — has a seat in engine state, no socket; driven by the gateway.
//   spectator     — no seat; receives only the seatless public view (-1).
export class Room<TState extends EngineState> {
  code: string;
  gameId: string;
  adapter: Adapter<TState>;
  options: Record<string, unknown>;
  state: TState;
  members: Map<string, Member>;
  spectators: Map<string, Spectator>;
  host: string | null;
  locked: boolean;
  windowOpenedAt: number | null;
  createdAt: number;
  eventLog: RoomSnapshot<TState>['eventLog'];
  phaseEnteredAt: number | null;
  emptySince: number | null;
  _windowKey: string;
  _eventSeq: number;
  _gameStarted: boolean;
  _kicked: Set<string>;
  // Secret per-seat reconnect tokens, keyed by playerId. Never serialized into a
  // snapshot, never sent in any broadcast — only handed to the owning client.
  _tokens: Map<string, string>;
  _onGameEnd?: OnGameEnd;
  _onGameStart?: OnGameStart;

  // gameId is a constructor argument so a Room knows its game without a
  // post-construction monkey-patch. onGameEnd (optional): called with the
  // adapter's outcome when a message transitions the game into a terminal state.
  constructor(
    code: string,
    gameId: string,
    adapter: Adapter<TState>,
    onGameEnd?: OnGameEnd,
    options: Record<string, unknown> = {},
    onGameStart?: OnGameStart,
  ) {
    this.code = code;
    this.gameId = gameId;
    this.adapter = adapter;
    this.options = validateOptions(adapter.optionsSchema, options);
    this.state = adapter.engine.createGame(this.options) as TState;
    this.members = new Map();
    this.spectators = new Map();
    this.host = null;
    this.locked = false;
    this.windowOpenedAt = null;
    this._windowKey = '';
    this._onGameEnd = onGameEnd;
    this.createdAt = Date.now();
    this.eventLog = [];
    this._eventSeq = 0;
    this.phaseEnteredAt = null;
    this.emptySince = null;
    this._onGameStart = onGameStart;
    this._gameStarted = false;
    this._kicked = new Set();
    this._tokens = new Map();
  }

  get playerCount(): number {
    return this.state.players.length;
  }

  get isFull(): boolean {
    return this.playerCount >= this.adapter.maxPlayers;
  }

  get botSeats(): Set<number> {
    const seats = new Set<number>();
    for (const m of this.members.values()) {
      if (m.isBot) seats.add(m.seat);
    }
    return seats;
  }

  // Seats with a connected, recently-ponging human. Bots count as live (always
  // responsive); humans are live until the heartbeat reaps them.
  liveSeats(now: number, deadAfterMs: number): Set<number> {
    const seats = new Set<number>();
    for (const m of this.members.values()) {
      if (m.isSpectator) continue;
      if (m.isBot || now - m.lastPong < deadAfterMs) seats.add(m.seat);
    }
    return seats;
  }

  // Seat a player. The first human to join becomes the host. Throws (via the
  // engine) if the name is taken or the table is full. Returns the assigned seat.
  // Fires the adapter's autoStart when at capacity.
  addPlayer(
    playerId: string,
    name: string,
    client: SocketLike,
    { now = Date.now(), presentedToken = null }: { now?: number; presentedToken?: string | null } = {},
  ): number {
    if (this.locked && !this.state.players.some((p) => p.id === playerId)) {
      throw new Error('room locked');
    }
    // Reconnect: player already seated in engine state — restore the socket
    // reference only; engine state (including per-seat private state) is intact.
    const existing = this.state.players.find((p) => p.id === playerId);
    if (existing) {
      const stored = this._tokens.get(playerId) ?? null;
      if (stored != null) {
        // Require the secret before restoring the held seat.
        if (!verifyReconnectToken(stored, presentedToken)) {
          throw new Error('invalid reconnect token');
        }
      } else {
        // A snapshot-restored seat has no stored token (tokens are never
        // serialized). Adopt a fresh one so the seat is guarded from here on.
        this._tokens.set(playerId, mintReconnectToken());
      }
      this.members.set(playerId, {
        id: playerId, seat: existing.seat, client,
        isBot: false, isSpectator: false, lastPong: now, latencyMs: 0,
      });
      return existing.seat;
    }
    this.state = this.adapter.engine.addPlayer(this.state, { id: playerId, name });
    const seat = this.state.players.find((p) => p.id === playerId)!.seat;
    this.members.set(playerId, {
      id: playerId, seat, client,
      isBot: false, isSpectator: false, lastPong: now, latencyMs: 0,
    });
    // Mint the secret on the first seat this player takes in this room.
    this._tokens.set(playerId, mintReconnectToken());
    if (this.host === null) this.host = playerId;
    this._maybeAutoStart();
    return seat;
  }

  // The owning player's secret token, so the gateway can send it to that owner
  // only. Never broadcast this.
  tokenFor(playerId: string): string | null {
    return this._tokens.get(playerId) ?? null;
  }

  // Timing-safe guard required before any host action or seat-owning action.
  // Throws on a missing or mismatched token.
  assertOwner(playerId: string, presentedToken: string | null): void {
    const stored = this._tokens.get(playerId) ?? null;
    if (!verifyReconnectToken(stored, presentedToken)) {
      throw new Error('not authorized');
    }
  }

  // Seat a bot in the next open seat. No socket; the gateway drives its moves.
  addBot(index: number): number {
    const { id, name } = makeBot(index);
    this.state = this.adapter.engine.addPlayer(this.state, { id, name });
    const seat = this.state.players.find((p) => p.id === id)!.seat;
    this.members.set(id, {
      id, seat, client: null, isBot: true, isSpectator: false,
      lastPong: Infinity, latencyMs: 0,
    });
    this._maybeAutoStart();
    return seat;
  }

  // Fill every remaining open seat with bots, then start. Used by quick-match and
  // by the host's "start early" control so a quiet table is still playable.
  fillWithBots(): number {
    let added = 0;
    while (!this.isFull) {
      this.addBot(this.playerCount);
      added++;
    }
    return added;
  }

  // Attach a spectator (no seat). Keyed by an arbitrary client key so multiple
  // spectators on one room are tracked independently.
  addSpectator(clientKey: string, client: SocketLike, { now = Date.now() }: { now?: number } = {}): void {
    this.spectators.set(clientKey, { client, lastPong: now, latencyMs: 0 });
  }

  removeSpectator(clientKey: string): void {
    this.spectators.delete(clientKey);
  }

  // Free the seat through the engine so the engine stays the single source of
  // seat truth, then drop the member. A fake engine without removePlayer falls
  // back to a member-only drop.
  removePlayer(playerId: string): void {
    this._freeSeat(playerId);
    this.members.delete(playerId);
    this._tokens.delete(playerId);
  }

  // Host-only kick: mark the target kicked (so a lingering socket cannot act),
  // free their engine seat, and drop the member.
  kick(requesterId: string, targetId: string): void {
    this._assertHost(requesterId);
    if (targetId === this.host) throw new Error('cannot kick the host');
    this._kicked.add(targetId);
    this._freeSeat(targetId);
    this.members.delete(targetId);
    this._tokens.delete(targetId);
  }

  isKicked(playerId: string): boolean {
    return this._kicked.has(playerId);
  }

  _freeSeat(playerId: string): void {
    if (!this.state.players.some((p) => p.id === playerId)) return;
    if (this.adapter.engine.removePlayer) {
      this.state = this.adapter.engine.removePlayer(this.state, playerId);
    }
  }

  lock(requesterId: string, locked: boolean): void {
    this._assertHost(requesterId);
    this.locked = !!locked;
  }

  // Host starts before the table is full. Requires the adapter's minPlayers of
  // real members (humans + bots); fills the rest with bots, then starts.
  startEarly(requesterId: string): void {
    this._assertHost(requesterId);
    if (this.playerCount < this.adapter.minPlayers) {
      throw new Error('not enough players to start');
    }
    this.fillWithBots();
    this._maybeAutoStart();
  }

  _assertHost(requesterId: string): void {
    if (requesterId !== this.host) throw new Error('host only');
  }

  _maybeAutoStart(): void {
    if (this._gameStarted) return;
    const started = this.adapter.autoStart?.(this.state);
    if (started) {
      this.state = started;
      const now = Date.now();
      this.phaseEnteredAt = now;
      this._refreshTurnClock(now);
      if (this._onGameStart) this._onGameStart();
      this._gameStarted = true;
    }
  }

  // Only bots and spectators left → no live human; the room can be reaped.
  get isEmpty(): boolean {
    return this.members.size === 0 && this.spectators.size === 0;
  }

  get hasHumanMembers(): boolean {
    for (const m of this.members.values()) {
      if (!m.isBot) return true;
    }
    return false;
  }

  // Set or clear emptySince so reap can honor the grace window. A room is
  // reap-empty when it has no live human and no spectator (a bot-only table
  // counts as empty). emptySince marks when that first became true.
  markEmptyState(now: number): void {
    const empty = !this.hasHumanMembers && this.spectators.size === 0;
    if (empty) {
      if (this.emptySince == null) this.emptySince = now;
    } else {
      this.emptySince = null;
    }
  }

  // Route a game message through the adapter, mutating room state. Rejects a
  // kicked player before any mutation. When a message moves the game into a
  // terminal state, fire onGameEnd exactly once (edge-triggered).
  applyMessage(playerId: string, msg: GameMessage, { now = Date.now() }: { now?: number } = {}): void {
    if (this.isKicked(playerId)) throw new Error('player was kicked');
    if (this.adapter.anticheat) {
      const reason = this.adapter.anticheat(this.state, playerId, msg);
      if (reason) throw new Error(`anticheat: ${reason}`);
    }
    const before = this._onGameEnd && this.adapter.getOutcome
      ? this.adapter.getOutcome(this.state)
      : null;
    const phaseBefore = this.state.phase;
    this.state = this.adapter.onMessage(this.state, playerId, msg);
    const phaseAfter = this.state.phase;
    if (phaseAfter !== phaseBefore) this.phaseEnteredAt = now;
    this._refreshTurnClock(now);
    const entry = { seq: this._eventSeq++, ts: now, playerId, msg, stateHash: hashState(this.state) };
    this.eventLog.push(entry);
    if (this._onGameEnd && this.adapter.getOutcome) {
      const after = this.adapter.getOutcome(this.state);
      if (after && !before) this._onGameEnd(after);
    }
  }

  // The seats that owe a decision right now. A game with a multi-seat window
  // supplies pendingSeats; otherwise the window is the single active seat (empty
  // when no seat is active). This is what the turn clock and timers key on. An
  // adapter that exposes pendingSeats only for its multi-seat window (empty during
  // a normal turn) still falls back to the single active seat, so bots and turn
  // timeouts drive an ordinary turn.
  _pendingSeats(state: TState): Set<number> {
    if (this.adapter.pendingSeats) {
      const seats = this.adapter.pendingSeats(state).filter((s) => s >= 0);
      if (seats.length > 0) return new Set(seats);
    }
    const seat = this.adapter.activeSeat?.(state);
    return seat != null && seat >= 0 ? new Set([seat]) : new Set();
  }

  // Stable key for a pending-seat set so the clock resets only when the window
  // membership changes, not on every refresh.
  _windowSignature(seats: Set<number>): string {
    return [...seats].sort((a, b) => a - b).join(',');
  }

  // Keep windowOpenedAt across an activeSeat of -1: the clock is tied to the
  // pending-seat window, not a single seat. Start it when a non-empty window
  // opens; clear it when the window empties; reset it only when the window
  // membership (signature) changes, so each fresh window gets its own budget.
  _refreshTurnClock(now: number): void {
    const seats = this._pendingSeats(this.state);
    const key = this._windowSignature(seats);
    if (key !== this._windowKey) {
      this._windowKey = key;
      this.windowOpenedAt = seats.size > 0 ? now : null;
    }
  }

  // Record a pong from a member or spectator and update its latency.
  recordPong(clientKey: string, { now = Date.now(), sentAt }: { now?: number; sentAt?: number } = {}): void {
    const member = this.members.get(clientKey);
    const target: Member | Spectator | undefined = member ?? this.spectators.get(clientKey);
    if (!target) return;
    target.lastPong = now;
    if (sentAt != null) target.latencyMs = now - sentAt;
  }

  // One heartbeat tick of room logic (pure w.r.t. sockets — returns intents the
  // gateway executes). Reaps dead human members, then collects a bot move for
  // every pending bot seat and a timeout auto-action for every pending human seat
  // that has run out of time, plus a flag when the whole window has hit its hard
  // deadline and must be closed once.
  tick({ now = Date.now(), deadAfterMs, graceMs, forfeitMs }: {
    now?: number; deadAfterMs: number; graceMs: number; forfeitMs: number;
  }): TickResult {
    const reaped: string[] = [];
    for (const [id, m] of this.members) {
      if (m.isBot || m.isSpectator) continue;
      if (now - m.lastPong >= deadAfterMs) {
        this.members.delete(id);
        reaped.push(id);
      }
    }
    for (const [key, s] of this.spectators) {
      if (now - s.lastPong >= deadAfterMs) this.spectators.delete(key);
    }

    const pending = this._pendingSeats(this.state);
    const botSeats = this.botSeats;
    const humanPending = new Set([...pending].filter((s) => !botSeats.has(s)));
    const liveSeats = this.liveSeats(now, graceMs);

    const timeouts = decideTimeout(
      {
        state: this.state,
        adapter: this.adapter,
        windowOpenedAt: this.windowOpenedAt,
        liveSeats,
        pendingSeats: humanPending,
      },
      { now, graceMs, forfeitMs },
    );

    const botMsgs = botActionFor(this.state, this.adapter, botSeats, pending);

    const deadlineExpired =
      !!this.adapter.resolveWindow &&
      pending.size > 0 &&
      windowDeadlineExpired(this.windowOpenedAt, now, forfeitMs);

    return { reaped, timeouts, botMsgs, deadlineExpired };
  }

  // Close an expired multi-seat window once, at state level, instead of N
  // per-seat timeoutAction calls. Applies the adapter's resolveWindow and
  // refreshes the turn clock; the close is not attributed to any single seat.
  closeWindow(now: number = Date.now()): void {
    if (!this.adapter.resolveWindow) return;
    this.state = this.adapter.resolveWindow(this.state);
    this._refreshTurnClock(now);
  }

  // Public lobby view of this room.
  summary(): RoomSummary {
    return {
      code: this.code,
      players: this.playerCount,
      max: this.adapter.maxPlayers,
      locked: this.locked,
      host: this.host,
    };
  }

  // Per-seat public view for a member; spectators (and unknown ids) get the
  // seatless view (-1).
  viewFor(playerId: string): unknown {
    const member = this.members.get(playerId);
    const seat = member ? member.seat : -1;
    return this.adapter.engine.publicState(this.state, seat);
  }

  // Presence/latency snapshot the gateway can broadcast (drives presence dots).
  presence(): Presence[] {
    const out: Presence[] = [];
    for (const m of this.members.values()) {
      if (m.isSpectator) continue;
      out.push({ seat: m.seat, isBot: m.isBot, latencyMs: m.latencyMs });
    }
    return out;
  }

  // Serializable snapshot of the room for the persistence seam. Live socket
  // references are dropped; members keep only the durable seat/identity fields.
  snapshot(): RoomSnapshot<TState> {
    return {
      code: this.code,
      gameId: this.gameId,
      options: this.options,
      state: this.state,
      eventLog: this.eventLog,
      _eventSeq: this._eventSeq,
      host: this.host,
      locked: this.locked,
      windowOpenedAt: this.windowOpenedAt,
      _windowKey: this._windowKey,
      createdAt: this.createdAt,
      phaseEnteredAt: this.phaseEnteredAt,
      _gameStarted: this._gameStarted,
      members: [...this.members.entries()].map(([id, m]) => ({ id, seat: m.seat, isBot: m.isBot })),
    };
  }

  // Rebuild a Room from a snapshot. gameId is passed explicitly. Engine state is
  // restored verbatim; members come back without sockets (humans must reconnect).
  static fromSnapshot<TState extends EngineState>(
    snap: RoomSnapshot<TState>,
    gameId: string,
    adapter: Adapter<TState>,
    onGameEnd?: OnGameEnd,
    onGameStart?: OnGameStart,
  ): Room<TState> {
    const room = new Room<TState>(snap.code, gameId, adapter, onGameEnd, snap.options, onGameStart);
    room.state = snap.state;
    room.eventLog = snap.eventLog ?? [];
    room._eventSeq = snap._eventSeq ?? room.eventLog.length;
    room.host = snap.host;
    room.locked = snap.locked;
    room.windowOpenedAt = snap.windowOpenedAt ?? snap.turnStartedAt ?? null;
    room._windowKey = snap._windowKey ?? room._windowSignature(room._pendingSeats(room.state));
    room.createdAt = snap.createdAt;
    room.phaseEnteredAt = snap.phaseEnteredAt;
    room._gameStarted = snap._gameStarted;
    for (const m of snap.members ?? []) {
      room.members.set(m.id, {
        id: m.id, seat: m.seat, isBot: m.isBot,
        client: null, isSpectator: false, lastPong: Date.now(), latencyMs: 0,
      });
    }
    return room;
  }
}

// Flush a room's full event log to the durable, append-only store before the room
// is evicted, so a finished game's history survives reaping. The in-memory log is
// never truncated, so this preserves every event.
export async function reapRoom(room: Room<EngineState>, eventStore: EventStore): Promise<void> {
  for (const entry of room.eventLog) {
    await eventStore.append(room.gameId, {
      type: 'action',
      payload: { seq: entry.seq, playerId: entry.playerId, msg: entry.msg },
      stateHash: entry.stateHash,
    });
  }
}

export class RoomManager {
  adapters: AdapterTable;
  rooms: Map<string, Room<EngineState>>;
  eventStore?: EventStore;
  _onGameEnd?: (outcome: Outcome, ctx: { gameId: string; roomCode: string }) => void;
  _onGameStart?: (ctx: { gameId: string; roomCode: string }) => void;

  constructor(
    adapters: AdapterTable,
    { onGameEnd, onGameStart, eventStore }: {
      onGameEnd?: (outcome: Outcome, ctx: { gameId: string; roomCode: string }) => void;
      onGameStart?: (ctx: { gameId: string; roomCode: string }) => void;
      eventStore?: EventStore;
    } = {},
  ) {
    this.adapters = adapters;
    this.rooms = new Map();
    this.eventStore = eventStore;
    this._onGameEnd = onGameEnd;
    this._onGameStart = onGameStart;
  }

  createRoom(gameId: string, options: Record<string, unknown> = {}): Room<EngineState> {
    const adapter = this.adapters[gameId];
    if (!adapter) throw new Error(`unknown game: ${gameId}`);
    if (adapter.enabled === false) throw new Error(`game ${gameId} is disabled`);
    const code = makeCode(this.rooms);
    const cb = this._onGameEnd
      ? (outcome: Outcome) => this._onGameEnd!(outcome, { gameId, roomCode: code })
      : undefined;
    const startCb = this._onGameStart
      ? () => this._onGameStart!({ gameId, roomCode: code })
      : undefined;
    const room = new Room(code, gameId, adapter, cb, options, startCb);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): Room<EngineState> {
    const room = this.rooms.get(code);
    if (!room) throw new Error('room not found');
    return room;
  }

  // Re-seat a room from a persisted snapshot on startup. Skips unknown or
  // now-disabled games rather than reviving a room nobody can join.
  restoreRoom(snap: RoomSnapshot): void {
    const adapter = this.adapters[snap.gameId];
    if (!adapter || adapter.enabled === false) return;
    const cb = this._onGameEnd
      ? (outcome: Outcome) => this._onGameEnd!(outcome, { gameId: snap.gameId, roomCode: snap.code })
      : undefined;
    const startCb = this._onGameStart
      ? () => this._onGameStart!({ gameId: snap.gameId, roomCode: snap.code })
      : undefined;
    const room = Room.fromSnapshot(snap, snap.gameId, adapter, cb, startCb);
    this.rooms.set(snap.code, room);
  }

  // Open rooms (not full, not locked) for a given game, for the lobby list.
  listRooms(gameId: string): RoomSummary[] {
    const out: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (room.gameId === gameId && !room.isFull && !room.locked) {
        out.push(room.summary());
      }
    }
    return out;
  }

  deleteRoom(code: string): void {
    this.rooms.delete(code);
  }

  // Quick-match ("Play now"): pick the fullest open room for this game, or create
  // a fresh one when none is joinable.
  quickMatch(gameId: string, options: Record<string, unknown> = {}): Room<EngineState> {
    const open = this.listRooms(gameId);
    const code = pickQuickMatchRoom(open);
    return code ? this.getRoom(code) : this.createRoom(gameId, options);
  }

  // Empty-room garbage collection with a grace window: a room is only dropped
  // after it has been empty (no live humans, no spectators) for at least graceMs,
  // so a bot table survives a short blip and a reconnecting human finds it.
  reapEmptyRooms(now: number = Date.now(), graceMs: number = ROOM_GRACE_MS): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      room.markEmptyState(now);
      if (room.emptySince != null && now - room.emptySince >= graceMs) {
        if (this.eventStore && room.eventLog.length > 0) {
          void reapRoom(room, this.eventStore).catch(() => {});
        }
        this.rooms.delete(code);
        removed.push(code);
      }
    }
    return removed;
  }
}
