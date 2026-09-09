import type { TileSize, SeatPosition } from "./parseTile.ts";
import { parseTile, tileLabel } from "./parseTile.ts";
import { TileGlyph, CornerIndex } from "./TileGlyphs.tsx";

export interface TileFaceProps {
  tile: string;
  faceDown?: boolean;
  size?: TileSize;
  orientation?: SeatPosition;
  highlighted?: boolean;
  ariaLabel?: string;
  className?: string;
  decorative?: boolean;
}

export interface TileBackProps {
  count?: number;
  size?: TileSize;
  orientation?: SeatPosition;
  className?: string;
}

export function TileFace({
  tile,
  faceDown = false,
  size = "md",
  orientation = "bottom",
  highlighted = false,
  ariaLabel,
  className = "",
  decorative = false,
}: TileFaceProps) {
  const base = `mj-tile mj-tile--${size} mj-seat--${orientation}${
    highlighted ? " mj-tile--hl" : ""
  }${className ? ` ${className}` : ""}`;

  if (faceDown) {
    return (
      <span
        className={`${base} mj-tile--back`}
        data-face="down"
        aria-hidden={ariaLabel ? undefined : true}
        aria-label={ariaLabel}
        role={ariaLabel ? "img" : undefined}
      >
        <svg viewBox="0 0 40 56" className="mj-back-art" aria-hidden="true">
          <rect x="4" y="4" width="32" height="48" rx="4" className="mj-back-frame" />
          <path d="M20 12 L28 20 L20 28 L12 20 Z" className="mj-back-mark" />
          <circle cx="20" cy="20" r="3.2" className="mj-back-dot" />
        </svg>
      </span>
    );
  }

  const parsed = parseTile(tile);
  const label = ariaLabel ?? tileLabel(tile);
  return (
    <span
      className={`${base} mj-tile--${parsed.suit}`}
      data-suit={parsed.suit}
      data-tile={tile}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
    >
      <CornerIndex suit={parsed.suit} rank={parsed.rank} code={parsed.code} />
      <span className="mj-tile-glyph">
        <TileGlyph suit={parsed.suit} rank={parsed.rank} code={parsed.code} title={label} />
      </span>
    </span>
  );
}

export function TileBack({
  count = 1,
  size = "sm",
  orientation = "top",
  className = "",
}: TileBackProps) {
  const n = Math.max(0, count);
  const shown = Math.min(n, 17);
  const stacked = orientation === "left" || orientation === "right";
  return (
    <div
      className={`mj-backs mj-backs--${orientation}${className ? ` ${className}` : ""}`}
      role="img"
      aria-label={`${n} concealed tiles`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <TileFace
          key={i}
          tile=""
          faceDown
          size={size}
          orientation={stacked ? orientation : "top"}
          decorative
        />
      ))}
    </div>
  );
}
