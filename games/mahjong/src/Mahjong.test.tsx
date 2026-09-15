// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// The board reads everything from useGameSocket, so a stub socket drives the UI
// without a real gateway. Each test overrides the return value.
const socket = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@browser-games/game-client/useGameSocket", () => ({
  useGameSocket: () => socket.value,
}));

import { Mahjong } from "./Mahjong.tsx";

afterEach(cleanup);

// A seated, mid-hand view for seat 1. Opponents expose counts and public melds
// or discards only — never a concealed hand — matching the publicState
// projection the gateway sends.
interface TestMeld {
  kind: string;
  tiles: string[];
}
interface TestAction {
  type: string;
  tile?: string;
  label: string;
}
interface TestOpponent {
  seat: number;
  name: string;
  count: number;
  melds: TestMeld[];
  flowers: string[];
  discards: string[];
}

function tableView() {
  return {
    phase: "PLAYING",
    activeSeat: 0,
    pendingSeats: [],
    wallCount: 42,
    lastDiscard: null,
    players: [
      { seat: 0, name: "Alice" },
      { seat: 1, name: "Me" },
      { seat: 2, name: "Bot 1" },
      { seat: 3, name: "Bot 2" },
    ],
    mySeat: 1,
    myHand: ["dots-1-1", "dots-2-1", "bamboo-5-3"],
    myMelds: [] as TestMeld[],
    myFlowers: [] as string[],
    myDiscards: [] as string[],
    opponents: [
      { seat: 0, name: "Alice", count: 16, melds: [], flowers: [], discards: ["characters-9-1"] },
      { seat: 2, name: "Bot 1", count: 16, melds: [], flowers: [], discards: [] },
      { seat: 3, name: "Bot 2", count: 16, melds: [], flowers: [], discards: [] },
    ] as TestOpponent[],
    availableActions: [] as TestAction[],
    result: null,
    isHost: false,
  };
}

function stubSocket(overrides: Record<string, unknown> = {}) {
  return {
    rooms: [],
    room: { code: "ABCD", seat: 1, isHost: false, options: {} },
    error: "",
    listRooms: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    quickMatch: vi.fn(),
    spectate: vi.fn(),
    startEarly: vi.fn(),
    lockRoom: vi.fn(),
    leaveRoom: vi.fn(),
    send: vi.fn(),
    restart: vi.fn(),
    needsRefresh: false,
    gameState: tableView(),
    ...overrides,
  };
}

describe("Mahjong board", () => {
  it("calls leaveRoom when the Leave control is pressed", () => {
    const leaveRoom = vi.fn();
    socket.value = stubSocket({ leaveRoom });
    render(<Mahjong />);

    fireEvent.click(screen.getByRole("button", { name: "Leave" }));

    expect(leaveRoom).toHaveBeenCalledTimes(1);
  });

  it("renders no opponent concealed tiles; only the local seat has hand tiles", () => {
    socket.value = stubSocket();
    const { container } = render(<Mahjong />);

    // The only interactive concealed tiles are the local seat's hand.
    const handTiles = container.querySelectorAll('section[aria-label="Your hand"] .mj-tile-btn');
    expect(handTiles).toHaveLength(3);
    // No opponent area ever renders a concealed hand tile.
    expect(container.querySelectorAll(".mj-opponent .mj-tile-btn")).toHaveLength(0);
    // An opponent's concealed count is shown as backs, not as a number.
    const backs = screen.getByLabelText("Opponent Alice").querySelectorAll('[data-face="down"]');
    expect(backs.length).toBeGreaterThan(0);
  });

  it("composes the felt table with the HUD, centre wall, and the tai panel", () => {
    socket.value = stubSocket();
    render(<Mahjong />);

    expect(screen.getByLabelText("Table")).toBeTruthy();
    expect(screen.getByLabelText("Game status")).toBeTruthy();
    // Tiles-left reads from wallCount, honestly, not a fabricated value.
    expect(screen.getByLabelText("Game status").textContent).toContain("42");
    expect(screen.getByLabelText("Centre").textContent).toContain("42");
    expect(screen.getByLabelText("Tai")).toBeTruthy();
  });

  it("shows every seat's melds and flowers face up", () => {
    const view = tableView();
    view.opponents[0].melds = [{ kind: "pong", tiles: ["honor-south-1", "honor-south-2", "honor-south-3"] }];
    view.opponents[0].flowers = ["flower-plum-1"];
    view.myMelds = [{ kind: "pong", tiles: ["dots-4-1", "dots-4-2", "dots-4-3"] }];
    view.myFlowers = ["flower-spring-1"];
    socket.value = stubSocket({ gameState: view });
    render(<Mahjong />);

    expect(screen.getByLabelText("Alice melds").querySelectorAll("[data-tile]")).toHaveLength(3);
    expect(screen.getByLabelText("Alice flowers").querySelectorAll("[data-tile]")).toHaveLength(1);
    expect(screen.getByLabelText("Your melds").querySelectorAll("[data-tile]")).toHaveLength(3);
    expect(screen.getByLabelText("Your flowers").querySelectorAll("[data-tile]")).toHaveLength(1);
  });

  it("puts every seat's discards in the centre river, not beside the seat", () => {
    const view = tableView();
    view.myDiscards = ["bamboo-2-1"];
    socket.value = stubSocket({ gameState: view });
    render(<Mahjong />);

    const centre = screen.getByLabelText("Centre");
    // Alice discarded characters-9-1 (see tableView) and this seat bamboo-2-1.
    expect(centre.querySelector('[data-tile="characters-9-1"]')).toBeTruthy();
    expect(centre.querySelector('[data-tile="bamboo-2-1"]')).toBeTruthy();
    // The seat areas hold no discard row any more.
    expect(screen.getByLabelText("Opponent Alice").querySelector("[data-tile]")).toBeNull();
  });

  it("reports the visible copies of a hand tile only while it is pointed at", () => {
    socket.value = stubSocket();
    render(<Mahjong />);

    expect(screen.queryByLabelText("Visible copies")).toBeNull();

    const tile = screen.getByLabelText("Your hand").querySelector(".mj-hand > li");
    fireEvent.mouseEnter(tile!);
    const pop = screen.getByLabelText("Visible copies");
    expect(pop.textContent).toContain("1 dots");
    // Nothing public shows a 1-dot yet, so all four copies are still live.
    expect(pop.textContent).toContain("0 seen");
    expect(pop.textContent).toContain("4 left");

    fireEvent.mouseLeave(tile!);
    expect(screen.queryByLabelText("Visible copies")).toBeNull();
  });

  // The board's turn announcement is the one status on the page. A second one
  // makes every getByRole("status") ambiguous, which silently blinds the E2E
  // specs that read the turn from it.
  it("keeps the turn announcement as the only status role, popover open or not", () => {
    socket.value = stubSocket();
    render(<Mahjong />);
    expect(screen.getAllByRole("status")).toHaveLength(1);

    const tile = screen.getByLabelText("Your hand").querySelector(".mj-hand > li");
    fireEvent.mouseEnter(tile!);
    expect(screen.getByLabelText("Visible copies")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("inspects a tile the seat cannot discard right now", () => {
    // availableActions is empty, so every hand tile is disabled. A disabled
    // button fires no pointer events, so the row owns the hover.
    socket.value = stubSocket();
    render(<Mahjong />);

    const tiles = screen.getByLabelText("Your hand").querySelectorAll(".mj-hand > li");
    expect(tiles[0].querySelector("button")).toHaveProperty("disabled", true);
    fireEvent.mouseEnter(tiles[0]);
    expect(screen.getByLabelText("Visible copies")).toBeTruthy();
  });

  it("inspects a tile from the keyboard", () => {
    const view = tableView();
    view.activeSeat = 1;
    view.availableActions = [{ type: "discard", tile: "dots-1-1", label: "Discard 1 dots" }];
    socket.value = stubSocket({ gameState: view });
    render(<Mahjong />);

    const btn = screen.getByRole("button", { name: "Discard 1 dots" });
    fireEvent.focus(btn);
    expect(screen.getByLabelText("Visible copies").textContent).toContain("1 dots");
    fireEvent.blur(btn);
    expect(screen.queryByLabelText("Visible copies")).toBeNull();
  });

  it("draws on its own when a draw is the only action, and never twice", () => {
    const send = vi.fn();
    const view = tableView();
    view.activeSeat = 1;
    view.availableActions = [{ type: "draw", label: "Draw" }];
    socket.value = stubSocket({ gameState: view, send });
    const { rerender } = render(<Mahjong />);

    expect(send).toHaveBeenCalledWith({ draw: true });
    // No Draw control is ever offered to the player.
    expect(screen.queryByRole("button", { name: "Draw" })).toBeNull();

    // A re-render on the same turn must not send a second draw.
    rerender(<Mahjong />);
    expect(send).toHaveBeenCalledTimes(1);
  });

  // A kong replacement draws from the back of the wall, and a new hand rewinds
  // the wall, so neither the turn nor the wall count is unique per draw. The
  // board must draw again on the next draw-only state whatever those read.
  it("draws again on the next draw-only turn, even with the same seat and wall", () => {
    const send = vi.fn();
    const drawOnly = () => {
      const v = tableView();
      v.activeSeat = 1;
      v.availableActions = [{ type: "draw", label: "Draw" }];
      return v;
    };
    socket.value = stubSocket({ gameState: drawOnly(), send });
    const { rerender } = render(<Mahjong />);
    expect(send).toHaveBeenCalledTimes(1);

    // The draw lands: the seat now has a discard to make.
    const discarding = tableView();
    discarding.activeSeat = 1;
    discarding.availableActions = [
      { type: "discard", tile: "dots-1-1", label: "Discard 1 dots" },
    ];
    socket.value = stubSocket({ gameState: discarding, send });
    rerender(<Mahjong />);
    expect(send).toHaveBeenCalledTimes(1);

    // Draw-only again, with an identical seat and wall count.
    socket.value = stubSocket({ gameState: drawOnly(), send });
    rerender(<Mahjong />);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ draw: true });
  });

  it("does not draw when the seat has a real decision to make", () => {
    const send = vi.fn();
    const view = tableView();
    view.activeSeat = 1;
    view.availableActions = [
      { type: "win", label: "Win" },
      { type: "discard", tile: "dots-1-1", label: "Discard 1 dots" },
    ];
    socket.value = stubSocket({ gameState: view, send });
    render(<Mahjong />);

    expect(send).not.toHaveBeenCalled();
  });
});
