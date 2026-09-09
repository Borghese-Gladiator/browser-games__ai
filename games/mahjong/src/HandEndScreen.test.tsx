// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import {
  RULESET,
  type EstimatedPattern,
  type TaiEstimate,
} from "@browser-games/engine-mahjong-analysis";
import { HandEndScreen } from "./HandEndScreen.tsx";
import type { HandEndResult, RevealSeat, TaiPattern } from "./HandEndScreen.tsx";
import { FanPatternGuide } from "./board/FanPatternGuide.tsx";

afterEach(cleanup);

const PLAYERS = [
  { seat: 0, name: "P0" },
  { seat: 1, name: "P1" },
  { seat: 2, name: "P2" },
  { seat: 3, name: "P3" },
];

// Build a hand-end pattern from the analysis catalogue, the single source of
// pattern identity. Using it here proves the screen renders the same english and
// chinese names the fan guide reads from the same catalogue.
function pattern(id: string, tai?: number): TaiPattern {
  const def = RULESET.taiValues[id];
  return { id: def.id, english: def.english, chinese: def.chinese, tai: tai ?? def.tai };
}

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
    patterns: [pattern("dealer"), pattern("full_flush")],
    totalTai: 9,
    seats: [
      { seat: 0, delta: 0, score: 500 },
      { seat: 1, delta: 18, score: 518 },
      { seat: 2, delta: -18, score: 482 },
      { seat: 3, delta: 0, score: 500 },
    ],
  };
}

// A 2 tai discard win: dealer plus a flower, one tai each. The discarder pays the
// full amount (2 tai x 2 points) and the two bystanders neither pay nor gain.
function twoTaiDiscardResult(): HandEndResult {
  return {
    kind: "WIN",
    winner: 1,
    dealtInSeat: 2,
    winningTile: "bamboo-5",
    selfDraw: false,
    patterns: [pattern("dealer"), pattern("flower")],
    totalTai: 2,
    seats: [
      { seat: 0, delta: 0, score: 500 },
      { seat: 1, delta: 4, score: 504 },
      { seat: 2, delta: -4, score: 496 },
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

// A fan-guide estimate carrying one pattern, built from the same catalogue the
// scorer reads. The guide copies english and chinese off this pattern, exactly as
// estimateTai does, so it proves guide/screen name parity for the id.
function guideEstimateFor(id: string): TaiEstimate {
  const def = RULESET.taiValues[id];
  const entry: EstimatedPattern = {
    id: def.id,
    english: def.english,
    chinese: def.chinese,
    tai: def.tai,
    rule: def.rule,
    tier: "potential",
  };
  return {
    guaranteed: [],
    onTrack: [],
    potential: [entry],
    totals: { guaranteed: 0, onTrack: 0, potential: def.tai },
  };
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

  it("renders bilingual pattern lines and the settled deltas for a 2 tai discard win", () => {
    const result = twoTaiDiscardResult();
    const { container } = renderScreen(result);

    // Each pattern line shows both the english and the chinese name from the
    // catalogue, side by side.
    const dealer = RULESET.taiValues.dealer;
    const flower = RULESET.taiValues.flower;
    expect(screen.getByText(dealer.english)).toBeTruthy();
    expect(screen.getByText(dealer.chinese)).toBeTruthy();
    expect(screen.getByText(flower.english)).toBeTruthy();
    expect(screen.getByText(flower.chinese)).toBeTruthy();

    const zh = Array.from(container.querySelectorAll(".mj-tai-line-zh")).map((el) => el.textContent);
    expect(zh).toEqual([dealer.chinese, flower.chinese]);

    // Winner +4, discarder -4, and the two bystanders unchanged.
    expect(screen.getByLabelText("P1 change +4")).toBeTruthy();
    expect(screen.getByLabelText("P2 change -4")).toBeTruthy();
    expect(screen.getByLabelText("P0 change 0")).toBeTruthy();
    expect(screen.getByLabelText("P3 change 0")).toBeTruthy();
  });

  it("renders per-seat score deltas that sum to zero", () => {
    const { container } = renderScreen(winResult());

    const deltas = Array.from(container.querySelectorAll(".mj-delta")).map((el) =>
      Number((el.textContent ?? "").replace("+", "")),
    );
    expect(deltas).toHaveLength(4);
    expect(deltas.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("shows the same english and chinese names as the fan guide for one pattern id", () => {
    const id = "full_flush";
    const def = RULESET.taiValues[id];

    const handEnd = renderScreen({
      ...winResult(),
      patterns: [pattern(id)],
    });
    const handEndScoring = within(handEnd.container.querySelector(".mj-handend-tai") as HTMLElement);
    expect(handEndScoring.getByText(def.english)).toBeTruthy();
    expect(handEndScoring.getByText(def.chinese)).toBeTruthy();
    cleanup();

    const guide = render(<FanPatternGuide estimate={guideEstimateFor(id)} onClose={() => {}} />);
    const guideList = within(guide.getByLabelText("Patterns"));
    // The guide reads english and chinese from the same catalogue, so the names
    // it renders for this id match the hand-end screen exactly.
    expect(guideList.getAllByText(def.english).length).toBeGreaterThan(0);
    expect(guideList.getAllByText(def.chinese).length).toBeGreaterThan(0);
  });
});
