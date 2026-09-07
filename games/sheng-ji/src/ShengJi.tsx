import { useGameSocket } from "@browser-games/game-client/useGameSocket";
import { Lobby } from "@browser-games/game-client/Lobby";
import { RefreshBanner } from "@browser-games/game-client/RefreshBanner";

const SUIT_NAMES: Record<string, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };
const SUIT_SYMBOLS: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

function cardSuit(card: string) {
  return card[card.length - 1];
}
function cardRank(card: string) {
  return card.slice(0, card.length - 1);
}
function cardDisplayName(card: string) {
  return `${cardRank(card)} of ${SUIT_NAMES[cardSuit(card)]}`;
}
function cardShort(card: string) {
  return `${cardRank(card)}${SUIT_SYMBOLS[cardSuit(card)]}`;
}

// Team A = seats 0 & 2; Team B = seats 1 & 3.
function teamLabel(team: number) {
  return team === 0 ? "Team A" : "Team B";
}

export function ShengJi() {
  const {
    rooms,
    room,
    gameState,
    error,
    listRooms,
    createRoom,
    joinRoom,
    quickMatch,
    spectate,
    startEarly,
    lockRoom,
    send,
    restart,
    needsRefresh,
  }: any = useGameSocket("sheng-ji");

  if (!room || !gameState) {
    return (
      <>
        <RefreshBanner needsRefresh={needsRefresh} />
        <Lobby
          title="Sheng Ji (升级)"
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

  const isHost = gameState.isHost ?? room.isHost;

  const {
    phase,
    players,
    trumpSuit,
    trumpRank,
    dealerSeat,
    activeSeat,
    currentTrick,
    completedTricks,
    teamPoints,
    lastTrickWinner,
    result,
    mySeat,
    myHand,
    legalCards,
  } = gameState;

  const playCard = (cardId: string) => send({ cardId });
  const nameForSeat = (seat: number) => players.find((p: any) => p.seat === seat)?.name ?? `Seat ${seat}`;
  const legalSet = new Set(legalCards ?? []);

  let status;
  if (result) {
    status = `${teamLabel(result.winnerTeam)} wins — ${teamPoints[0]} / ${teamPoints[1]} pts`;
  } else if (phase === "waiting") {
    status = `Waiting for players… (${players.length}/4)`;
  } else if (mySeat === activeSeat) {
    status = "Your turn";
  } else {
    status = `${nameForSeat(activeSeat)}'s turn`;
  }

  return (
    <main className="sj">
      <RefreshBanner needsRefresh={needsRefresh} />
      <p className="sj-back">
        <a href="/">← All games</a>
      </p>
      <h1>Sheng Ji (升级)</h1>
      <p className="sj-room">Room: {room.code}</p>

      {isHost && phase === "waiting" && (
        <section aria-label="Host controls" className="sj-host">
          <button className="btn" type="button" onClick={startEarly}>
            Start with bots
          </button>
          <button className="btn" type="button" onClick={() => lockRoom(true)}>
            Lock room
          </button>
        </section>
      )}

      <section aria-label="Status">
        <p role="status" aria-live="polite">
          {status}
        </p>
      </section>

      {trumpSuit && (
        <section aria-label="Trump">
          <p>
            Trump: rank {trumpRank}, suit {SUIT_NAMES[trumpSuit]}
          </p>
        </section>
      )}

      <section aria-label="Score">
        <p>
          Team A (0 &amp; 2): {teamPoints[0]} pts | Team B (1 &amp; 3): {teamPoints[1]} pts
        </p>
        <p>Tricks played: {completedTricks}</p>
      </section>

      <section aria-label="Current trick">
        {currentTrick.plays.length === 0 ? (
          <p>
            No cards played yet
            {lastTrickWinner != null && completedTricks > 0 && (
              <> — Last trick won by: {nameForSeat(lastTrickWinner)}</>
            )}
          </p>
        ) : (
          <ul className="sj-trick">
            {currentTrick.plays.map((play: any) => (
              <li key={play.seat}>
                {nameForSeat(play.seat)}: {cardShort(play.card)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Your hand">
        <ul className="sj-hand">
          {myHand.map((card: any) => (
            <li key={card}>
              <button
                type="button"
                className="sj-card-btn"
                aria-label={`Play ${cardDisplayName(card)}`}
                disabled={!legalSet.has(card)}
                onClick={() => playCard(card)}
              >
                {cardShort(card)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Players">
        <ul>
          {players.map((p: any) => (
            <li key={p.seat} aria-current={p.seat === activeSeat ? "true" : undefined}>
              {p.name} (seat {p.seat})
              {p.seat === dealerSeat ? " 🎲" : ""} — {p.handCount} cards
            </li>
          ))}
        </ul>
      </section>

      {phase === "deal-over" && (
        <button className="btn" type="button" onClick={restart}>
          New Deal
        </button>
      )}
    </main>
  );
}
