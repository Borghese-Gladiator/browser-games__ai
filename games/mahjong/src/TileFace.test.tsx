// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
// The board consumes the shared tile module through this local barrel. This test
// proves the re-export resolves and that roles and accessible names are intact.
import { TileFace, TileBack } from "./TileFace.tsx";
import { tileLabel } from "./tiles.ts";

afterEach(cleanup);

describe("board tile barrel", () => {
  it("re-exports a TileFace whose accessible name is the tileLabel", () => {
    render(<TileFace tile="characters-5-1" />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(tileLabel("characters-5-1"));
  });

  it("re-exports a TileBack that exposes only a tile count", () => {
    render(<TileBack count={16} />);
    expect(screen.getByRole("img", { name: "16 concealed tiles" })).toBeTruthy();
  });
});
