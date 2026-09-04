// Shared multiplayer client hook. Connects to the gateway, exposes the lobby
// actions (create/join/list room) and a generic send() for in-room game
// messages, and surfaces the latest per-seat publicState.
//
// All games connect to the same gateway URL and identify themselves by gameId;
// the server routes by room code once joined.
import { useCallback, useEffect, useRef, useState } from "react";
import { useIdentity } from "./useIdentity.js";
import { nextDelay, shouldReconnect } from "./reconnect.js";
import { PROTOCOL_VERSION } from "@portal/shared/version";

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || "ws://localhost:3001";

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
  const ws = useRef(null);
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
  // Outbound messages issued while the socket isn't OPEN yet (initial connect or
  // a reconnect/StrictMode churn) are buffered here and flushed on `open`, so a
  // send that races the connection — e.g. the lobby's initial room-list request,
  // or a single click during a blip — isn't silently dropped.
  const outbox = useRef([]);

  const connected = connectionStatus === "connected";

  useEffect(() => {
    const socket = new WebSocket(`${GATEWAY_URL}?playerId=${encodeURIComponent(playerId)}`);
    ws.current = socket;
    socket.onopen = () => {
      setConnectionStatus("connected");
      reconnectAttempt.current = 0;
      // Re-establish room membership on the new connection. A reconnect (network
      // drop, or the StrictMode mount/cleanup/mount cycle in dev) lands on a
      // fresh server-side session with no room, so every game message would be
      // rejected with "not in a room" until we replay the join. The server keys
      // the seat by playerId, so replaying is an idempotent reconnect.
      const intent = joinIntent.current;
      if (intent) socket.send(JSON.stringify(intent));
      // Flush anything queued while the socket was still connecting.
      const queued = outbox.current;
      outbox.current = [];
      for (const raw of queued) socket.send(raw);
    };
    socket.onclose = () => {
      // Ignore closes from a socket we've already superseded. The StrictMode
      // mount/cleanup/mount cycle (and a fast reconnect) closes the prior socket
      // after a newer one is live; reconnecting off that stale close would spawn
      // an orphan connection whose session never rejoins, producing a roomless
      // socket that gets "not in a room" on every action. A genuine drop closes
      // the *current* socket, so ws.current === socket and we still reconnect.
      if (ws.current !== socket) return;
      if (shouldReconnect(reconnectAttempt.current)) {
        setConnectionStatus("reconnecting");
        reconnectTimer.current = setTimeout(
          () => setRetrySignal((s) => s + 1),
          nextDelay(reconnectAttempt.current++),
        );
      } else {
        setConnectionStatus("disconnected");
      }
    };
    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      switch (msg.t) {
        case "hello":
          if (msg.protocolVersion !== PROTOCOL_VERSION) setNeedsRefresh(true);
          break;
        case "rooms":
          setRooms(msg.rooms);
          break;
        case "joined":
          setError("");
          setRoom({ code: msg.code, seat: msg.seat, isHost: msg.isHost, options: msg.options });
          // Record how to re-enter this exact room on a reconnect. Spectators
          // set their intent at request time (handled in spectate()); a seated
          // player replays a join by the now-known code, which the server treats
          // as a reconnect and restores the held seat.
          if (msg.seat !== -1 && pendingName.current != null) {
            joinIntent.current = { t: "lobby:join", gameId, code: msg.code, name: pendingName.current };
          }
          break;
        case "state":
          setError("");
          setGameState(msg);
          break;
        case "left":
          // Server freed our seat; drop back to the lobby. Clear the rejoin
          // intent so a later reconnect doesn't silently pull us back in.
          joinIntent.current = null;
          pendingName.current = null;
          setRoom(null);
          setGameState(null);
          setChatMessages([]);
          break;
        case "chat":
          setChatMessages((m) => [...m, msg]);
          break;
        case "ping":
          // The one heartbeat the server drives; reply so it can measure latency
          // and know we're alive (so our seat isn't reaped / auto-folded).
          socket.send(JSON.stringify({ t: "pong", sentAt: msg.sentAt }));
          break;
        case "error":
          setError(msg.message);
          break;
        default:
          break;
      }
    };
    function handleClientError(event) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          t: "client:error",
          message: String(event.message || event.reason || "").slice(0, 500),
          stack: event.error?.stack?.slice(0, 2000),
        }));
      }
    }
    window.addEventListener("error", handleClientError);
    window.addEventListener("unhandledrejection", handleClientError);
    return () => {
      window.removeEventListener("error", handleClientError);
      window.removeEventListener("unhandledrejection", handleClientError);
      clearTimeout(reconnectTimer.current);
      socket.close();
    };
  }, [playerId, retrySignal]);

  const rawSend = useCallback((obj) => {
    const raw = JSON.stringify(obj);
    const sock = ws.current;
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(raw);
    // Buffer for the next open. De-dupe identical frames so a StrictMode
    // remount / reconnect doesn't pile up repeat requests (e.g. the lobby's
    // mount-effect room-list poll) into a burst that trips the rate limiter.
    else if (!outbox.current.includes(raw)) outbox.current.push(raw);
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
