import { useState } from "react";
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
  const [match, setMatch] = useState(emptyScores);

  const winner = findWinner(board);
  const draw = isDraw(board);
  const gameOver = Boolean(winner) || draw;

  const status = winner
    ? `${winner} wins!`
    : draw
      ? "It's a draw!"
      : `${currentPlayer}'s turn`;

  function handleMove(i: number) {
    if (gameOver || board[i] !== "") return;
    const next = board.slice();
    next[i] = currentPlayer;
    setBoard(next);
    setScores((s) => recordResult(s, next));
    if (bestOf3) setMatch((m) => recordResult(m, next));
    setCurrentPlayer((p) => (p === "X" ? "O" : "X"));
  }

  function reset() {
    setBoard(emptyBoard());
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
      <label className="ttt-toggle">
        <input
          type="checkbox"
          checked={bestOf3}
          onChange={(e) => {
            setBestOf3(e.target.checked);
            setMatch(emptyScores());
          }}
        />
        Best of 3
      </label>
      {bestOf3 && (
        <p className="ttt-match">
          Match: X {match.X} - O {match.O}
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
        <button type="button" className="btn" onClick={reset}>
          Reset game
        </button>
        <button type="button" className="btn" onClick={resetScores}>
          Reset scores
        </button>
      </div>
    </main>
  );
}
