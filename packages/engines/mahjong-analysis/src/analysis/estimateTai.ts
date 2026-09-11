import type {
  EstimatedPattern,
  Meld,
  Position,
  Ruleset,
  TaiEstimate,
  Tier,
  Wind,
  WinningHand,
} from './types.ts';

const NUMBER_SUFFIXES = ['m', 's', 'p'] as const;
const HONOR_KINDS = ['east', 'south', 'west', 'north', 'red', 'green', 'white'] as const;
const DRAGON_KINDS = new Set(['red', 'green', 'white']);

const FLOWER_WIND: Record<string, Wind> = {
  plum: 'east',
  spring: 'east',
  orchid: 'south',
  summer: 'south',
  chrysanthemum: 'west',
  autumn: 'west',
  bamboo: 'north',
  winter: 'north',
};

function buildAllKinds(): string[] {
  const kinds: string[] = [];
  for (const suffix of NUMBER_SUFFIXES) {
    for (let rank = 1; rank <= 9; rank += 1) {
      kinds.push(`${rank}${suffix}`);
    }
  }
  for (const honor of HONOR_KINDS) {
    kinds.push(honor);
  }
  return kinds;
}

const ALL_KINDS = buildAllKinds();
const KIND_COUNT = ALL_KINDS.length;
const KIND_INDEX = new Map<string, number>();
ALL_KINDS.forEach((kind, index) => KIND_INDEX.set(kind, index));

interface MeldDef {
  indices: number[];
  type: 'pong' | 'chow';
}

function buildMeldDefs(): MeldDef[] {
  const defs: MeldDef[] = [];
  for (let index = 0; index < KIND_COUNT; index += 1) {
    defs.push({ indices: [index, index, index], type: 'pong' });
  }
  for (let suit = 0; suit < 3; suit += 1) {
    const base = suit * 9;
    for (let rank = 0; rank <= 6; rank += 1) {
      const anchor = base + rank;
      defs.push({ indices: [anchor, anchor + 1, anchor + 2], type: 'chow' });
    }
  }
  return defs;
}

const MELD_DEFS = buildMeldDefs();

const TOTAL_MELDS = 5;
const HARD_CAP = 4;
const WIN_CAP = 8000;

function countsFromKinds(kinds: string[]): Int16Array {
  const counts = new Int16Array(KIND_COUNT);
  for (const kind of kinds) {
    const index = KIND_INDEX.get(kind);
    if (index !== undefined) {
      counts[index] += 1;
    }
  }
  return counts;
}

function exposedCounts(melds: Meld[]): Int16Array {
  const counts = new Int16Array(KIND_COUNT);
  for (const meld of melds) {
    for (const tile of meld.tiles) {
      const index = KIND_INDEX.get(tile);
      if (index !== undefined) {
        counts[index] += 1;
      }
    }
  }
  return counts;
}

function tileCountKey(counts: Int16Array): string {
  return counts.join(',');
}

function expandCounts(counts: Int16Array): string[] {
  const tiles: string[] = [];
  for (let index = 0; index < KIND_COUNT; index += 1) {
    for (let copy = 0; copy < counts[index]; copy += 1) {
      tiles.push(ALL_KINDS[index]);
    }
  }
  return tiles;
}

interface RawWin {
  counts: Int16Array;
  distance: number;
  melds: Meld[];
}

function enumerateWins(
  concealed: Int16Array,
  exposed: Int16Array,
  meldsNeeded: number,
  budget: number,
): RawWin[] {
  const wins: RawWin[] = [];
  const seen = new Set<string>();
  const w = new Int16Array(KIND_COUNT);
  const remaining = Int16Array.from(concealed);
  const meldStack: Meld[] = [];
  let capped = false;

  function addTile(index: number): number {
    w[index] += 1;
    if (remaining[index] > 0) {
      remaining[index] -= 1;
      return 0;
    }
    return 1;
  }

  function removeTile(index: number, wasAdded: number): void {
    if (wasAdded === 0) {
      remaining[index] += 1;
    }
    w[index] -= 1;
  }

  function feasible(def: MeldDef): boolean {
    if (def.type === 'pong') {
      const index = def.indices[0];
      return w[index] + exposed[index] + 3 <= 4;
    }
    for (const index of def.indices) {
      if (w[index] + exposed[index] + 1 > 4) {
        return false;
      }
    }
    return true;
  }

  function recurse(startId: number, meldsLeft: number, added: number): void {
    if (capped || added > budget) {
      return;
    }
    if (meldsLeft === 0) {
      const key = tileCountKey(w);
      if (!seen.has(key)) {
        seen.add(key);
        wins.push({
          counts: Int16Array.from(w),
          distance: added,
          melds: meldStack.map((meld) => ({ type: meld.type, concealed: meld.concealed, tiles: [...meld.tiles] })),
        });
        if (wins.length >= WIN_CAP) {
          capped = true;
        }
      }
      return;
    }
    for (let id = startId; id < MELD_DEFS.length; id += 1) {
      const def = MELD_DEFS[id];
      if (!feasible(def)) {
        continue;
      }
      const flags: number[] = [];
      let delta = 0;
      for (const index of def.indices) {
        const flag = addTile(index);
        flags.push(flag);
        delta += flag;
      }
      if (added + delta <= budget) {
        meldStack.push({ tiles: def.indices.map((index) => ALL_KINDS[index]), type: def.type, concealed: true });
        recurse(id, meldsLeft - 1, added + delta);
        meldStack.pop();
      }
      for (let j = def.indices.length - 1; j >= 0; j -= 1) {
        removeTile(def.indices[j], flags[j]);
      }
      if (capped) {
        return;
      }
    }
  }

  for (let pairKind = 0; pairKind < KIND_COUNT; pairKind += 1) {
    if (w[pairKind] + exposed[pairKind] + 2 > 4) {
      continue;
    }
    const first = addTile(pairKind);
    const second = addTile(pairKind);
    const pairAdded = first + second;
    if (pairAdded <= budget) {
      meldStack.push({ tiles: [ALL_KINDS[pairKind], ALL_KINDS[pairKind]], type: 'pair', concealed: true });
      recurse(0, meldsNeeded, pairAdded);
      meldStack.pop();
    }
    removeTile(pairKind, second);
    removeTile(pairKind, first);
    if (capped) {
      break;
    }
  }

  return wins;
}

const reachableMemo = new Map<string, Map<number, WinningHand[]>>();

function reachableWins(position: Position): Map<number, WinningHand[]> {
  const meldsNeeded = TOTAL_MELDS - position.exposedMelds.length;
  const concealed = countsFromKinds(position.concealedTiles);
  const exposed = exposedCounts(position.exposedMelds);
  const key = `${tileCountKey(concealed)}|${tileCountKey(exposed)}|${meldsNeeded}`;
  const cached = reachableMemo.get(key);
  if (cached) {
    return cached;
  }

  const result = new Map<number, WinningHand[]>();
  if (meldsNeeded >= 0) {
    let minDist = -1;
    for (let budget = 0; budget <= HARD_CAP; budget += 1) {
      const raws = enumerateWins(concealed, exposed, meldsNeeded, budget);
      if (raws.length > 0) {
        minDist = Math.min(...raws.map((raw) => raw.distance));
        break;
      }
    }
    if (minDist >= 0) {
      const raws = enumerateWins(concealed, exposed, meldsNeeded, minDist + 1);
      for (const raw of raws) {
        if (raw.distance > minDist + 1) {
          continue;
        }
        const hand: WinningHand = { tiles: expandCounts(raw.counts), melds: raw.melds };
        const bucket = result.get(raw.distance) ?? [];
        bucket.push(hand);
        result.set(raw.distance, bucket);
      }
    }
  }

  reachableMemo.set(key, result);
  return result;
}

function guaranteedPatternIds(position: Position): Set<string> {
  const ids = new Set<string>();
  if (position.isDealer) {
    ids.add('dealer');
  }
  if (position.flowers.length > 0) {
    ids.add('flower');
  }
  if (position.flowers.some((flower) => FLOWER_WIND[flower] === position.seatWind)) {
    ids.add('seat_flower');
  }
  for (const meld of position.exposedMelds) {
    if (meld.type !== 'pong' && meld.type !== 'kong') {
      continue;
    }
    const kind = meld.tiles[0];
    if (DRAGON_KINDS.has(kind)) {
      ids.add('dragon_triplet');
    }
    if (kind === position.seatWind) {
      ids.add('seat_wind');
    }
    if (kind === position.roundWind) {
      ids.add('round_wind');
    }
  }
  return ids;
}

function patternIdsForWin(win: WinningHand, position: Position): Set<string> {
  const ids = new Set<string>();

  if (position.isDealer) {
    ids.add('dealer');
  }
  if (position.flowers.length > 0) {
    ids.add('flower');
  }
  if (position.flowers.some((flower) => FLOWER_WIND[flower] === position.seatWind)) {
    ids.add('seat_flower');
  }

  const allMelds = [...position.exposedMelds, ...win.melds];
  const triplets = allMelds.filter((meld) => meld.type === 'pong' || meld.type === 'kong');

  if (position.exposedMelds.length === 0) {
    ids.add('concealed_hand');
  }

  const concealedTriplets = triplets.filter((meld) => meld.concealed).length;
  if (concealedTriplets >= 3) {
    ids.add('three_concealed_triplets');
  }
  if (triplets.some((meld) => DRAGON_KINDS.has(meld.tiles[0]))) {
    ids.add('dragon_triplet');
  }
  if (triplets.some((meld) => meld.tiles[0] === position.seatWind)) {
    ids.add('seat_wind');
  }
  if (triplets.some((meld) => meld.tiles[0] === position.roundWind)) {
    ids.add('round_wind');
  }

  const nonPair = allMelds.filter((meld) => meld.type !== 'pair');
  if (nonPair.length > 0 && nonPair.every((meld) => meld.type === 'pong' || meld.type === 'kong')) {
    ids.add('all_triplets');
  }

  const suits = new Set<string>();
  let hasHonor = false;
  const flushTiles = [...win.tiles];
  for (const meld of position.exposedMelds) {
    flushTiles.push(...meld.tiles);
  }
  for (const tile of flushTiles) {
    const suffix = tile.length === 2 ? tile[1] : null;
    if (suffix === 'm' || suffix === 's' || suffix === 'p') {
      suits.add(suffix);
    } else {
      hasHonor = true;
    }
  }
  if (suits.size === 1 && !hasHonor) {
    ids.add('full_flush');
  } else if (suits.size === 1 && hasHonor) {
    ids.add('half_flush');
  }

  return ids;
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) {
    return new Set();
  }
  let acc = new Set(sets[0]);
  for (let index = 1; index < sets.length; index += 1) {
    const other = sets[index];
    acc = new Set([...acc].filter((id) => other.has(id)));
  }
  return acc;
}

function unionSets(sets: Set<string>[]): Set<string> {
  const acc = new Set<string>();
  for (const set of sets) {
    for (const id of set) {
      acc.add(id);
    }
  }
  return acc;
}

function tierOf(id: string, guaranteed: Set<string>, onTrack: Set<string>): Tier {
  if (guaranteed.has(id)) {
    return 'guaranteed';
  }
  if (onTrack.has(id)) {
    return 'on-track';
  }
  return 'potential';
}

function toEstimatedPatterns(
  ids: Set<string>,
  ruleset: Ruleset,
  guaranteed: Set<string>,
  onTrack: Set<string>,
): EstimatedPattern[] {
  const patterns: EstimatedPattern[] = [];
  for (const id of ids) {
    const def = ruleset.taiValues[id];
    if (!def) {
      continue;
    }
    patterns.push({
      id: def.id,
      english: def.english,
      chinese: def.chinese,
      tai: def.tai,
      rule: def.rule,
      tier: tierOf(id, guaranteed, onTrack),
    });
  }
  patterns.sort((a, b) => b.tai - a.tai || a.id.localeCompare(b.id));
  return patterns;
}

function sumTai(patterns: EstimatedPattern[]): number {
  return patterns.reduce((total, pattern) => total + pattern.tai, 0);
}

export function estimateTai(position: Position): TaiEstimate {
  const ruleset = position.ruleset;
  const guaranteed = guaranteedPatternIds(position);
  const winsByDistance = reachableWins(position);

  let onTrackCore = new Set<string>();
  let potentialCore = new Set<string>();
  const distances = [...winsByDistance.keys()].sort((a, b) => a - b);
  if (distances.length > 0) {
    const minDist = distances[0];
    const closest = winsByDistance.get(minDist) ?? [];
    const near = distances.flatMap((distance) => winsByDistance.get(distance) ?? []);
    onTrackCore = intersectSets(closest.map((win) => patternIdsForWin(win, position)));
    potentialCore = unionSets(near.map((win) => patternIdsForWin(win, position)));
  }

  const onTrackSet = unionSets([guaranteed, onTrackCore]);
  const potentialSet = unionSets([onTrackSet, potentialCore]);

  const guaranteedList = toEstimatedPatterns(guaranteed, ruleset, guaranteed, onTrackSet);
  const onTrackList = toEstimatedPatterns(onTrackSet, ruleset, guaranteed, onTrackSet);
  const potentialList = toEstimatedPatterns(potentialSet, ruleset, guaranteed, onTrackSet);

  return {
    guaranteed: guaranteedList,
    onTrack: onTrackList,
    potential: potentialList,
    totals: {
      guaranteed: sumTai(guaranteedList),
      onTrack: sumTai(onTrackList),
      potential: sumTai(potentialList),
    },
  };
}
