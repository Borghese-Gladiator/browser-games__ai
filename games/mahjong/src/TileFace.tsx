import type { Suit, TileSize, SeatPosition } from "./tiles.ts";
import { parseTile, tileLabel, suitColor } from "./tiles.ts";

export interface TileGlyphProps {
  rank: number;
  code: string;
  title: string;
}

export interface CornerIndexProps {
  suit: Suit;
  rank: number;
  code: string;
}

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

const CJK_NUMERAL = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WIND_CJK: Record<string, string> = {
  east: "東",
  south: "南",
  west: "西",
  north: "北",
};
const WIND_INDEX: Record<string, string> = { east: "E", south: "S", west: "W", north: "N" };
const DRAGON_CJK: Record<string, string> = { red: "中", green: "發", white: "□" };
const DRAGON_INDEX: Record<string, string> = { red: "中", green: "發", white: "白" };
const FLOWER_INDEX: Record<string, string> = {
  plum: "1",
  orchid: "2",
  chrysanthemum: "3",
  bamboo: "4",
  spring: "1",
  summer: "2",
  autumn: "3",
  winter: "4",
};

export function CharacterGlyph({ rank, title }: TileGlyphProps) {
  return (
    <svg viewBox="0 0 40 56" className="mj-glyph" data-glyph="char" aria-hidden="true">
      <title>{title}</title>
      <text x="20" y="24" className="mj-glyph-num mj-ink-char">
        {CJK_NUMERAL[rank] ?? rank}
      </text>
      <text x="20" y="50" className="mj-glyph-wan mj-ink-char">
        萬
      </text>
    </svg>
  );
}

const DOT_LAYOUT: Record<number, Array<[number, number]>> = {
  1: [[20, 28]],
  2: [
    [20, 16],
    [20, 40],
  ],
  3: [
    [10, 12],
    [20, 28],
    [30, 44],
  ],
  4: [
    [12, 16],
    [28, 16],
    [12, 40],
    [28, 40],
  ],
  5: [
    [12, 14],
    [28, 14],
    [20, 28],
    [12, 42],
    [28, 42],
  ],
  6: [
    [12, 14],
    [28, 14],
    [12, 28],
    [28, 28],
    [12, 42],
    [28, 42],
  ],
  7: [
    [12, 12],
    [28, 12],
    [12, 26],
    [28, 26],
    [12, 44],
    [20, 44],
    [28, 44],
  ],
  8: [
    [12, 11],
    [28, 11],
    [12, 24],
    [28, 24],
    [12, 37],
    [28, 37],
    [12, 50],
    [28, 50],
  ],
  9: [
    [11, 12],
    [20, 12],
    [29, 12],
    [11, 28],
    [20, 28],
    [29, 28],
    [11, 44],
    [20, 44],
    [29, 44],
  ],
};

export function DotGlyph({ rank, title }: TileGlyphProps) {
  const dots = DOT_LAYOUT[rank] ?? [];
  return (
    <svg viewBox="0 0 40 56" className="mj-glyph" data-glyph="dot" aria-hidden="true">
      <title>{title}</title>
      {dots.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r="5"
          className={i % 2 === 0 ? "mj-dot mj-dot-a" : "mj-dot mj-dot-b"}
        />
      ))}
    </svg>
  );
}

export function BambooGlyph({ rank, title }: TileGlyphProps) {
  const cols = rank <= 2 ? 1 : rank <= 6 ? 2 : 3;
  const rows = Math.ceil(rank / cols);
  const sticks: Array<[number, number]> = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < rank; r += 1) {
    const inRow = Math.min(cols, rank - placed);
    for (let c = 0; c < inRow; c += 1) {
      const x = 20 - ((inRow - 1) * 12) / 2 + c * 12;
      const y = rows === 1 ? 12 : 8 + r * ((44 - 14) / (rows - 1 || 1));
      sticks.push([x, y]);
      placed += 1;
    }
  }
  return (
    <svg viewBox="0 0 40 56" className="mj-glyph" data-glyph="bam" aria-hidden="true">
      <title>{title}</title>
      {sticks.map(([x, y], i) => (
        <g key={i} className="mj-bam-stick">
          <rect x={x - 2.5} y={y} width="5" height="14" rx="2.5" />
          <line x1={x - 2.5} y1={y + 7} x2={x + 2.5} y2={y + 7} />
        </g>
      ))}
    </svg>
  );
}

export function HonourGlyph({ code, title }: TileGlyphProps) {
  const isDragon = code in DRAGON_CJK;
  const glyph = isDragon ? DRAGON_CJK[code] : (WIND_CJK[code] ?? code);
  const inkClass = isDragon ? `mj-ink-dragon-${code}` : "mj-ink-honor";
  return (
    <svg viewBox="0 0 40 56" className="mj-glyph" data-glyph="honour" aria-hidden="true">
      <title>{title}</title>
      <text x="20" y="40" className={`mj-glyph-honour ${inkClass}`}>
        {glyph}
      </text>
    </svg>
  );
}

export function FlowerGlyph({ title }: TileGlyphProps) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg viewBox="0 0 40 56" className="mj-glyph" data-glyph="flower" aria-hidden="true">
      <title>{title}</title>
      <g transform="translate(20 26)" className="mj-flower">
        {petals.map((deg) => (
          <ellipse key={deg} cx="0" cy="-9" rx="4.5" ry="8" transform={`rotate(${deg})`} />
        ))}
        <circle cx="0" cy="0" r="4" className="mj-flower-core" />
      </g>
    </svg>
  );
}

function Glyph({ suit, rank, code, title }: TileGlyphProps & { suit: Suit }) {
  switch (suit) {
    case "char":
      return <CharacterGlyph rank={rank} code={code} title={title} />;
    case "dot":
      return <DotGlyph rank={rank} code={code} title={title} />;
    case "bam":
      return <BambooGlyph rank={rank} code={code} title={title} />;
    case "flower":
      return <FlowerGlyph rank={rank} code={code} title={title} />;
    default:
      return <HonourGlyph rank={rank} code={code} title={title} />;
  }
}

export function CornerIndex({ suit, rank, code }: CornerIndexProps) {
  let text = String(rank);
  if (suit === "wind") text = WIND_INDEX[code] ?? code[0].toUpperCase();
  else if (suit === "dragon") text = DRAGON_INDEX[code] ?? code[0].toUpperCase();
  else if (suit === "flower") text = FLOWER_INDEX[code] ?? "✿";
  return (
    <span className="mj-tile-corner" style={{ color: suitColor(suit) }}>
      {text}
    </span>
  );
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
        <Glyph suit={parsed.suit} rank={parsed.rank} code={parsed.code} title={label} />
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
