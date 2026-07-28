// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Portal } from "./Portal.jsx";

afterEach(cleanup);

describe("Portal", () => {
  it("renders the tagline", () => {
    render(<Portal />);
    expect(screen.getByText("Pick a game and play instantly.")).toBeTruthy();
  });
});
