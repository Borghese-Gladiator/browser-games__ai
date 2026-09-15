import { TileFace } from "../TileFace.tsx";
import { copiesForTile, tileLabel } from "../tiles.ts";
import type { VisibleCopiesEntry } from "./visibleCopies.ts";

export interface VisibleCopiesPopoverProps {
  tile: string | null;
  entry: VisibleCopiesEntry | undefined;
}

// How many copies of the pointed-at tile are already on the table. It sits just
// above the hand and only appears while a tile is hovered or focused, so the
// count never competes with the board for attention.
//
// A tile with no entry has been seen nowhere public, so every copy but the ones
// in hand is still live. The panel says that rather than rendering nothing.
//
// The role is `tooltip`, not `status`: this is a hover hint, and a second
// `status` on the page would make every getByRole("status") ambiguous — the
// board's turn announcement owns that role.
export function VisibleCopiesPopover({ tile, entry }: VisibleCopiesPopoverProps) {
  if (!tile) return null;
  const seen = entry?.seen ?? 0;
  const remaining = entry?.remaining ?? copiesForTile(tile);
  return (
    <div className="mj-copies-pop" role="tooltip" aria-label="Visible copies">
      <TileFace tile={tile} size="sm" decorative />
      <span className="mj-copies-label">{entry?.label ?? tileLabel(tile)}</span>
      <span className="mj-copies-count">
        <strong>{seen}</strong> seen
      </span>
      <span className="mj-copies-sep" aria-hidden="true" />
      <span className="mj-copies-count">
        <strong>{remaining}</strong> left
      </span>
    </div>
  );
}
