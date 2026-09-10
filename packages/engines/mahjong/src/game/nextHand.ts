import type { GameEvent } from './events.ts';
import type { GameState, Wind } from './state.ts';
import type { ApplyResult } from './result.ts';
import { gameError } from './errors.ts';
import { recordEvent } from './events.ts';
import { advanceDealer } from './turn.ts';
import { createGame, dealHand } from './deal.ts';
import { seatWindsFor } from './outcome.ts';

const WINDS: readonly Wind[] = ['E', 'S', 'W', 'N'];

function advancePrevailingWind(wind: Wind, fullCircuit: boolean): Wind {
  if (!fullCircuit) {
    return wind;
  }
  const index = WINDS.indexOf(wind);
  return WINDS[(index + 1) % WINDS.length];
}

export function nextHand(state: GameState): ApplyResult {
  if (state.phase !== 'FINISHED' || !state.outcome) {
    return {
      ok: false,
      error: gameError('WRONG_PHASE', { type: 'NEXT_HAND' }, 'NEXT_HAND needs a finished hand'),
    };
  }
  const rules = state.rules;
  const dealerRepeats = state.outcome.dealerRepeats;
  const previousDealer = state.dealer;
  const dealer = dealerRepeats ? previousDealer : advanceDealer(rules, previousDealer);
  const fullCircuit = !dealerRepeats && dealer === state.config.dealer;
  const prevailingWind = advancePrevailingWind(state.roundWind, fullCircuit);
  const seatWinds = seatWindsFor(dealer, rules.playerCount);
  const scores = state.players.map((player) => player.score);

  const handIndex = state.events.filter((event) => event.type === 'HAND_DEALT').length;
  const seed = `${state.config.seed}#${handIndex}`;
  const fresh = createGame({ ...state.config, dealer, roundWind: prevailingWind, seed });
  const players = fresh.players.map((player, seat) => ({ ...player, score: scores[seat] }));
  let current: GameState = {
    ...fresh,
    config: state.config,
    players,
    events: state.events,
    nextSeq: state.nextSeq,
  };
  const recorded = recordEvent(current, {
    type: 'NEXT_HAND',
    dealer,
    prevailingWind,
    seatWinds,
    scores,
  });
  current = recorded.state;
  const dealt = dealHand(current);
  if (!dealt.ok) {
    return dealt;
  }
  const events: GameEvent[] = [recorded.event, ...dealt.events];
  return { ok: true, state: dealt.state, events };
}

export function replayScores(
  events: readonly GameEvent[],
  startingScore: number,
  playerCount: number,
): number[] {
  const scores = new Array(playerCount).fill(startingScore);
  for (const event of events) {
    if (event.type === 'HAND_WON') {
      event.deltas.forEach((delta, seat) => {
        scores[seat] += delta;
      });
    }
  }
  return scores;
}
