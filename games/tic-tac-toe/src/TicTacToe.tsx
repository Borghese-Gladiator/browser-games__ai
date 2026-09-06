import { useState } from "react";
import { cellLabel, emptyBoard, findWinner, isDraw, type Mark } from "./ttt.js";

export function TicTacToe() {
  const [board, setBoard] = useState(emptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Mark>("X");

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
    setCurrentPlayer((p) => (p === "X" ? "O" : "X"));
  }

  function reset() {
    setBoard(emptyBoard());
    setCurrentPlayer("X");
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
      <button type="button" className="btn" onClick={reset}>
        Reset game
      </button>
    </main>
  );
}
