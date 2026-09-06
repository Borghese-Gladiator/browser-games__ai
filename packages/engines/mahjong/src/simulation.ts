import { DEFAULT_TAIWANESE_RULES } from './rules/taiwanese.js';
import type { GameConfig, GameState, PlayerId } from './game/state.js';
import { createGame } from './game/deal.js';
import { applyAction } from './game/reducer.js';
import { getAvailableActions } from './game/getAvailableActions.js';
import { assertValidGameState, InvalidGameStateError } from './assertValidGameState.js';
import { createRandomAi, createRng } from './ai/random.js';

export interface SimulationStats {
  readonly gamesPlayed: number;
  readonly completions: number;
  readonly crashes: number;
  readonly invalidStates: number;
  readonly averageTurns: number;
  readonly selfDrawRate: number;
  readonly discardWinRate: number;
  readonly exhaustiveDrawRate: number;
  readonly firstFailingSeed: number | null;
}

type OutcomeKind =
  | 'self-draw'
  | 'discard-win'
  | 'exhaustive-draw'
  | 'crash'
  | 'invalid-state'
  | 'stall';

interface GameOutcome {
  readonly kind: OutcomeKind;
  readonly turns: number;
  readonly seed: number;
}

const STEP_CAP = 5000;

function baseConfig(seed: number): GameConfig {
  return { rules: DEFAULT_TAIWANESE_RULES, seed, dealer: 0, roundWind: 'E' };
}

function countDiscards(state: GameState): number {
  let total = 0;
  for (const event of state.events) {
    if (event.type === 'TILE_DISCARDED') {
      total += 1;
    }
  }
  return total;
}

function chooseActingSeat(state: GameState): PlayerId | null {
  if (state.pendingClaim) {
    for (const seat of state.pendingClaim.pending) {
      if (getAvailableActions(state, seat).length > 0) {
        return seat;
      }
    }
    return null;
  }
  const turnSeat = state.turn.player;
  if (getAvailableActions(state, turnSeat).length > 0) {
    return turnSeat;
  }
  for (let seat = 0; seat < state.rules.playerCount; seat++) {
    if (getAvailableActions(state, seat as PlayerId).length > 0) {
      return seat as PlayerId;
    }
  }
  return null;
}

function terminalOutcome(state: GameState, seed: number): GameOutcome {
  const turns = countDiscards(state);
  if (state.outcome && state.outcome.kind === 'WIN') {
    let selfDraw = false;
    for (let index = state.events.length - 1; index >= 0; index--) {
      const event = state.events[index];
      if (event.type === 'HAND_WON') {
        selfDraw = event.selfDraw;
        break;
      }
    }
    return { kind: selfDraw ? 'self-draw' : 'discard-win', turns, seed };
  }
  if (state.outcome && state.outcome.kind === 'DRAW') {
    return { kind: 'exhaustive-draw', turns, seed };
  }
  return { kind: 'crash', turns, seed };
}

function playOneGame(seed: number): GameOutcome {
  const rng = createRng(seed);
  const ai = createRandomAi();
  try {
    let state = createGame(baseConfig(seed));
    const dealt = applyAction(state, { type: 'DEAL' });
    if (!dealt.ok) {
      return { kind: 'crash', turns: 0, seed };
    }
    state = dealt.state;
    assertValidGameState(state, { seed, turn: 0 });
    let steps = 0;
    while (state.phase === 'PLAYING') {
      steps += 1;
      if (steps > STEP_CAP) {
        return { kind: 'crash', turns: countDiscards(state), seed };
      }
      const seat = chooseActingSeat(state);
      if (seat === null) {
        return { kind: 'stall', turns: countDiscards(state), seed };
      }
      const actions = getAvailableActions(state, seat);
      const action = ai(state, actions, rng);
      const result = applyAction(state, action);
      if (!result.ok) {
        return { kind: 'crash', turns: countDiscards(state), seed };
      }
      state = result.state;
      assertValidGameState(state, { seed, turn: steps });
    }
    return terminalOutcome(state, seed);
  } catch (error) {
    if (error instanceof InvalidGameStateError) {
      return { kind: 'invalid-state', turns: 0, seed };
    }
    return { kind: 'crash', turns: 0, seed };
  }
}

function isFailure(kind: OutcomeKind): boolean {
  return kind === 'crash' || kind === 'invalid-state' || kind === 'stall';
}

function aggregate(outcomes: readonly GameOutcome[]): SimulationStats {
  const gamesPlayed = outcomes.length;
  let selfDraws = 0;
  let discardWins = 0;
  let exhaustiveDraws = 0;
  let crashes = 0;
  let invalidStates = 0;
  let completionTurns = 0;
  let firstFailingSeed: number | null = null;
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'self-draw':
        selfDraws += 1;
        completionTurns += outcome.turns;
        break;
      case 'discard-win':
        discardWins += 1;
        completionTurns += outcome.turns;
        break;
      case 'exhaustive-draw':
        exhaustiveDraws += 1;
        completionTurns += outcome.turns;
        break;
      case 'invalid-state':
        invalidStates += 1;
        break;
      case 'crash':
      case 'stall':
        crashes += 1;
        break;
    }
    if (isFailure(outcome.kind) && firstFailingSeed === null) {
      firstFailingSeed = outcome.seed;
    }
  }
  const completions = selfDraws + discardWins + exhaustiveDraws;
  const averageTurns = completions > 0 ? completionTurns / completions : 0;
  const rate = (count: number): number => (gamesPlayed > 0 ? count / gamesPlayed : 0);
  return {
    gamesPlayed,
    completions,
    crashes,
    invalidStates,
    averageTurns,
    selfDrawRate: rate(selfDraws),
    discardWinRate: rate(discardWins),
    exhaustiveDrawRate: rate(exhaustiveDraws),
    firstFailingSeed,
  };
}

export function runSimulation(gameCount: number, baseSeed: number): SimulationStats {
  const outcomes: GameOutcome[] = [];
  for (let index = 0; index < gameCount; index++) {
    const seed = baseSeed + index;
    const outcome = playOneGame(seed);
    outcomes.push(outcome);
    if (isFailure(outcome.kind)) {
      console.error(`mahjong simulation: failing game seed=${seed} kind=${outcome.kind}`);
    }
  }
  return aggregate(outcomes);
}

function formatStats(stats: SimulationStats): string {
  const percent = (value: number): string => `${(value * 100).toFixed(2)}%`;
  return [
    `games played:        ${stats.gamesPlayed}`,
    `completions:         ${stats.completions}`,
    `crashes:             ${stats.crashes}`,
    `invalid states:      ${stats.invalidStates}`,
    `average turns:       ${stats.averageTurns.toFixed(2)}`,
    `self-draw rate:      ${percent(stats.selfDrawRate)}`,
    `discard-win rate:    ${percent(stats.discardWinRate)}`,
    `exhaustive-draw:     ${percent(stats.exhaustiveDrawRate)}`,
    `first failing seed:  ${stats.firstFailingSeed === null ? 'none' : stats.firstFailingSeed}`,
  ].join('\n');
}

function parseArgs(argv: readonly string[]): { readonly gameCount: number; readonly baseSeed: number } {
  const numbers = argv.map(Number).filter((value) => Number.isFinite(value));
  const gameCount = numbers.length > 0 ? Math.floor(numbers[0]) : 1000;
  const baseSeed = numbers.length > 1 ? Math.floor(numbers[1]) : 1;
  return { gameCount, baseSeed };
}

export function main(argv: readonly string[]): void {
  const { gameCount, baseSeed } = parseArgs(argv);
  const stats = runSimulation(gameCount, baseSeed);
  console.log(`mahjong simulation: ${gameCount} games from seed ${baseSeed}`);
  console.log(formatStats(stats));
}
