import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { ConnectionBanner } from "@browser-games/game-client/ConnectionBanner";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";
import { PlayerList } from "@browser-games/game-client/PlayerList";
import { RoomCode } from "@browser-games/game-client/RoomCode";
import { LockRoomButton } from "@browser-games/game-client/LockRoomButton";
import { Chat } from "@browser-games/game-client/Chat";
import { SpectatorView } from "@browser-games/game-client/SpectatorView";
import { useYourTurn } from "@browser-games/game-client/useYourTurn";
import type { GameState } from "@browser-games/game-client/protocol";
import "@browser-games/game-client/chrome.css";

interface ReversiPlayer {
  seat: number;
  name: string;
}

interface ReversiState extends GameState {
  legalMoves?: { row: number; col: number }[];
  players?: ReversiPlayer[];
  winner?: string;
  myColor?: string;
  passedSeat: number;
  score?: { B: number; W: number };
  board?: (string | null)[];
  mySeat?: number;
}

export function Reversi() {
  const {
    connectionStatus, rooms, room, chatMessages, sendChat,
    error, listRooms, createRoom, joinRoom, quickMatch, spectate,
    lockRoom, startEarly, send, restart, needsRefresh,
    gameState: rawGameState,
  } = useGameSocket("reversi");
  // Engine-specific per-seat view; read through a typed local view.
  const gameState = rawGameState as ReversiState | null;

  useYourTurn(rawGameState, room?.seat);

  if (!room || !gameState) {
    return (
      <>
        <RefreshBanner needsRefresh={needsRefresh} />
        <Lobby title="Reversi" rooms={rooms} error={error}
          onCreate={createRoom} onJoin={joinRoom} onQuickMatch={quickMatch}
          onSpectate={spectate} onRefresh={listRooms} />
      </>
    );
  }

  if (room.seat === -1) return <SpectatorView gameState={rawGameState} gameId="reversi" />;

  const legalSet = new Set((gameState.legalMoves ?? []).map(({ row, col }) => `${row},${col}`));
  const isMyTurn = gameState.activeSeat === room.seat;
  const activePlayer = gameState.players?.find((p) => p.seat === gameState.activeSeat);

  let statusText;
  if (gameState.phase === "done") {
    statusText = gameState.winner === "draw"
      ? "It's a draw!"
      : `${gameState.winner === gameState.myColor ? "You win!" : `${activePlayer?.name} wins!`}`;
  } else if (gameState.phase === "waiting") {
    statusText = `Waiting for opponent… (${gameState.players?.length ?? 0}/2)`;
  } else {
    statusText = isMyTurn ? "Your turn" : `${activePlayer?.name}'s turn`;
    if (gameState.passedSeat >= 0) {
      const passed = gameState.players?.find((p) => p.seat === gameState.passedSeat);
      const who = gameState.passedSeat === room.seat ? "You have" : `${passed?.name} has`;
      statusText = `${who} no legal move — turn passed. ${statusText}`;
    }
  }

  return (
    <main className="reversi">
      <RefreshBanner needsRefresh={needsRefresh} />
      <ConnectionBanner connectionStatus={connectionStatus} />
      <p className="reversi-back"><a href="/">← All games</a></p>
      <h1>Reversi</h1>
      <RoomCode code={room.code} />

      {(gameState.isHost ?? room.isHost) && gameState.phase === "waiting" && (
        <section aria-label="Host controls" className="reversi-host">
          <button className="btn" type="button" onClick={startEarly}>Start with bot</button>
          <LockRoomButton locked={gameState.locked} onToggle={lockRoom} />
        </section>
      )}

      <p id="status" role="status" aria-live="polite" className="reversi-status">{statusText}</p>

      <p className="reversi-score">
        ⚫ {gameState.score?.B ?? 0} — ⚪ {gameState.score?.W ?? 0}
      </p>

      <div className="reversi-board" role="grid" aria-label="Reversi board">
        {(gameState.board ?? []).map((cell, i) => {
          const row = Math.floor(i / 8);
          const col = i % 8;
          const isHint = !cell && legalSet.has(`${row},${col}`);
          const cls = ["reversi-cell",
            cell === "B" ? "reversi-cell--black" : "",
            cell === "W" ? "reversi-cell--white" : "",
            isHint ? "reversi-cell--hint" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={i} type="button" className={cls}
              role="gridcell"
              aria-label={`Row ${row + 1} Col ${col + 1}${cell ? ` ${cell === "B" ? "Black" : "White"}` : ""}`}
              disabled={!isHint || !isMyTurn || gameState.phase !== "playing"}
              onClick={() => send({ row, col })}
            />
          );
        })}
      </div>

      <section aria-label="Players">
        <PlayerList players={gameState.players} presence={gameState.presence}
          mySeat={gameState.mySeat} activeSeat={gameState.activeSeat} />
      </section>

      {gameState.phase === "done" && (
        <button className="btn" type="button" onClick={restart}>Play again</button>
      )}

      <Chat messages={chatMessages} onSend={sendChat} disabled={false} />
      {error && <p role="alert" className="reversi-error">{error}</p>}
    </main>
  );
}
