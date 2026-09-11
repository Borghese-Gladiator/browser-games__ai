import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES, replayScores } from '@browser-games/engine-mahjong';
import type {
  GameState as MahjongGameState,
  GameOutcome,
  PlayerState,
  ClaimWindow,
  Tile,
} from '@browser-games/engine-mahjong';
import { mahjongAdapter, type MahjongState } from './games.ts';
import { RoomManager } from './rooms.ts';

// Craft engine states directly so the adapter's seat-aware wrappers can be
// exercised without playing a full hand.

function tile(suit: Tile['suit'], rank: number, copy: number): Tile {
  return { id: `${suit}-${rank}-${copy}`, suit, rank };
}

function honor(kind: NonNullable<Tile['honor']>, copy: number): Tile {
  return { id: `honor-${kind}-${copy}`, suit: 'honor', honor: kind };
}

function player(partial: Partial<PlayerState> = {}): PlayerState {
  return { hand: [], melds: [], flowers: [], discards: [], score: 0, ...partial };
}

function makeGame(overrides: Partial<MahjongGameState> = {}): MahjongGameState {
  const rules = DEFAULT_TAIWANESE_RULES;
  return {
    config: { rules, seed: 1, dealer: 0, roundWind: 'E' },
    rules,
    wall: { tiles: [], drawIndex: 0, replacementIndex: -1 },
    players: [player(), player(), player(), player()],
    dealer: 0,
    currentPlayer: 0,
    roundWind: 'E',
    turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null },
    lastDiscard: null,
    pendingClaim: null,
    phase: 'PLAYING',
    outcome: null,
    events: [],
    nextSeq: 0,
    ...overrides,
  };
}

function wrap(game: MahjongGameState | null): MahjongState {
  return {
    players: [
      { id: 'p0', seat: 0, name: 'A' },
      { id: 'p1', seat: 1, name: 'B' },
      { id: 'p2', seat: 2, name: 'C' },
      { id: 'p3', seat: 3, name: 'D' },
    ],
    rules: DEFAULT_TAIWANESE_RULES,
    seed: 1,
    game,
    phase: game ? game.phase : 'lobby',
    activeSeat: game && game.pendingClaim ? -1 : game ? game.turn.player : -1,
  };
}

interface OpponentView {
  seat: number;
  count: number;
  melds: unknown[];
  flowers: string[];
  discards: string[];
}

interface PublicView {
  myHand: string[];
  opponents: OpponentView[];
  activeSeat: number;
  pendingSeats: number[];
}

describe('mahjong adapter publicState', () => {
  it('reveals only the requesting seat hand and hides every opponent hand', () => {
    const game = makeGame({
      players: [
        player({ hand: [tile('dots', 1, 1), tile('dots', 2, 1)] }),
        player({
          hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2), tile('bamboo', 5, 3)],
          discards: [tile('characters', 9, 1)],
        }),
        player({ hand: [honor('red', 1), honor('red', 2)] }),
        player({ hand: [tile('dots', 7, 1)] }),
      ],
    });
    const view = mahjongAdapter.engine.publicState(wrap(game), 0) as PublicView;

    expect(view.myHand).toEqual(['dots-1-1', 'dots-2-1']);

    const opponent = view.opponents.find((o) => o.seat === 1) as OpponentView;
    expect(opponent.count).toBe(3);
    expect(opponent.discards).toEqual(['characters-9-1']);
    // No concealed tile of any opponent leaks into the view.
    expect(JSON.stringify(view.opponents)).not.toContain('bamboo-5');
    expect(JSON.stringify(view.opponents)).not.toContain('honor-red');
    expect(Object.keys(opponent)).not.toContain('hand');
  });
});

describe('mahjong adapter pendingSeats and activeSeat', () => {
  it('is empty and points at the turn seat when no claim window is open', () => {
    const game = makeGame({ turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: null } });
    const state = wrap(game);
    expect(mahjongAdapter.pendingSeats?.(state)).toEqual([]);
    expect(mahjongAdapter.activeSeat?.(state)).toBe(0);
  });

  it('lists the open claimers and reports activeSeat -1 during a window', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [
        { seat: 1, kinds: ['CHOW'] },
        { seat: 2, kinds: ['PONG'] },
      ],
      declarations: [],
      pending: [1, 2],
    };
    const game = makeGame({
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });
    const state = wrap(game);
    expect(mahjongAdapter.pendingSeats?.(state)).toEqual([1, 2]);
    expect(mahjongAdapter.activeSeat?.(state)).toBe(-1);
  });
});

describe('mahjong adapter resolveWindow', () => {
  it('closes an expired window by claim precedence (pong beats chow)', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [
        { seat: 1, kinds: ['CHOW'] },
        { seat: 2, kinds: ['PONG'] },
      ],
      declarations: [
        { seat: 1, kind: 'CHOW', tiles: [tile('bamboo', 4, 1), tile('bamboo', 6, 1)] },
        { seat: 2, kind: 'PONG', tiles: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] },
      ],
      pending: [],
    };
    const game = makeGame({
      players: [
        player({ discards: [discard] }),
        player({ hand: [tile('bamboo', 4, 1), tile('bamboo', 6, 1)] }),
        player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] }),
        player(),
      ],
      lastDiscard: { player: 0, tile: discard },
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });

    const next = mahjongAdapter.resolveWindow?.(wrap(game)) as MahjongState;
    const resolved = next.game as MahjongGameState;

    expect(resolved.pendingClaim).toBeNull();
    // Pong outranks chow: seat 2 takes the tile, seat 1 gets nothing.
    expect(resolved.players[2].melds).toHaveLength(1);
    expect(resolved.players[2].melds[0].kind).toBe('pong');
    expect(resolved.players[1].melds).toHaveLength(0);
    expect(resolved.currentPlayer).toBe(2);
    expect(resolved.turn.player).toBe(2);
  });
});

describe('mahjong adapter onMessage', () => {
  it('rejects a malformed or non-owned tile id and applies a legal discard', () => {
    const game = makeGame({
      players: [
        player({ hand: [tile('dots', 1, 1), tile('dots', 2, 1)] }),
        player({ hand: [tile('bamboo', 5, 1)] }),
        player(),
        player(),
      ],
      turn: { phase: 'NEEDS_DISCARD', player: 0, drawnTile: tile('dots', 2, 1) },
    });
    const state = wrap(game);

    // Malformed id (not a string).
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 123 })).toThrow();
    // Well-formed id the player does not hold.
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 'dots-9-9' })).toThrow();
    // A tile that belongs to an opponent, not to seat 0.
    expect(() => mahjongAdapter.onMessage(state, 'p0', { discard: 'bamboo-5-1' })).toThrow();

    // A legal discard of an owned tile succeeds.
    const next = mahjongAdapter.onMessage(state, 'p0', { discard: 'dots-1-1' });
    const resolved = next.game as MahjongGameState;
    expect(resolved.players[0].hand.map((t) => t.id)).not.toContain('dots-1-1');
    expect(resolved.players[0].discards.map((t) => t.id)).toContain('dots-1-1');
  });
});

describe('mahjong AI seat fill', () => {
  it('fills the empty seats with bots and deals when the host starts early', () => {
    const manager = new RoomManager({
      mahjong: mahjongAdapter,
    });
    const room = manager.createRoom('mahjong');
    room.addPlayer('h0', 'Alice', null);
    room.addPlayer('h1', 'Bob', null);
    expect(room.playerCount).toBe(2);

    // The shared AI-seat-fill control: the host starts with two humans and the
    // remaining seats fill with bots. minPlayers is 2, so this is allowed.
    room.startEarly('h0');

    expect(room.isFull).toBe(true);
    expect(room.botSeats.size).toBe(2);
    const state = room.state as MahjongState;
    expect(state.game).not.toBeNull();
    expect(state.phase).toBe('PLAYING');
    // Every seat drew a full concealed hand: the deal really ran.
    for (const seatPlayer of (state.game as MahjongGameState).players) {
      expect(seatPlayer.hand.length).toBeGreaterThan(0);
    }
  });
});

interface RevealEntry {
  seat: number;
  hand: string[];
  melds: unknown[];
  flowers: string[];
}

interface FullView extends PublicView {
  scores: number[];
  result: unknown;
  reveal: RevealEntry[] | null;
}

// Seed a four-seat table and deal the first hand through the adapter with a
// fixed seed so a playthrough is deterministic and replayable.
function seedTable(seed: number): MahjongState {
  let state = mahjongAdapter.engine.createGame() as MahjongState;
  for (let i = 0; i < 4; i += 1) {
    state = mahjongAdapter.engine.addPlayer(state, { id: `p${i}`, name: `P${i}` }) as MahjongState;
  }
  state = { ...state, seed };
  return mahjongAdapter.autoStart!(state) as MahjongState;
}

// One deterministic step: pass every open claim, else draw or discard the just
// drawn tile. Every move flows back through onMessage, so nothing bypasses the
// engine. timeoutAction never declares a claim, so a hand ends by self-draw win
// or wall exhaustion from the seed alone.
function autoStep(state: MahjongState): MahjongState {
  const game = state.game as MahjongGameState;
  if (game.pendingClaim) {
    let next = state;
    for (const seat of [...game.pendingClaim.pending]) {
      const current = next.game as MahjongGameState;
      if (!current.pendingClaim || !current.pendingClaim.pending.includes(seat)) continue;
      next = mahjongAdapter.onMessage(next, `p${seat}`, { pass: true });
    }
    const after = next.game as MahjongGameState;
    return after.pendingClaim ? (mahjongAdapter.resolveWindow!(next) as MahjongState) : next;
  }
  const active = game.turn.player;
  const msg = mahjongAdapter.timeoutAction!(state, active);
  if (!msg) throw new Error(`no deterministic move for seat ${active}`);
  return mahjongAdapter.onMessage(state, `p${active}`, msg);
}

function playHand(state: MahjongState): MahjongState {
  let current = state;
  for (let i = 0; i < 8000; i += 1) {
    if ((current.game as MahjongGameState).phase === 'FINISHED') return current;
    current = autoStep(current);
  }
  throw new Error('hand did not finish');
}

function scoresOf(state: MahjongState): number[] {
  return (state.game as MahjongGameState).players.map((p) => p.score);
}

describe('mahjong adapter reveal projection and getOutcome', () => {
  it('hides every hand mid-hand and reveals all hands only once FINISHED', () => {
    const playing = wrap(
      makeGame({
        players: [
          player({ hand: [tile('dots', 1, 1), tile('dots', 2, 1)] }),
          player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] }),
          player({ hand: [honor('red', 1)] }),
          player({ hand: [tile('dots', 7, 1)] }),
        ],
      }),
    );
    const midView = mahjongAdapter.engine.publicState(playing, 0) as FullView;
    expect(midView.reveal).toBeNull();
    expect(mahjongAdapter.getOutcome?.(playing)).toBeNull();
    // No concealed opponent tile leaks while the hand is in progress.
    expect(JSON.stringify(midView.opponents)).not.toContain('bamboo-5');

    const outcome: GameOutcome = {
      kind: 'WIN',
      winner: 1,
      dealerRepeats: false,
      dealtInSeat: 2,
      winningTile: tile('bamboo', 5, 3),
      selfDraw: false,
      patterns: [],
      totalTai: 4,
      seats: [
        { seat: 0, delta: 0, score: 500 },
        { seat: 1, delta: 8, score: 508 },
        { seat: 2, delta: -8, score: 492 },
        { seat: 3, delta: 0, score: 500 },
      ],
    };
    const finished = wrap(
      makeGame({
        players: [
          player({ hand: [tile('dots', 1, 1)], score: 500 }),
          player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)], score: 508 }),
          player({ hand: [honor('red', 1)], score: 492 }),
          player({ hand: [tile('dots', 7, 1)], score: 500 }),
        ],
        phase: 'FINISHED',
        outcome,
      }),
    );

    const finishedView = mahjongAdapter.engine.publicState(finished, 0) as FullView;
    const reveal = finishedView.reveal as RevealEntry[];
    expect(reveal).toHaveLength(4);
    expect(reveal.map((r) => r.seat)).toEqual([0, 1, 2, 3]);
    expect(reveal[1].hand).toEqual(['bamboo-5-1', 'bamboo-5-2']);
    expect(reveal[2].hand).toEqual(['honor-red-1']);

    // The per-seat result forwards the engine settlement so the board's hand-end
    // screen renders it without recomputing scoring: winner, the winning tile as
    // an id, the tai total and every seat delta and running score.
    const settlement = finishedView.result as {
      kind: string;
      winner: number | null;
      dealtInSeat: number | null;
      winningTile: string | null;
      selfDraw: boolean;
      totalTai: number;
      seats: { seat: number; delta: number; score: number }[];
    };
    expect(settlement.kind).toBe('WIN');
    expect(settlement.winner).toBe(1);
    expect(settlement.dealtInSeat).toBe(2);
    expect(settlement.winningTile).toBe('bamboo-5-3');
    expect(settlement.selfDraw).toBe(false);
    expect(settlement.totalTai).toBe(4);
    expect(settlement.seats).toHaveLength(4);
    expect(settlement.seats[1]).toEqual({ seat: 1, delta: 8, score: 508 });
    expect(settlement.seats.reduce((sum, s) => sum + s.delta, 0)).toBe(0);

    const result = mahjongAdapter.getOutcome?.(finished);
    expect(result).not.toBeNull();
    const winner = result!.outcomes.find((o) => o.playerId === 'p1')!;
    const loser = result!.outcomes.find((o) => o.playerId === 'p2')!;
    expect(winner.rank).toBe(1);
    expect(winner.score).toBe(508);
    expect(winner.meta.delta).toBe(8);
    expect(loser.rank).toBe(2);
    expect(loser.score).toBe(492);
    expect(loser.meta.delta).toBe(-8);
  });
});

describe('mahjong adapter next hand carries scores and rotates the dealer', () => {
  it('drives NEXT_HAND on a non-dealer win, rotating the dealer and carrying scores', () => {
    const outcome: GameOutcome = {
      kind: 'WIN',
      winner: 1,
      dealerRepeats: false,
      dealtInSeat: 2,
      winningTile: tile('bamboo', 5, 3),
      selfDraw: false,
      patterns: [],
      totalTai: 4,
      seats: [
        { seat: 0, delta: 0, score: 500 },
        { seat: 1, delta: 8, score: 508 },
        { seat: 2, delta: -8, score: 492 },
        { seat: 3, delta: 0, score: 500 },
      ],
    };
    const finished = wrap(
      makeGame({
        players: [
          player({ hand: [tile('dots', 1, 1)], score: 500 }),
          player({ hand: [tile('bamboo', 5, 1)], score: 508 }),
          player({ hand: [honor('red', 1)], score: 492 }),
          player({ hand: [tile('dots', 7, 1)], score: 500 }),
        ],
        dealer: 0,
        phase: 'FINISHED',
        outcome,
      }),
    );

    const next = mahjongAdapter.onMessage(finished, 'p0', { restart: true });
    const game = next.game as MahjongGameState;
    // The dealer rotated off seat 0 because the non-dealer won.
    expect(game.dealer).toBe(1);
    expect(game.phase).toBe('PLAYING');
    // Every seat carried its settled score into the new hand.
    expect(game.players.map((p) => p.score)).toEqual([500, 508, 492, 500]);
    // A single event log spans hands: a NEXT_HAND event was appended.
    expect(game.events.some((e) => e.type === 'NEXT_HAND')).toBe(true);
    // The new hand hides every hand again.
    const view = mahjongAdapter.engine.publicState(next, 0) as FullView;
    expect(view.reveal).toBeNull();
  });
});

describe('mahjong adapter multi-hand playthrough', () => {
  it('plays two hands end to end, carries scores, and a replay reproduces them', () => {
    const first = seedTable(20260908);

    // Mid-hand: no reveal, no leaked opponent tile.
    const opening = mahjongAdapter.engine.publicState(first, 0) as FullView;
    expect(opening.reveal).toBeNull();
    expect(opening.scores).toEqual([500, 500, 500, 500]);
    expect((first.game as MahjongGameState).phase).toBe('PLAYING');

    const handOne = playHand(first);
    expect((handOne.game as MahjongGameState).phase).toBe('FINISHED');
    // FINISHED: every seat's final hand is revealed and getOutcome is populated.
    const revealed = mahjongAdapter.engine.publicState(handOne, 0) as FullView;
    expect(revealed.reveal).not.toBeNull();
    expect((revealed.reveal as RevealEntry[])).toHaveLength(4);
    expect(mahjongAdapter.getOutcome?.(handOne)).not.toBeNull();
    const scoresAfterOne = scoresOf(handOne);

    // The next hand starts with the carried scores and hides the hands again.
    const secondStart = mahjongAdapter.onMessage(handOne, 'p0', { restart: true });
    expect(scoresOf(secondStart)).toEqual(scoresAfterOne);
    expect((secondStart.game as MahjongGameState).phase).toBe('PLAYING');
    const secondView = mahjongAdapter.engine.publicState(secondStart, 0) as FullView;
    expect(secondView.reveal).toBeNull();
    // One event log spans both hands.
    const secondGame = secondStart.game as MahjongGameState;
    expect(secondGame.events.some((e) => e.type === 'NEXT_HAND')).toBe(true);
    expect(secondGame.events.filter((e) => e.type === 'HAND_DEALT').length).toBe(2);

    const handTwo = playHand(secondStart);
    const finalScores = scoresOf(handTwo);
    // The single event log alone reproduces the final scores.
    expect(replayScores((handTwo.game as MahjongGameState).events, 500, 4)).toEqual(finalScores);

    // A fresh deterministic playthrough from the same seed reproduces the scores.
    const replayFinal = playHand(mahjongAdapter.onMessage(playHand(seedTable(20260908)), 'p0', { restart: true }));
    expect(scoresOf(replayFinal)).toEqual(finalScores);
  });
});

describe('mahjong claim window is not blocked by bots or passers', () => {
  it('auto-passes a pending seat on a timeout and always answers for a bot', () => {
    const discard = tile('bamboo', 5, 3);
    const window: ClaimWindow = {
      discard: { player: 0, tile: discard },
      eligible: [{ seat: 1, kinds: ['PONG'] }],
      declarations: [],
      pending: [1],
    };
    const game = makeGame({
      players: [
        player({ discards: [discard] }),
        player({ hand: [tile('bamboo', 5, 1), tile('bamboo', 5, 2)] }),
        player(),
        player(),
      ],
      lastDiscard: { player: 0, tile: discard },
      pendingClaim: window,
      turn: { phase: 'CLAIM_RESOLUTION', player: 0, drawnTile: null },
    });
    const state = wrap(game);

    // A dark or idle seat is auto-passed at the deadline, so it cannot stall.
    expect(mahjongAdapter.timeoutAction?.(state, 1)).toEqual({ pass: true });
    // A bot always answers the window (a pass or a claim), never leaving it open.
    expect(mahjongAdapter.botMove?.(state, 1)).not.toBeNull();
  });
});
