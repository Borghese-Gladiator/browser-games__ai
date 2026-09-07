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

export function Poker() {
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
  }: any = useGameSocket("poker");

  useYourTurn(gameState, room?.seat);

  if (!room || !gameState) {
    return (
      <>
        <RefreshBanner needsRefresh={needsRefresh} />
        <Lobby
          title="Texas Hold'em"
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
    return <SpectatorView gameState={gameState} gameId="poker" />;
  }

  const isHost = gameState.isHost ?? room.isHost;
  const waiting = gameState.phase === "waiting";

  const act = (type: string, extra = {}) => send({ action: { type, ...extra } });

  const activePlayer = gameState.players.find((p: any) => p.seat === gameState.activeSeat);
  const activePlayerName = activePlayer?.name ?? "";
  const legalActions = gameState.legalActions ?? [];

  let statusText;
  if (gameState.winner) {
    statusText = `${gameState.winner.name} wins the pot of ${gameState.winner.amount} chips with ${gameState.winner.handName}`;
  } else if (gameState.phase === "waiting") {
    statusText = `Waiting for players… (${gameState.players.length}/4)`;
  } else {
    statusText = `${activePlayerName}'s turn`;
  }

  return (
    <main className="poker">
      <RefreshBanner needsRefresh={needsRefresh} />
      <ConnectionBanner connectionStatus={connectionStatus} />
      <p className="poker-back">
        <a href="/">← All games</a>
      </p>
      <h1>Texas Hold'em</h1>
      <RoomCode code={room.code} />

      {isHost && waiting && (
        <section aria-label="Host controls" className="poker-host">
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

      <p id="status" role="status" aria-live="polite" className="poker-status">
        {statusText}
      </p>

      <section aria-label="Community cards">
        <h2>Community cards</h2>
        {gameState.community.length === 0 ? (
          <p>None yet</p>
        ) : (
          <ul className="poker-cards">
            {gameState.community.map((c: any) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        <p className="poker-pot">Pot: {gameState.pot} chips</p>
      </section>

      {gameState.myHoleCards?.length === 2 && (
        <section aria-label="Your cards">
          <h2>Your cards</h2>
          <ul className="poker-cards poker-hole">
            {gameState.myHoleCards.map((c: any) => (
              <li key={c}>{c}</li>
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

      {legalActions.length > 0 && (
        <section aria-label="Your actions" className="poker-actions">
          <button
            className="btn"
            type="button"
            onClick={() => act("fold")}
            disabled={!legalActions.includes("fold")}
          >
            Fold
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("check")}
            disabled={!legalActions.includes("check")}
          >
            Check
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("call")}
            disabled={!legalActions.includes("call")}
          >
            Call
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => act("raise")}
            disabled={!legalActions.includes("raise")}
          >
            Raise
          </button>
        </section>
      )}

      {gameState.phase === "showdown" && (
        <button className="btn" type="button" onClick={restart}>
          Play again
        </button>
      )}

      <Chat messages={chatMessages} onSend={sendChat} disabled={false} />

      {error && (
        <p role="alert" className="poker-error">
          {error}
        </p>
      )}
    </main>
  );
}
