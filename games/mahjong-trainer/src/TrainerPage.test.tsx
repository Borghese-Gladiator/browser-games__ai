// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { TrainerPage } from "./TrainerPage.tsx";

afterEach(cleanup);

const REASON_PATTERN = /improve the hand|steps? from a win|good shapes?|waits on|penalty/;

describe("TrainerPage", () => {
  it("reveals the ranking and an explanation after a discard, then advances", () => {
    render(<TrainerPage initialSeed={1} />);

    // No ranking is shown before the player chooses.
    expect(screen.queryByRole("region", { name: "Discard ranking" })).toBeNull();

    const discardButtons = screen
      .getByRole("region", { name: "Your hand" })
      .querySelectorAll<HTMLButtonElement>("button.dt-tile-btn");
    expect(discardButtons.length).toBeGreaterThan(0);

    const firstHand = discardButtons[0].textContent;
    fireEvent.click(discardButtons[0]);

    // The full ranking is revealed and the player's position is marked.
    const ranking = screen.getByRole("region", { name: "Discard ranking" });
    expect(within(ranking).getByRole("heading", { name: "Full ranking" })).toBeTruthy();
    expect(ranking.querySelector('[aria-current="true"]')).toBeTruthy();

    // At least one structured reason renders as a readable sentence.
    expect(within(ranking).getAllByText(REASON_PATTERN).length).toBeGreaterThan(0);

    // The hand is locked once a choice is made.
    expect(discardButtons[0].disabled).toBe(true);

    // Advancing resets the flow: ranking hides and the hand is selectable again.
    fireEvent.click(screen.getByRole("button", { name: "Next puzzle" }));
    expect(screen.queryByRole("region", { name: "Discard ranking" })).toBeNull();

    const nextHand = screen
      .getByRole("region", { name: "Your hand" })
      .querySelectorAll<HTMLButtonElement>("button.dt-tile-btn");
    expect(nextHand.length).toBeGreaterThan(0);
    expect(nextHand[0].disabled).toBe(false);
    expect(nextHand[0].textContent).toBeTruthy();
    // A fresh puzzle loaded (a different first tile, or a new hand length).
    expect(
      nextHand[0].textContent !== firstHand || nextHand.length !== discardButtons.length,
    ).toBe(true);
  });
});
