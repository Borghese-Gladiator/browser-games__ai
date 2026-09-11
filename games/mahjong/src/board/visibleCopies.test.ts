import { describe, it, expect } from "vitest";
import { computeVisibleCopies } from "./visibleCopies.ts";

describe("computeVisibleCopies", () => {
  it("counts seen and remaining copies from public tiles", () => {
    const entries = computeVisibleCopies({
      opponentDiscards: [["dots-1-1"], ["dots-1-2", "bamboo-5-1"]],
      myDiscards: ["dots-1-3"],
      lastDiscard: "dots-1-3",
      visibleMelds: [],
      visibleFlowers: [],
    });
    const dots1 = entries.find((e) => e.kind === "1p");
    expect(dots1).toEqual({
      kind: "1p",
      tile: expect.stringMatching(/^dots-1-/),
      label: "1 dots",
      seen: 3,
      remaining: 1,
    });
    const bam5 = entries.find((e) => e.kind === "5s");
    expect(bam5?.seen).toBe(1);
    expect(bam5?.remaining).toBe(3);
  });

  it("does not double-count the lastDiscard already in a river", () => {
    const entries = computeVisibleCopies({
      opponentDiscards: [["honor-red-1"]],
      myDiscards: [],
      lastDiscard: "honor-red-1",
      visibleMelds: [],
      visibleFlowers: [],
    });
    expect(entries.find((e) => e.kind === "red")?.seen).toBe(1);
  });

  it("counts melds and flowers, and flowers have a single copy", () => {
    const entries = computeVisibleCopies({
      opponentDiscards: [],
      myDiscards: [],
      lastDiscard: undefined,
      visibleMelds: [["characters-2-1", "characters-2-2", "characters-2-3"]],
      visibleFlowers: ["flower-plum-1"],
    });
    expect(entries.find((e) => e.kind === "2m")?.seen).toBe(3);
    const plum = entries.find((e) => e.kind === "plum");
    expect(plum?.seen).toBe(1);
    expect(plum?.remaining).toBe(0);
  });

  it("never counts a concealed hand tile (it is not an input)", () => {
    const entries = computeVisibleCopies({
      opponentDiscards: [],
      myDiscards: [],
      lastDiscard: undefined,
      visibleMelds: [],
      visibleFlowers: [],
    });
    expect(entries).toHaveLength(0);
  });
});
