import { describe, it, expect } from 'vitest';
import { DEFAULT_TAIWANESE_RULES } from '../rules/taiwanese.ts';
import type { GameConfig, GameState } from './state.ts';
import { getPlayer } from './state.ts';
import { createGame } from './deal.ts';
import { applyAction } from './reducer.ts';

const rules = DEFAULT_TAIWANESE_RULES;

function config(seed: string): GameConfig {
  return { rules, seed, dealer: 0, roundWind: 'E' };
}

// qa scenario: mahjong-full-hand-e2e
describe('mahjong-full-hand-e2e', () => {
  it('plays a scripted no-claims hand from the deal to a terminal outcome', () => {
    let state: GameState = createGame(config('e2e-hand'));
    const dealt = applyAction(state, { type: 'DEAL' });
    expect(dealt.ok).toBe(true);
    if (!dealt.ok) {
      return;
    }
    state = dealt.state;

    let guard = 0;
    while (state.phase !== 'FINISHED' && guard < 1000) {
      guard += 1;
      if (state.pendingClaim) {
        const seat = state.pendingClaim.pending[0];
        const passed = applyAction(state, { type: 'PASS_CLAIM', player: seat });
        expect(passed.ok).toBe(true);
        if (!passed.ok) {
          return;
        }
        state = passed.state;
        continue;
      }
      const player = state.turn.player;
      if (state.turn.phase === 'NEEDS_DISCARD') {
        const held = getPlayer(state, player);
        const tile = state.turn.drawnTile ?? held.hand[held.hand.length - 1];
        const result = applyAction(state, { type: 'DISCARD', player, tile });
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        state = result.state;
      } else {
        const result = applyAction(state, { type: 'DRAW', player });
        expect(result.ok).toBe(true);
        if (!result.ok) {
          return;
        }
        state = result.state;
      }
    }

    expect(state.phase).toBe('FINISHED');
    expect(state.outcome?.kind).toBe('DRAW');

    const seqs = state.events.map((event) => event.seq);
    const expected = Array.from({ length: seqs.length }, (_, index) => index);
    expect(seqs).toEqual(expected);
    expect(state.events.at(-1)?.type).toBe('WALL_EXHAUSTED');
    expect(state.nextSeq).toBe(state.events.length);
  });
});
