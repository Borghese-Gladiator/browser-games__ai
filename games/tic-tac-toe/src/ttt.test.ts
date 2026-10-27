import { describe, expect, it } from "vitest";
import {
  WIN_LINES,
  emptyBoard,
  emptyScores,
  findWinner,
  isDraw,
  recordResult,
  type Board,
} from "./ttt.js";

describe("recordResult", () => {
  it.each([
    ["X win", ["X", "X", "X", "O", "O", "", "", "", ""], { X: 1, O: 0, draws: 0 }],
    ["O win", ["O", "O", "O", "X", "X", "", "X", "", ""], { X: 0, O: 1, draws: 0 }],
    ["draw", ["X", "O", "X", "X", "O", "O", "O", "X", "X"], { X: 0, O: 0, draws: 1 }],
    ["game in progress", ["X", "", "", "", "O", "", "", "", ""], emptyScores()],
  ] as Array<[string, Board, ReturnType<typeof emptyScores>]>)(
    "counts a %s once",
    (_label, board, expected) => {
      expect(recordResult(emptyScores(), board)).toEqual(expected);
    },
  );
});

describe("findWinner", () => {
  it.each(WIN_LINES)("detects a win on line %j", (a, b, c) => {
    const board = emptyBoard();
    board[a] = board[b] = board[c] = "X";
    expect(findWinner(board)).toBe("X");
  });

  it("returns null when there is no winner", () => {
    expect(findWinner(emptyBoard())).toBeNull();
    // Full board, no line completed (a known draw layout).
    const draw: Board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"];
    expect(findWinner(draw)).toBeNull();
  });
});

describe("isDraw", () => {
  it("is true for a full board with no winner", () => {
    const draw: Board = ["X", "O", "X", "X", "O", "O", "O", "X", "X"];
    expect(isDraw(draw)).toBe(true);
  });

  it.each([
    ["empty board", emptyBoard()],
    ["board with a winner", ["X", "X", "X", "", "", "", "", "", ""]],
  ] as Array<[string, Board]>)("is false for %s", (_label, board) => {
    expect(isDraw(board)).toBe(false);
  });
});
