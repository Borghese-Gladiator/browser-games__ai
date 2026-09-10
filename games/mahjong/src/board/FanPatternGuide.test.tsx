// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import {
  estimateTai,
  RULESET,
  type Position,
  type TaiEstimate,
} from "@browser-games/engine-mahjong-analysis";
import { FanPatternGuide } from "./FanPatternGuide.tsx";

afterEach(cleanup);

// A dealer position that holds a flower, so the estimate carries guaranteed fans
// plus on-track and potential fans. Used to prove the summary totals come from
// estimateTai and that the rendered rule text is the analysis rule text.
function samplePosition(): Position {
  return {
    concealedTiles: ["1m", "1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m"],
    exposedMelds: [],
    flowers: ["plum"],
    seatWind: "east",
    roundWind: "east",
    isDealer: true,
    ruleset: RULESET,
  };
}

// A fully controlled estimate with one fan per tier and marker rule strings.
// Marker rules never appear in the ruleset, so finding them proves the UI reads
// rule text from the passed estimate, not a local string table.
function craftedEstimate(): TaiEstimate {
  const guaranteed = {
    id: "dealer",
    english: "Dealer",
    chinese: "莊家",
    tai: 1,
    rule: "RULE_DEALER_MARKER",
    tier: "guaranteed" as const,
  };
  const onTrack = {
    id: "concealed_hand",
    english: "Concealed hand",
    chinese: "門清",
    tai: 2,
    rule: "RULE_ONTRACK_MARKER",
    tier: "on-track" as const,
  };
  const potential = {
    id: "full_flush",
    english: "Full flush",
    chinese: "清一色",
    tai: 8,
    rule: "RULE_POTENTIAL_MARKER",
    tier: "potential" as const,
  };
  return {
    guaranteed: [guaranteed],
    onTrack: [guaranteed, onTrack],
    potential: [guaranteed, onTrack, potential],
    totals: { guaranteed: 1, onTrack: 3, potential: 11 },
  };
}

describe("FanPatternGuide", () => {
  it("renders the three summary totals from estimateTai output", () => {
    const estimate = estimateTai(samplePosition());
    render(<FanPatternGuide estimate={estimate} onClose={() => {}} />);

    const guaranteed = screen.getByText("GUARANTEED").closest(".mj-guide-summary")!;
    const onTrack = screen.getByText("ON TRACK").closest(".mj-guide-summary")!;
    const potential = screen.getByText("POTENTIAL").closest(".mj-guide-summary")!;

    expect(
      within(guaranteed as HTMLElement).getByText(String(estimate.totals.guaranteed)),
    ).toBeTruthy();
    expect(
      within(onTrack as HTMLElement).getByText(String(estimate.totals.onTrack)),
    ).toBeTruthy();
    expect(
      within(potential as HTMLElement).getByText(String(estimate.totals.potential)),
    ).toBeTruthy();
  });

  it("hides patterns of other tiers when a filter chip is toggled off", () => {
    render(<FanPatternGuide estimate={craftedEstimate()} onClose={() => {}} />);
    const list = screen.getByLabelText("Patterns");

    // All three tiers show at first.
    expect(within(list).getByText("Dealer")).toBeTruthy();
    expect(within(list).getByText("Concealed hand")).toBeTruthy();
    expect(within(list).getByText("Full flush")).toBeTruthy();

    // Turn off On track and Potential to filter down to Guaranteed only.
    fireEvent.click(screen.getByRole("button", { name: "On track" }));
    fireEvent.click(screen.getByRole("button", { name: "Potential" }));

    expect(within(list).getByText("Dealer")).toBeTruthy();
    expect(within(list).queryByText("Concealed hand")).toBeNull();
    expect(within(list).queryByText("Full flush")).toBeNull();
  });

  it("updates the detail pane when a card is selected", () => {
    render(<FanPatternGuide estimate={craftedEstimate()} onClose={() => {}} />);
    const detail = screen.getByLabelText("Pattern detail");

    // The first pattern is selected by default.
    expect(within(detail).getByText("RULE_DEALER_MARKER")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Full flush/ }));

    expect(within(detail).getByText("RULE_POTENTIAL_MARKER")).toBeTruthy();
    expect(within(detail).queryByText("RULE_DEALER_MARKER")).toBeNull();
  });

  it("takes rule text from the estimate, not a local string table", () => {
    render(<FanPatternGuide estimate={craftedEstimate()} onClose={() => {}} />);

    // The marker rule from the estimate renders.
    expect(screen.getAllByText("RULE_DEALER_MARKER").length).toBeGreaterThan(0);
    // The ruleset's own Dealer rule is never substituted in.
    expect(screen.queryByText(RULESET.taiValues.dealer.rule)).toBeNull();
  });
});
