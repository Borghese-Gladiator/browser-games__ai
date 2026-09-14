// Socket smoke test for a running gateway. Connects over Socket.IO, creates a
// room, and exits non-zero unless the server seats the player. Runs inside the
// runtime image, which already holds socket.io-client.
import { io } from "socket.io-client";

const url = process.argv[2] ?? "http://localhost:8080";
const gameId = process.argv[3] ?? "reversi";

const socket = io(url, {
  transports: ["websocket"],
  auth: { playerId: `smoke-${Date.now()}` },
});

function fail(why) {
  console.error(`socket smoke FAIL: ${why}`);
  socket.close();
  process.exit(1);
}

const timer = setTimeout(() => fail("no joined frame in 10s"), 10_000);

socket.on("connect_error", (err) => fail(`connect_error: ${err.message}`));
socket.on("error", (msg) => fail(`server error: ${msg.message}`));

socket.on("hello", (msg) => {
  console.log(`socket smoke: hello protocolVersion=${msg.protocolVersion}`);
  socket.emit("lobby:create", { gameId, name: "Smoke" });
});

socket.on("joined", (msg) => {
  clearTimeout(timer);
  console.log(`socket smoke: joined code=${msg.code} seat=${msg.seat ?? "?"}`);
  socket.close();
  process.exit(0);
});
