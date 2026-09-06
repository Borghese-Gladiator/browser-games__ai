import { useState } from "react";
import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { ConnectionBanner } from "@browser-games/game-client/ConnectionBanner";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";
import { PlayerList } from "@browser-games/game-client/PlayerList";
import { RoomCode } from "@browser-games/game-client/RoomCode";
import { Chat } from "@browser-games/game-client/Chat";
import { SpectatorView } from "@browser-games/game-client/SpectatorView";
import { useYourTurn } from "@browser-games/game-client/useYourTurn";
import "@browser-games/game-client/chrome.css";

// Cards played this trick must share a rank; a legal play is any subset of one
// rank that beats the current play. We let the player pick cards and match the
// selection against the server-provided legalPlays.
function sameRankSelection(selected: string[]) {
  if (selected.length === 0) return false;
  const rank = selected[0][0];
  return selected.every((c) => c[0] === rank);
}

export function President() {
  const {
    connectionStatus,
    rooms,
    room,
    gameState,
    chatMessages,
    sendChat,
    error,
    listRooms,
    createRoom,
    joinRoom,
    quickMatch,
    spectate,
    kick,
    lockRoom,
    startEarly,
    send,
    restart,
    needsRefresh,
  }: any = useGameSocket("president");

  const [selected, setSelected] = useState<string[]>([]);

  useYourTurn(gameState, room?.seat);

  if (!room || !gameState) {
    return (
      <>
        <RefreshBanner needsRefresh={needsRefresh} />
        <Lobby
          title="President"
          rooms={rooms}
          error={error}
          onCreate={createRoom}
          onJoin={joinRoom}
          onQuickMatch={quickMatch}
          onSpectate={spectate}
          onRefresh={listRooms}
        />
      </>
    );
  }

  if (room.seat === -1) {
    return <SpectatorView gameState={gameState} gameId="president" />;
  }

  const isHost = gameState.isHost ?? room.isHost;
  const waiting = gameState.phase === "waiting";
  const myTurn = gameState.mySeat === gameState.activeSeat && gameState.phase === "playing";

  const toggleCard = (card: string) => {
    setSelected((prev) =>
      prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card],
    );
  };

  const play = () => {
    if (selected.length === 0) return;
    send({ cards: selected });
    setSelected([]);
  };

  const pass = () => {
    send({ pass: true });
    setSelected([]);
  };

  const activePlayer = gameState.players.find((p: any) => p.seat === gameState.activeSeat);
  const activePlayerName = activePlayer?.name ?? "";

  let statusText;
  if (gameState.winner) {
    statusText = `${gameState.winner.name} is President!`;
  } else if (waiting) {
    statusText = `Waiting for players… (${gameState.players.length}/4)`;
  } else if (gameState.phase === "done") {
    statusText = "Round over";
  } else {
    statusText = `${activePlayerName}'s turn`;
  }

  const current = gameState.currentPlay;

  return (
    <main className="president">
      <RefreshBanner needsRefresh={needsRefresh} />
      <ConnectionBanner connectionStatus={connectionStatus} />
      <p className="president-back">
        <a href="/">← All games</a>
      </p>
      <h1>President</h1>
      <RoomCode code={room.code} />

      {isHost && waiting && (
        <section aria-label="Host controls" className="president-host">
          <button className="btn" type="button" onClick={startEarly}>
            Start with bots
          </button>
          <button className="btn" type="button" onClick={() => lockRoom(true)}>
            Lock room
          </button>
          <button className="btn" type="button" onClick={() => lockRoom(false)}>
            Unlock room
          </button>
        </section>
      )}

      <p id="status" role="status" aria-live="polite" className="president-status">
        {statusText}
      </p>

      <section aria-label="Current play">
        <h2>Current play</h2>
        {current ? (
          <ul className="president-cards">
            {current.cards.map((c: any) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : (
          <p>Trick open — lead any set</p>
        )}
      </section>

      {gameState.myHand?.length > 0 && (
        <section aria-label="Your cards">
          <h2>Your cards</h2>
          <ul className="president-cards president-hand">
            {gameState.myHand.map((c: any) => (
              <li key={c}>
                <button
                  type="button"
                  className={selected.includes(c) ? "president-card selected" : "president-card"}
                  aria-pressed={selected.includes(c)}
                  aria-label={`Card ${c}`}
                  onClick={() => toggleCard(c)}
                  disabled={!myTurn}
                >
                  {c}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Players">
        <h2>Players</h2>
        <PlayerList
          players={gameState.players}
          presence={gameState.presence}
          mySeat={gameState.mySeat}
          activeSeat={gameState.activeSeat}
        />
      </section>

      {myTurn && (
        <section aria-label="Your actions" className="president-actions">
          <button
            className="btn"
            type="button"
            onClick={play}
            disabled={!sameRankSelection(selected)}
          >
            Play
          </button>
          <button
            className="btn"
            type="button"
            onClick={pass}
            disabled={!gameState.canPass}
          >
            Pass
          </button>
        </section>
      )}

      {gameState.phase === "done" && (
        <button className="btn" type="button" onClick={restart}>
          Play again
        </button>
      )}

      <Chat messages={chatMessages} onSend={sendChat} disabled={false} />

      {error && (
        <p role="alert" className="president-error">
          {error}
        </p>
      )}
    </main>
  );
}
