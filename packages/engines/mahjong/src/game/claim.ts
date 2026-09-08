import type { Tile } from '../tiles/tile.js';
import type { Meld, MeldKind } from '../tiles/meld.js';
import { tileToKind } from '../tiles/tile-kind.js';
import { isWinningHand } from '../hand/winning.js';
import type { ClaimType } from '../rules/claims.js';
import { isChowSeat, resolveClaims } from '../rules/claims.js';
import type {
  ClaimDeclaration,
  ClaimOption,
  ClaimWindow,
  DiscardRef,
  GameOutcome,
  GameState,
  PlayerId,
} from './state.js';
import { getPlayer, withPlayer } from './state.js';
import type { ApplyResult } from './result.js';
import type { GameEventDraft } from './events.js';
import { recordEvent } from './events.js';
import { advanceDealer, dealerContinues, nextTurn } from './turn.js';
import { drawReplacement, finishAsDraw, replaceFlowers } from './deal.js';

function nonFlowerKind(tile: Tile): string | null {
  return tile.suit === 'flower' ? null : tileToKind(tile);
}

export function sameKind(a: Tile, b: Tile): boolean {
  const kind = nonFlowerKind(a);
  return kind !== null && kind === nonFlowerKind(b);
}

function isNumberSuit(tile: Tile): boolean {
  return tile.suit === 'characters' || tile.suit === 'bamboo' || tile.suit === 'dots';
}

export function chowCombos(hand: readonly Tile[], discard: Tile): Tile[][] {
  if (!isNumberSuit(discard) || discard.rank === undefined) {
    return [];
  }
  const rank = discard.rank;
  const pick = (target: number): Tile | undefined =>
    hand.find((tile) => tile.suit === discard.suit && tile.rank === target);
  const patterns: readonly [number, number][] = [
    [rank - 2, rank - 1],
    [rank - 1, rank + 1],
    [rank + 1, rank + 2],
  ];
  const combos: Tile[][] = [];
  for (const [a, b] of patterns) {
    const first = pick(a);
    const second = pick(b);
    if (first && second) {
      combos.push([first, second]);
    }
  }
  return combos;
}

export function concealedKongTiles(hand: readonly Tile[]): Tile[] {
  const counts = new Map<string, Tile>();
  const totals = new Map<string, number>();
  for (const tile of hand) {
    const kind = nonFlowerKind(tile);
    if (kind === null) {
      continue;
    }
    totals.set(kind, (totals.get(kind) ?? 0) + 1);
    if (!counts.has(kind)) {
      counts.set(kind, tile);
    }
  }
  const result: Tile[] = [];
  for (const [kind, total] of totals) {
    if (total >= 4) {
      const representative = counts.get(kind);
      if (representative) {
        result.push(representative);
      }
    }
  }
  return result;
}

export function eligibleClaims(state: GameState, discard: DiscardRef): readonly ClaimOption[] {
  const options: ClaimOption[] = [];
  for (let seat = 0; seat < state.rules.playerCount; seat++) {
    if (seat === discard.player) {
      continue;
    }
    const held = getPlayer(state, seat as PlayerId);
    const matches = held.hand.filter((tile) => sameKind(tile, discard.tile)).length;
    const kinds: ClaimType[] = [];
    const win = isWinningHand(
      { concealed: [...held.hand, discard.tile], exposedMelds: held.melds },
      state.rules,
    );
    if (win.winning) {
      kinds.push('WIN');
    }
    if (matches >= 3) {
      kinds.push('KONG');
    }
    if (matches >= 2) {
      kinds.push('PONG');
    }
    if (isChowSeat(seat, discard.player, state.rules) && chowCombos(held.hand, discard.tile).length > 0) {
      kinds.push('CHOW');
    }
    if (kinds.length > 0) {
      options.push({ seat: seat as PlayerId, kinds });
    }
  }
  return options;
}

export function windowOption(window: ClaimWindow, seat: PlayerId): ClaimOption | undefined {
  return window.eligible.find((option) => option.seat === seat);
}

function advanceToNextPlayer(state: GameState): ApplyResult {
  const advanced = nextTurn({ ...state, pendingClaim: null });
  const recorded = recordEvent(advanced, {
    type: 'TURN_ADVANCED',
    player: advanced.turn.player,
    phase: 'NEEDS_DRAW',
  });
  return { ok: true, state: recorded.state, events: [recorded.event] };
}

export function openClaimWindow(state: GameState, discard: DiscardRef): ApplyResult {
  const eligible = eligibleClaims(state, discard);
  if (eligible.length === 0) {
    return advanceToNextPlayer(state);
  }
  const window: ClaimWindow = {
    discard,
    eligible,
    declarations: [],
    pending: eligible.map((option) => option.seat),
  };
  const next: GameState = {
    ...state,
    pendingClaim: window,
    turn: { ...state.turn, phase: 'CLAIM_RESOLUTION' },
  };
  return { ok: true, state: next, events: [] };
}

export function registerClaim(state: GameState, declaration: ClaimDeclaration): GameState {
  const window = state.pendingClaim;
  if (!window) {
    return state;
  }
  return {
    ...state,
    pendingClaim: {
      ...window,
      declarations: [...window.declarations, declaration],
      pending: window.pending.filter((seat) => seat !== declaration.seat),
    },
  };
}

export function registerPass(state: GameState, player: PlayerId): GameState {
  const window = state.pendingClaim;
  if (!window) {
    return state;
  }
  return {
    ...state,
    pendingClaim: {
      ...window,
      pending: window.pending.filter((seat) => seat !== player),
    },
  };
}

export function buildExposedMeld(kind: MeldKind, discard: Tile, fromHand: readonly Tile[]): Meld {
  return { kind, tiles: [...fromHand, discard] };
}

function removeTilesById(hand: readonly Tile[], remove: readonly Tile[]): Tile[] {
  const result = [...hand];
  for (const tile of remove) {
    const index = result.findIndex((held) => held.id === tile.id);
    if (index !== -1) {
      result.splice(index, 1);
    }
  }
  return result;
}

function takeClaimedDiscard(state: GameState): { readonly state: GameState; readonly discard: DiscardRef } {
  const window = state.pendingClaim as ClaimWindow;
  const discarder = getPlayer(state, window.discard.player);
  const index = discarder.discards.map((tile) => tile.id).lastIndexOf(window.discard.tile.id);
  const discards =
    index === -1
      ? discarder.discards
      : [...discarder.discards.slice(0, index), ...discarder.discards.slice(index + 1)];
  const cleared = withPlayer(state, window.discard.player, { ...discarder, discards });
  return {
    state: { ...cleared, lastDiscard: null, pendingClaim: null },
    discard: window.discard,
  };
}

export function drawKongReplacement(state: GameState, player: PlayerId): ApplyResult {
  const drawn = drawReplacement(state);
  if (drawn.tile === null) {
    return finishAsDraw(state);
  }
  const tile = drawn.tile;
  const held = getPlayer(drawn.state, player);
  const withTile = withPlayer(drawn.state, player, { ...held, hand: [...held.hand, tile] });
  const recorded = recordEvent(withTile, { type: 'TILE_DRAWN', player, tile });
  const replaced = replaceFlowers(recorded.state, player);
  if (!replaced.ok) {
    return replaced;
  }
  if (replaced.exhausted) {
    const draw = finishAsDraw(replaced.state);
    if (!draw.ok) {
      return draw;
    }
    return {
      ok: true,
      state: draw.state,
      events: [recorded.event, ...replaced.events, ...draw.events],
    };
  }
  const finalHand = getPlayer(replaced.state, player).hand;
  const drawnTile = finalHand.length > 0 ? finalHand[finalHand.length - 1] : null;
  const withTurn: GameState = {
    ...replaced.state,
    currentPlayer: player,
    turn: { phase: 'NEEDS_DISCARD', player, drawnTile },
  };
  return { ok: true, state: withTurn, events: [recorded.event, ...replaced.events] };
}

export function finishWin(
  state: GameState,
  winner: PlayerId,
  selfDraw: boolean,
  discardedBy: PlayerId | null,
): ApplyResult {
  const dealerRepeats = dealerContinues(state, { kind: 'WIN', winner, dealerRepeats: false });
  const outcome: GameOutcome = { kind: 'WIN', winner, dealerRepeats };
  let current: GameState = { ...state, phase: 'FINISHED', outcome, pendingClaim: null };
  const won = recordEvent(current, { type: 'HAND_WON', player: winner, selfDraw, discardedBy });
  current = won.state;
  const events = [won.event];
  if (!dealerRepeats) {
    const previousDealer = state.dealer;
    const dealer = advanceDealer(state.rules, previousDealer);
    current = { ...current, dealer };
    const changed = recordEvent(current, { type: 'DEALER_CHANGED', previousDealer, dealer });
    current = changed.state;
    events.push(changed.event);
  }
  return { ok: true, state: current, events };
}

function applyClaimedMeld(
  state: GameState,
  declaration: ClaimDeclaration,
  kind: 'pong' | 'chow',
): ApplyResult {
  const seat = declaration.seat;
  const taken = takeClaimedDiscard(state);
  const held = getPlayer(taken.state, seat);
  const fromHand = declaration.tiles ?? [];
  const hand = removeTilesById(held.hand, fromHand);
  const meld = buildExposedMeld(kind, taken.discard.tile, fromHand);
  const updated: GameState = {
    ...withPlayer(taken.state, seat, { ...held, hand, melds: [...held.melds, meld] }),
    currentPlayer: seat,
    turn: { phase: 'NEEDS_DISCARD', player: seat, drawnTile: null },
  };
  const draft: GameEventDraft =
    kind === 'pong'
      ? { type: 'PONG_DECLARED', player: seat, tile: taken.discard.tile }
      : { type: 'CHOW_DECLARED', player: seat, discard: taken.discard.tile, tiles: meld.tiles };
  const recorded = recordEvent(updated, draft);
  return { ok: true, state: recorded.state, events: [recorded.event] };
}

function applyClaimedKong(state: GameState, declaration: ClaimDeclaration): ApplyResult {
  const seat = declaration.seat;
  const taken = takeClaimedDiscard(state);
  const held = getPlayer(taken.state, seat);
  const fromHand = declaration.tiles ?? [];
  const hand = removeTilesById(held.hand, fromHand);
  const meld = buildExposedMeld('kong', taken.discard.tile, fromHand);
  const updated: GameState = {
    ...withPlayer(taken.state, seat, { ...held, hand, melds: [...held.melds, meld] }),
    currentPlayer: seat,
    turn: { phase: 'NEEDS_DISCARD', player: seat, drawnTile: null },
  };
  const recorded = recordEvent(updated, {
    type: 'KONG_DECLARED',
    player: seat,
    tile: taken.discard.tile,
    concealed: false,
  });
  const replacement = drawKongReplacement(recorded.state, seat);
  if (!replacement.ok) {
    return replacement;
  }
  return { ok: true, state: replacement.state, events: [recorded.event, ...replacement.events] };
}

function applyClaimedWin(state: GameState, seat: PlayerId): ApplyResult {
  const window = state.pendingClaim as ClaimWindow;
  const discardTile = window.discard.tile;
  const discarder = window.discard.player;
  const taken = takeClaimedDiscard(state);
  const held = getPlayer(taken.state, seat);
  const withDiscard = withPlayer(taken.state, seat, { ...held, hand: [...held.hand, discardTile] });
  return finishWin(withDiscard, seat, false, discarder);
}

export function applyConcealedKong(state: GameState, player: PlayerId, tile: Tile): ApplyResult {
  const held = getPlayer(state, player);
  const kongTiles = held.hand.filter((candidate) => sameKind(candidate, tile)).slice(0, 4);
  const hand = removeTilesById(held.hand, kongTiles);
  const meld: Meld = { kind: 'kong', tiles: kongTiles };
  const updated: GameState = {
    ...withPlayer(state, player, { ...held, hand, melds: [...held.melds, meld] }),
    currentPlayer: player,
    turn: { phase: 'NEEDS_DISCARD', player, drawnTile: null },
  };
  const recorded = recordEvent(updated, { type: 'KONG_DECLARED', player, tile, concealed: true });
  const replacement = drawKongReplacement(recorded.state, player);
  if (!replacement.ok) {
    return replacement;
  }
  return { ok: true, state: replacement.state, events: [recorded.event, ...replacement.events] };
}

export function resolveClaimWindow(state: GameState): ApplyResult {
  const window = state.pendingClaim;
  if (!window) {
    return advanceToNextPlayer(state);
  }
  const claims = window.declarations.map((declaration) => ({
    seat: declaration.seat,
    type: declaration.kind,
  }));
  const winner = resolveClaims(claims, window.discard.player, state.rules);
  if (winner === null) {
    return advanceToNextPlayer({ ...state, pendingClaim: null });
  }
  const declaration = window.declarations.find(
    (candidate) => candidate.seat === winner.seat && candidate.kind === winner.type,
  ) as ClaimDeclaration;
  switch (declaration.kind) {
    case 'WIN':
      return applyClaimedWin(state, declaration.seat);
    case 'KONG':
      return applyClaimedKong(state, declaration);
    case 'PONG':
      return applyClaimedMeld(state, declaration, 'pong');
    case 'CHOW':
      return applyClaimedMeld(state, declaration, 'chow');
  }
}
