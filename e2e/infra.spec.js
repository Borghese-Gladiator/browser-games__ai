import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { io } from "socket.io-client";
import { GATEWAY as GATEWAY_URL, GATEWAY_PORT, gamePage } from "./ports.js";

// Cross-cutting infra proofs against the Socket.IO gateway.
//   AC1 — a malformed game message is rejected by the central validator.
//   AC2 — a protocolVersion mismatch surfaces the refresh prompt.
//   AC3 — a feature-flag-disabled game refuses a new room.

const GATEWAY = GATEWAY_URL;
const artifactDir = path.resolve("e2e/artifacts");

// Open a Socket.IO client to the gateway, emit a short sequence of named events,
// and resolve with the first frame of the awaited type. Keeps these tests
// independent of any particular game's UI state. Identity travels in the
// handshake auth the same way the app's client hook sends it.
function ioExchange({ emit, waitFor, timeoutMs = 5000 }) {
  return new Promise((resolve, reject) => {
    const playerId = randomUUID();
    const socket = io(GATEWAY, {
      transports: ["websocket"],
      auth: { playerId },
      query: { playerId },
      reconnection: false,
      forceNew: true,
    });
    const finish = (fn, arg) => {
      clearTimeout(timer);
      socket.close();
      fn(arg);
    };
    const timer = setTimeout(
      () => finish(reject, new Error(`timed out waiting for '${waitFor}'`)),
      timeoutMs,
    );
    socket.on("connect", () => {
      for (const [event, payload] of emit) socket.emit(event, payload);
    });
    socket.on(waitFor, (msg) => finish(resolve, msg));
    socket.on("connect_error", (err) => finish(reject, err));
  });
}

test("AC1: a malformed message is rejected by the central validator", async () => {
  // Create a poker room, then send a game message whose shape matches no entry
  // in poker's validGameMessages schema.
  const err = await ioExchange({
    emit: [
      ["lobby:create", { gameId: "poker", name: "Tester" }],
      ["game", { __evil: true }],
    ],
    waitFor: "error",
  });
  expect(err).toBeTruthy();
  expect(err.message).toMatch(/invalid message/);
});

test("AC2: a version mismatch surfaces a refresh prompt", async ({ browser }) => {
  const ctx = await browser.newContext({ recordVideo: { dir: artifactDir } });
  await ctx.tracing.start({ screenshots: true, snapshots: true, title: "INFRA-AC2" });
  const page = await ctx.newPage();

  // Socket.IO frames its events inside engine.io packets over the WebSocket: a
  // 'hello' event arrives as `42["hello",{...}]` (4 = engine.io MESSAGE, 2 =
  // socket.io EVENT). Intercept the gateway socket and rewrite the protocolVersion
  // inside that frame so the client sees a version it does not recognize.
  await page.routeWebSocket(new RegExp(`localhost:${GATEWAY_PORT}`), (ws) => {
    const server = ws.connectToServer();
    server.onMessage((message) => {
      if (typeof message === "string" && message.startsWith("42")) {
        try {
          const [event, payload] = JSON.parse(message.slice(2));
          if (event === "hello") {
            ws.send("42" + JSON.stringify(["hello", { ...payload, protocolVersion: "99.99.99" }]));
            return;
          }
        } catch {
          /* forward non-event frames unchanged */
        }
      }
      ws.send(message);
    });
    ws.onMessage((message) => server.send(message));
  });

  await page.goto(gamePage("poker"));
  await expect(page.getByText(/Server updated — please refresh/)).toBeVisible({ timeout: 10_000 });

  await ctx.tracing.stop({ path: path.join(artifactDir, "trace-infra-ac2.zip") });
  await ctx.close();
});

test("AC3: a game disabled by its feature flag refuses a new room", async () => {
  const err = await ioExchange({
    emit: [["lobby:create", { gameId: "_infra-test", name: "Tester" }]],
    waitFor: "error",
  });
  expect(err).toBeTruthy();
  expect(err.message).toMatch(/_infra-test is disabled/);
});
