import { copiesForTile, tileKind, tileLabel, sortTiles } from "../tiles.ts";

export interface VisibleCopiesEntry {
  kind: string;
  tile: string;
  label: string;
  seen: number;
  remaining: number;
}

// Only public tiles feed the tally. A concealed hand is never an input here.
export interface PublicProjection {
  opponentDiscards: string[][];
  myDiscards: string[];
  lastDiscard?: string;
  visibleMelds: string[][];
  visibleFlowers: string[];
}

// Count seen and remaining copies from public data only. Physical tile ids are
// unique (suit-rank-copy), so a Set of ids dedupes a tile that shows up in both
// a river and the lastDiscard slot, or in a claimed meld.
export function computeVisibleCopies(projection: PublicProjection): VisibleCopiesEntry[] {
  const ids = new Set<string>();
  for (const river of projection.opponentDiscards) {
    for (const id of river) ids.add(id);
  }
  for (const id of projection.myDiscards) ids.add(id);
  if (projection.lastDiscard) ids.add(projection.lastDiscard);
  for (const meld of projection.visibleMelds) {
    for (const id of meld) ids.add(id);
  }
  for (const id of projection.visibleFlowers) ids.add(id);

  const seenByKind = new Map<string, { count: number; sample: string }>();
  for (const id of ids) {
    const kind = tileKind(id);
    const entry = seenByKind.get(kind);
    if (entry) entry.count += 1;
    else seenByKind.set(kind, { count: 1, sample: id });
  }

  const samples = [...seenByKind.values()].map((e) => e.sample);
  return sortTiles(samples).map((sample) => {
    const kind = tileKind(sample);
    const seen = seenByKind.get(kind)?.count ?? 0;
    const total = copiesForTile(sample);
    return {
      kind,
      tile: sample,
      label: tileLabel(sample),
      seen,
      remaining: Math.max(0, total - seen),
    };
  });
}
