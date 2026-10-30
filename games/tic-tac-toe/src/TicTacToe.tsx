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
  const [moves, setMoves] = useState<number[]>([]);

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
    setMoves((m) => [...m, i]);
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
      </div>
    </main>
  );
}
