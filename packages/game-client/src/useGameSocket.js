// Shared multiplayer client hook. Connects to the gateway over Socket.IO,
// exposes the lobby actions (create/join/list room) and a generic send() for
// in-room game messages, and surfaces the latest per-seat publicState.
//
// All games connect to the same gateway URL and identify themselves by gameId;
// the server routes by room code once joined. Each client message is a named
// Socket.IO event; each server frame arrives as a named event carrying the frame.
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useIdentity } from "./useIdentity.js";
import { nextDelay, shouldReconnect } from "./reconnect.js";
import { PROTOCOL_VERSION } from "@portal/shared/version";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "http://localhost:3001";

// Server -> client frames the hook reacts to, delivered as named Socket.IO events.
const SERVER_EVENTS = ["hello", "rooms", "joined", "state", "left", "chat", "ping", "error"];

export function useGameSocket(gameId) {
  const { playerId } = useIdentity();
  // 'connected' | 'reconnecting' | 'disconnected'; drives <ConnectionBanner>.
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null); // { code, seat, isHost, options } once joined
  const [gameState, setGameState] = useState(null); // includes presence, isHost
  const [chatMessages, setChatMessages] = useState([]);
  const [error, setError] = useState("");
  // Set when the server's protocolVersion differs from ours (deploy mismatch).
  const [needsRefresh, setNeedsRefresh] = useState(false);
  // Bumped on disconnect to re-run the connect effect (carrying the same playerId).
  const [retrySignal, setRetrySignal] = useState(0);
  const socketRef = useRef(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef(null);
  // The last room we successfully joined, so a fresh socket (StrictMode remount
  // or auto-reconnect) can re-bind its server-side session to our held seat. The
  // server keys the seat by playerId, so replaying the join is idempotent.
  const joinIntent = useRef(null);
  // Name used to enter a room. For create/quickmatch the room code is
  // server-assigned and only known once `joined` arrives, so we stash the name
  // here and finalize joinIntent there.
  const pendingName = useRef(null);
  // Outbound frames issued while the socket isn't connected yet are buffered here
  // and flushed on connect, so a send that races the connection isn't dropped.
  const outbox = useRef([]);

  const connected = connectionStatus === "connected";

  useEffect(() => {
    // Drive reconnection ourselves (reconnection: false) so the retry cadence
    // stays the shared nextDelay / shouldReconnect policy.
    const socket = io(GATEWAY_URL, {
      query: { playerId },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    socketRef.current = socket;

    const emit = (obj) => {
      const { t, ...rest } = obj;
      socket.emit(t, rest);
    };

    socket.on("connect", () => {
      setConnectionStatus("connected");
      reconnectAttempt.current = 0;
      // Re-establish room membership on the new connection. A reconnect lands on
      // a fresh server-side session with no room, so replay the join; the server
      // keys the seat by playerId, so replaying is an idempotent reconnect.
      if (joinIntent.current) emit(joinIntent.current);
      const queued = outbox.current;
      outbox.current = [];
      for (const obj of queued) emit(obj);
    });

    socket.on("disconnect", () => {
      if (socketRef.current !== socket) return;
      if (shouldReconnect(reconnectAttempt.current)) {
        setConnectionStatus("reconnecting");
        reconnectTimer.current = setTimeout(
          () => setRetrySignal((s) => s + 1),
          nextDelay(reconnectAttempt.current++),
        );
      } else {
        setConnectionStatus("disconnected");
      }
    });

    socket.on("hello", (msg) => {
      if (msg.protocolVersion !== PROTOCOL_VERSION) setNeedsRefresh(true);
    });
    socket.on("rooms", (msg) => setRooms(msg.rooms));
    socket.on("joined", (msg) => {
      setError("");
      setRoom({ code: msg.code, seat: msg.seat, isHost: msg.isHost, options: msg.options });
      // Record how to re-enter this exact room on a reconnect. A seated player
      // replays a join by the now-known code; the server restores the held seat.
      if (msg.seat !== -1 && pendingName.current != null) {
        joinIntent.current = { t: "lobby:join", gameId, code: msg.code, name: pendingName.current };
      }
    });
    socket.on("state", (msg) => {
      setError("");
      setGameState(msg);
    });
    socket.on("left", () => {
      joinIntent.current = null;
      pendingName.current = null;
      setRoom(null);
      setGameState(null);
      setChatMessages([]);
    });
    socket.on("chat", (msg) => setChatMessages((m) => [...m, msg]));
    // The one heartbeat the server drives; reply so it can measure latency and
    // know we're alive (so our seat isn't reaped / auto-folded).
    socket.on("ping", (msg) => socket.emit("pong", { sentAt: msg.sentAt }));
    socket.on("error", (msg) => setError(msg.message));

    function handleClientError(event) {
      if (socket.connected) {
        socket.emit("client:error", {
          message: String(event.message || event.reason || "").slice(0, 500),
          stack: event.error?.stack?.slice(0, 2000),
        });
      }
    }
    window.addEventListener("error", handleClientError);
    window.addEventListener("unhandledrejection", handleClientError);
    return () => {
      window.removeEventListener("error", handleClientError);
      window.removeEventListener("unhandledrejection", handleClientError);
      clearTimeout(reconnectTimer.current);
      for (const e of SERVER_EVENTS) socket.off(e);
      socket.disconnect();
    };
  }, [playerId, retrySignal]);

  const rawSend = useCallback((obj) => {
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

  const listRooms = useCallback(
    () => rawSend({ t: "lobby:list", gameId }),
    [rawSend, gameId],
  );
  const createRoom = useCallback(
    (name, options) => {
      pendingName.current = name;
      rawSend({ t: "lobby:create", gameId, name, options });
    },
    [rawSend, gameId],
  );
  const joinRoom = useCallback(
    (code, name) => {
      pendingName.current = name;
      rawSend({ t: "lobby:join", gameId, code, name });
    },
    [rawSend, gameId],
  );
  // Quick-match: drop into any open room or create one, filling with bots so a
  // quiet lobby is still playable.
  const quickMatch = useCallback(
    (name, options) => {
      pendingName.current = name;
      rawSend({ t: "lobby:quickmatch", gameId, name, options });
    },
    [rawSend, gameId],
  );
  const spectate = useCallback(
    (code) => {
      joinIntent.current = { t: "lobby:spectate", gameId, code };
      rawSend({ t: "lobby:spectate", gameId, code });
    },
    [rawSend, gameId],
  );
  // Explicit "back to lobby": ask the server to free our seat now. Local room
  // state is cleared when the server acks with `left`.
  const leaveRoom = useCallback(() => rawSend({ t: "lobby:leave" }), [rawSend]);

  // Host controls (no-ops server-side unless this player is the host).
  const kick = useCallback((targetId) => rawSend({ t: "host:kick", targetId }), [rawSend]);
  const lockRoom = useCallback((locked) => rawSend({ t: "host:lock", locked }), [rawSend]);
  const startEarly = useCallback(() => rawSend({ t: "host:start" }), [rawSend]);

  // In-room game message (engine payload), e.g. { action: {...} } or { cardId }.
  const send = useCallback((payload) => rawSend({ t: "game", ...payload }), [rawSend]);
  const restart = useCallback(() => rawSend({ t: "restart" }), [rawSend]);
  const sendChat = useCallback((text) => rawSend({ t: "chat", text }), [rawSend]);

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
