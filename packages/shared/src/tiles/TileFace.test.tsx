// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TileFace, TileBack } from "./TileFace.tsx";
import { tileLabel } from "./parseTile.ts";

afterEach(cleanup);

describe("TileFace", () => {
  it.each([
    ["characters-5-1", "char", "5 characters"],
    ["dots-3-2", "dot", "3 dots"],
    ["bamboo-7-1", "bam", "7 bamboo"],
    ["honor-east-1", "wind", "east"],
    ["honor-red-1", "dragon", "red"],
    ["flower-plum-1", "flower", "plum"],
  ])("renders %s with the right glyph and tileLabel aria-label", (tile, suit, label) => {
    const { container } = render(<TileFace tile={tile} />);
    const face = screen.getByRole("img", { name: label });
    expect(face.getAttribute("data-suit")).toBe(suit);
    expect(face.getAttribute("aria-label")).toBe(tileLabel(tile));
    expect(container.querySelector(`[data-glyph]`)).not.toBeNull();
  });

  it("keeps aria-label parity with tileLabel for every rendered tile", () => {
    const tile = "dots-9-3";
    render(<TileFace tile={tile} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(tileLabel(tile));
  });

  it("renders a face-down back with no tile label", () => {
    const { container } = render(<TileFace tile="dots-1-1" faceDown />);
    const back = container.querySelector('[data-face="down"]');
    expect(back).not.toBeNull();
    expect(back?.getAttribute("aria-label")).toBeNull();
    expect(container.querySelector("[data-suit]")).toBeNull();
  });

  it("suppresses the accessible name when decorative", () => {
    const { container } = render(<TileFace tile="bamboo-2-1" decorative />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector('[data-suit="bam"]')).not.toBeNull();
  });

  it("renders count backs with a single accessible tile count", () => {
    render(<TileBack count={16} />);
    const backs = screen.getByRole("img", { name: "16 concealed tiles" });
    expect(backs.querySelectorAll('[data-face="down"]')).toHaveLength(16);
  });
});
