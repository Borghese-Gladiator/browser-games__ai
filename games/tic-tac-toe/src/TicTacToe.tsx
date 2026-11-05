import { useEffect, useState } from "react";
import {
  cellLabel,
  emptyBoard,
  emptyScores,
  findWinner,
  isDraw,
  recordResult,
  type Mark,
} from "./ttt.js";

export function TicTacToe() {
  const [board, setBoard] = useState(emptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Mark>("X");
  const [scores, setScores] = useState(emptyScores);
  const [bestOf3, setBestOf3] = useState(false);
  const [match, setMatch] = useState({ X: 0, O: 0 });
  const [moves, setMoves] = useState<number[]>([]);
  const [timerOn, setTimerOn] = useState(false);
  const [seconds, setSeconds] = useState("10");
  const [timeLeft, setTimeLeft] = useState(10);
  const [timeouts, setTimeouts] = useState(0);
  const [timedOut, setTimedOut] = useState<Mark | null>(null);

  const winner = findWinner(board);
  const draw = isDraw(board);
  const matchWinner = bestOf3
    ? match.X >= 2
      ? "X"
      : match.O >= 2
        ? "O"
        : null
    : null;
  const gameOver = Boolean(winner) || draw || Boolean(matchWinner);

  const status = winner
    ? `${winner} wins!`
    : draw
      ? "It's a draw!"
      : `${currentPlayer}'s turn`;

  useEffect(() => {
    setTimeLeft(Math.min(30, Math.max(3, Number(seconds) || 10)));
    if (!timerOn || gameOver) return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [timerOn, gameOver, moves.length, timeouts, seconds]);

  useEffect(() => {
    if (!timerOn || gameOver || timeLeft > 0) return;
    setTimedOut(currentPlayer);
    setCurrentPlayer((p) => (p === "X" ? "O" : "X"));
    setTimeouts((n) => n + 1);
  }, [timeLeft]);

  function handleMove(i: number) {
    if (gameOver || board[i] !== "") return;
    const next = board.slice();
    next[i] = currentPlayer;
    setBoard(next);
    setScores((s) => recordResult(s, next));
    const w = findWinner(next);
    if (bestOf3 && w) setMatch((m) => ({ ...m, [w]: m[w] + 1 }));
    setMoves((m) => [...m, i]);
    setTimedOut(null);
    setCurrentPlayer((p) => (p === "X" ? "O" : "X"));
  }

  function undo() {
    if (gameOver || moves.length === 0) return;
    const next = board.slice();
    next[moves[moves.length - 1]] = "";
    setBoard(next);
    setMoves(moves.slice(0, -1));
    setCurrentPlayer((p) => (p === "X" ? "O" : "X"));
  }

  function reset() {
    setBoard(emptyBoard());
    setMoves([]);
    setTimedOut(null);
    setCurrentPlayer("X");
  }

  function resetScores() {
    setScores(emptyScores());
  }

  return (
    <main className="ttt">
      <p className="ttt-back">
        <a href="/">← All games</a>
      </p>
      <h1>Tic-Tac-Toe</h1>
      <p id="status" role="status" aria-live="polite" className="ttt-status">
        {status}
      </p>
      <dl className="ttt-scores" aria-label="Scoreboard">
        <div>
          <dt>X wins</dt>
          <dd>{scores.X}</dd>
        </div>
        <div>
          <dt>O wins</dt>
          <dd>{scores.O}</dd>
        </div>
        <div>
          <dt>Draws</dt>
          <dd>{scores.draws}</dd>
        </div>
      </dl>
      <label>
        <input
          type="checkbox"
          checked={bestOf3}
          onChange={(e) => {
            setBestOf3(e.target.checked);
            setMatch({ X: 0, O: 0 });
          }}
        />{" "}
        Best of 3
      </label>
      <label>
        <input
          type="checkbox"
          checked={timerOn}
          onChange={(e) => setTimerOn(e.target.checked)}
        />{" "}
        Turn timer
      </label>
      <label>
        Seconds per turn{" "}
        <input
          type="number"
          min={3}
          max={30}
          value={seconds}
          onChange={(e) => setSeconds(e.target.value)}
        />
      </label>
      {timerOn && <p className="ttt-timer">Time left: {timeLeft}</p>}
      {timedOut && <p className="ttt-timeout">{timedOut} ran out of time</p>}
      {bestOf3 && (
        <p className="ttt-match">
          Match: X {match.X} - O {match.O}
        </p>
      )}
      {matchWinner && (
        <p className="ttt-match-winner" role="alert">
          {matchWinner} wins the match!
        </p>
      )}
      <div className="ttt-board" role="grid" aria-label="Tic-tac-toe board">
        {board.map((value, i) => (
          <button
            key={i}
            type="button"
            className="ttt-cell"
            role="gridcell"
            disabled={gameOver || value !== ""}
            aria-label={value ? `${cellLabel(i)}, ${value}` : cellLabel(i)}
            onClick={() => handleMove(i)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="ttt-actions">
        <button
          type="button"
          className="btn"
          disabled={gameOver || moves.length === 0}
          onClick={undo}
        >
          Undo
        </button>
        <button type="button" className="btn" onClick={reset}>
          Reset game
        </button>
        <button type="button" className="btn" onClick={resetScores}>
          Reset scores
        </button>
        {bestOf3 && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              reset();
              setMatch({ X: 0, O: 0 });
            }}
          >
            New match
          </button>
        )}
      </div>
    </main>
  );
}
