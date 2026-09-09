// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { HandEndScreen } from "./HandEndScreen.tsx";
import type { HandEndResult, RevealSeat } from "./HandEndScreen.tsx";

afterEach(cleanup);

const PLAYERS = [
  { seat: 0, name: "P0" },
  { seat: 1, name: "P1" },
  { seat: 2, name: "P2" },
  { seat: 3, name: "P3" },
];

function reveal(): RevealSeat[] {
  return [
    { seat: 0, name: "P0", hand: ["dots-7", "dots-8"], melds: [], flowers: [] },
    {
      seat: 1,
      name: "P1",
      hand: ["bamboo-5", "bamboo-5"],
      melds: [{ kind: "pong", tiles: ["dots-3", "dots-3", "dots-3"] }],
      flowers: ["flower-plum"],
    },
    { seat: 2, name: "P2", hand: ["honor-red"], melds: [], flowers: [] },
    { seat: 3, name: "P3", hand: ["characters-9"], melds: [], flowers: [] },
  ];
}

function winResult(): HandEndResult {
  return {
    kind: "WIN",
    winner: 1,
    dealtInSeat: 2,
    winningTile: "bamboo-5",
    selfDraw: false,
    patterns: [
      { name: "DEALER", tai: 1 },
      { name: "ALL_ONE_SUIT", tai: 8 },
    ],
    totalTai: 9,
    seats: [
      { seat: 0, delta: 0, score: 500 },
      { seat: 1, delta: 18, score: 518 },
      { seat: 2, delta: -18, score: 482 },
      { seat: 3, delta: 0, score: 500 },
    ],
  };
}

function drawResult(): HandEndResult {
  return {
    kind: "DRAW",
    winner: null,
    dealtInSeat: null,
    winningTile: null,
    selfDraw: false,
    patterns: [],
    totalTai: 0,
    seats: [
      { seat: 0, delta: 0, score: 500 },
      { seat: 1, delta: 0, score: 500 },
      { seat: 2, delta: 0, score: 500 },
      { seat: 3, delta: 0, score: 500 },
    ],
  };
}

function renderScreen(result: HandEndResult) {
  return render(
    <HandEndScreen
      result={result}
      reveal={reveal()}
      scores={result.seats.map((s) => s.score)}
      players={PLAYERS}
      autoAdvanceMs={0}
      onNextRound={vi.fn()}
      onEndGame={vi.fn()}
    />,
  );
}

describe("HandEndScreen", () => {
  it("puts the Winner badge on the winner and the Dealt in badge on the discarder", () => {
    renderScreen(winResult());

    const winnerPanel = screen.getByLabelText("P1 final hand");
    const dealtInPanel = screen.getByLabelText("P2 final hand");
    const bystanderPanel = screen.getByLabelText("P0 final hand");

    expect(within(winnerPanel).getByText("Winner")).toBeTruthy();
    expect(within(winnerPanel).queryByText("Dealt in")).toBeNull();

    expect(within(dealtInPanel).getByText("Dealt in")).toBeTruthy();
    expect(within(dealtInPanel).queryByText("Winner")).toBeNull();

    expect(within(bystanderPanel).queryByText("Winner")).toBeNull();
    expect(within(bystanderPanel).queryByText("Dealt in")).toBeNull();
  });

  it("shows the win line with the winning tile and the source seat", () => {
    renderScreen(winResult());

    const winLine = screen.getByLabelText("Winning tile");
    expect(within(winLine).getByText("Won off P2")).toBeTruthy();
    // The winning tile renders as a real tile face with its accessible name.
    expect(within(winLine).getByRole("img", { name: "5 bamboo" })).toBeTruthy();
  });

  it("renders no win line and no Dealt in badge for an exhaustive draw", () => {
    renderScreen(drawResult());

    expect(screen.getByText("Exhaustive draw")).toBeTruthy();
    expect(screen.queryByLabelText("Winning tile")).toBeNull();
    expect(screen.queryByText("Dealt in")).toBeNull();
    expect(screen.queryByText("Winner")).toBeNull();
  });

  it("renders one tai line per result.patterns entry with matching tai values", () => {
    const result = winResult();
    const { container } = renderScreen(result);

    const lines = container.querySelectorAll(".mj-tai-line");
    expect(lines).toHaveLength(result.patterns.length);

    const renderedTai = Array.from(container.querySelectorAll(".mj-tai-line-tai")).map((el) =>
      Number(el.textContent),
    );
    expect(renderedTai).toEqual(result.patterns.map((p) => p.tai));

    expect(screen.getByLabelText("Total 9 tai")).toBeTruthy();
  });

  it("renders per-seat score deltas that sum to zero", () => {
    const { container } = renderScreen(winResult());

    const deltas = Array.from(container.querySelectorAll(".mj-delta")).map((el) =>
      Number((el.textContent ?? "").replace("+", "")),
    );
    expect(deltas).toHaveLength(4);
    expect(deltas.reduce((sum, value) => sum + value, 0)).toBe(0);
  });
});
