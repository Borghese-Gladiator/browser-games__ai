// Shared multiplayer client hook. Connects to the gateway over Socket.IO,
// exposes the lobby actions (create/join/list room) and a generic send() for
// in-room game messages, and surfaces the latest per-seat publicState.
//
// Identity travels in the handshake auth: the public playerId plus the secret
// reconnectToken. On connect the hook auto-rejoins the persisted room so a
// reload lands the player back in the same seat; the server verifies the token
// before it restores the seat and returns a fresh full snapshot. Outbound frames
// issued before the socket is connected are buffered, de-duped, and flushed on
// connect. A protocol-version mismatch raises the refresh banner.
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useIdentity } from './useIdentity.ts';
import { nextDelay, shouldReconnect } from './reconnect.ts';
import { PROTOCOL_VERSION } from '@portal/shared/version';
import type {
  ClientMessage,
  ServerMessage,
  RoomSummary,
  GameState,
  ChatMessage,
} from './protocol.ts';
import type { ConnectionStatus, JoinedRoom, UseGameSocketApi } from './useGameSocket.types.ts';

declare global {
  interface Window {
    __gameSocket?: Socket;
  }
}

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:3001';

// Server -> client frames the hook reacts to, delivered as named Socket.IO events.
const SERVER_EVENTS = ['hello', 'rooms', 'joined', 'state', 'left', 'chat', 'ping', 'error'] as const;

type JoinedMsg = Extract<ServerMessage, { t: 'joined' }>;
type HelloMsg = Extract<ServerMessage, { t: 'hello' }>;
type RoomsMsg = Extract<ServerMessage, { t: 'rooms' }>;
type StateMsg = { t: 'state' } & GameState;
type PingMsg = Extract<ServerMessage, { t: 'ping' }>;
type ErrorMsg = Extract<ServerMessage, { t: 'error' }>;

export function useGameSocket(gameId: string): UseGameSocketApi {
  const {
    playerId,
    reconnectToken,
    setReconnectToken,
    lastRoom,
    setLastRoom,
    name,
  } = useIdentity();
  // 'connected' | 'reconnecting' | 'disconnected'; drives <ConnectionBanner>.
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [room, setRoom] = useState<JoinedRoom | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState('');
  // Set when the server's protocolVersion differs from ours (deploy mismatch).
  const [needsRefresh, setNeedsRefresh] = useState(false);
  // Bumped on disconnect to re-run the connect effect (carrying the same playerId).
  const [retrySignal, setRetrySignal] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Outbound frames issued while the socket isn't connected yet are buffered here
  // and flushed on connect, so a send that races the connection isn't dropped.
  const outbox = useRef<ClientMessage[]>([]);

  // The connect effect only re-runs on [playerId, retrySignal], so read the
  // latest secret/room/name through refs kept current on every render.
  const reconnectTokenRef = useRef(reconnectToken);
  reconnectTokenRef.current = reconnectToken;
  const lastRoomRef = useRef(lastRoom);
  lastRoomRef.current = lastRoom;
  const nameRef = useRef(name);
  nameRef.current = name;

  const connected = connectionStatus === 'connected';

  useEffect(() => {
    // Drive reconnection ourselves (reconnection: false) so the retry cadence
    // stays the shared nextDelay / shouldReconnect policy.
    const socket = io(GATEWAY_URL, {
      auth: { playerId, reconnectToken: reconnectTokenRef.current ?? undefined },
      query: { playerId },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    socketRef.current = socket;
    // Dev/e2e affordance: expose the live Socket.IO socket so a test can drop the
    // connection deterministically via socket.disconnect() instead of racing a
    // raw-WebSocket close. Never present in a production build.
    if (import.meta.env.DEV) {
      window.__gameSocket = socket;
    }

    const emit = (obj: ClientMessage) => {
      const { t, ...rest } = obj;
      socket.emit(t, rest);
    };

    socket.on('connect', () => {
      setConnectionStatus('connected');
      reconnectAttempt.current = 0;
      // Auto-rejoin the persisted room. A fresh connection lands on a new
      // server-side session with no room; the server keys the seat by playerId
      // and verifies the reconnectToken from the handshake before restoring it,
      // then broadcasts a fresh full snapshot.
      if (lastRoomRef.current) {
        emit({ t: 'lobby:join', gameId, code: lastRoomRef.current, name: nameRef.current || 'Player' });
      }
      const queued = outbox.current;
      outbox.current = [];
      for (const obj of queued) emit(obj);
    });

    socket.on('disconnect', () => {
      if (socketRef.current !== socket) return;
      if (shouldReconnect(reconnectAttempt.current)) {
        setConnectionStatus('reconnecting');
        reconnectTimer.current = setTimeout(
          () => setRetrySignal((s) => s + 1),
          nextDelay(reconnectAttempt.current++),
        );
      } else {
        setConnectionStatus('disconnected');
      }
    });

    socket.on('hello', (msg: HelloMsg) => {
      if (msg.protocolVersion !== PROTOCOL_VERSION) setNeedsRefresh(true);
    });
    socket.on('rooms', (msg: RoomsMsg) => setRooms(msg.rooms));
    socket.on('joined', (msg: JoinedMsg) => {
      setError('');
      setRoom({ code: msg.code, seat: msg.seat, isHost: msg.isHost, options: msg.options });
      // Persist the secret the server minted/returned for our seat so the next
      // connection can present it, and remember the room so we auto-rejoin it.
      if (msg.reconnectToken) setReconnectToken(msg.reconnectToken);
      if (msg.seat !== -1) setLastRoom(msg.code);
    });
    socket.on('state', (msg: StateMsg) => {
      setError('');
      setGameState(msg);
    });
    socket.on('left', () => {
      setLastRoom(null);
      setRoom(null);
      setGameState(null);
      setChatMessages([]);
    });
    socket.on('chat', (msg: ChatMessage) => setChatMessages((m) => [...m, msg]));
    // The one heartbeat the server drives; reply so it can measure latency and
    // know we're alive (so our seat isn't reaped / auto-folded).
    socket.on('ping', (msg: PingMsg) => socket.emit('pong', { sentAt: msg.sentAt }));
    socket.on('error', (msg: ErrorMsg) => setError(msg.message));

    function handleClientError(event: ErrorEvent | PromiseRejectionEvent) {
      if (socket.connected) {
        const err = event as ErrorEvent & PromiseRejectionEvent;
        socket.emit('client:error', {
          message: String(err.message || err.reason || '').slice(0, 500),
          stack: (err.error as Error | undefined)?.stack?.slice(0, 2000),
        });
      }
    }
    window.addEventListener('error', handleClientError);
    window.addEventListener('unhandledrejection', handleClientError);
    return () => {
      window.removeEventListener('error', handleClientError);
      window.removeEventListener('unhandledrejection', handleClientError);
      clearTimeout(reconnectTimer.current);
      for (const e of SERVER_EVENTS) socket.off(e);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, retrySignal]);

  const rawSend = useCallback((obj: ClientMessage) => {
    const sock = socketRef.current;
    if (sock && sock.connected) {
      const { t, ...rest } = obj;
      sock.emit(t, rest);
      return;
    }
    // Buffer for the next connect. De-dupe identical frames so a StrictMode
    // remount / reconnect doesn't pile up repeat requests into a burst that
    // trips the rate limiter.
    const key = JSON.stringify(obj);
    if (!outbox.current.some((o) => JSON.stringify(o) === key)) outbox.current.push(obj);
  }, []);

  const listRooms = useCallback(() => rawSend({ t: 'lobby:list', gameId }), [rawSend, gameId]);
  const createRoom = useCallback(
    (playerName: string, options?: Record<string, unknown>) =>
      rawSend({ t: 'lobby:create', gameId, name: playerName, options }),
    [rawSend, gameId],
  );
  const joinRoom = useCallback(
    (code: string, playerName: string) => rawSend({ t: 'lobby:join', gameId, code, name: playerName }),
    [rawSend, gameId],
  );
  // Quick-match: drop into any open room or create one, filling with bots so a
  // quiet lobby is still playable.
  const quickMatch = useCallback(
    (playerName: string, options?: Record<string, unknown>) =>
      rawSend({ t: 'lobby:quickmatch', gameId, name: playerName, options }),
    [rawSend, gameId],
  );
  const spectate = useCallback(
    (code: string) => rawSend({ t: 'lobby:spectate', gameId, code }),
    [rawSend, gameId],
  );
  // Explicit "back to lobby": ask the server to free our seat now. Local room
  // state is cleared when the server acks with `left`.
  const leaveRoom = useCallback(() => rawSend({ t: 'lobby:leave' }), [rawSend]);

  // Host controls (rejected server-side unless this player owns the seat/host).
  const kick = useCallback((targetId: string) => rawSend({ t: 'host:kick', targetId }), [rawSend]);
  const lockRoom = useCallback((locked: boolean) => rawSend({ t: 'host:lock', locked }), [rawSend]);
  const startEarly = useCallback(() => rawSend({ t: 'host:start' }), [rawSend]);

  // In-room game message (engine payload), e.g. { action: {...} } or { cardId }.
  const send = useCallback(
    (payload: Record<string, unknown>) => rawSend({ t: 'game', ...payload }),
    [rawSend],
  );
  const restart = useCallback(() => rawSend({ t: 'restart' }), [rawSend]);
  const sendChat = useCallback((text: string) => rawSend({ t: 'chat', text }), [rawSend]);

  return {
    connected,
    connectionStatus,
    rooms,
    room,
    gameState,
    chatMessages,
    sendChat,
    error,
    needsRefresh,
    listRooms,
    createRoom,
    joinRoom,
    quickMatch,
    spectate,
    leaveRoom,
    kick,
    lockRoom,
    startEarly,
    send,
    restart,
  };
}
