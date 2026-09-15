import { useMemo, useState } from "react";
import type { Tile } from "@browser-games/engine-mahjong";
import { HandView } from "./HandView.tsx";
import { RankingView } from "./RankingView.tsx";
import { generatePuzzle } from "./puzzle.ts";
import { nextSeed } from "./rng.ts";
import { scoreChoice } from "./severity.ts";

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

// A short, stable drill number for a seed. It is cosmetic — it gives the drill
// an identity the player can recognise without showing a 10-digit seed.
function drillNumber(seed: number): number {
  return (seed % 9000) + 1000;
}

export function TrainerPage({ initialSeed }: { initialSeed?: number } = {}): JSX.Element {
  const [seed, setSeed] = useState(() => initialSeed ?? randomSeed());
  const [choice, setChoice] = useState<Tile | null>(null);
  const [solved, setSolved] = useState(0);

  const puzzle = useMemo(() => generatePuzzle(seed), [seed]);
  const result = useMemo(
    () => (choice ? scoreChoice(puzzle, choice) : null),
    [puzzle, choice],
  );

  function onDiscard(tile: Tile): void {
    setChoice(tile);
    setSolved((n) => n + 1);
  }

  function onNext(): void {
    setChoice(null);
    setSeed(nextSeed(puzzle.seed));
  }

  return (
    <div className="dt-page">
      <header className="dt-top">
        <a className="dt-back" href="/">
          ← All games
        </a>
        <span className="dt-streak" aria-label={`${solved} drills answered`}>
          {solved} answered
        </span>
      </header>

      <main className="dt">
        <section className="dt-brief" aria-label="Drill">
          <div className="dt-brief-copy">
            <p className="eyebrow">Discard drill · 何切る</p>
            <h1 className="dt-title">Which tile do you cut?</h1>
            <p className="dt-sub">
              Pick the discard you would make. The analyzer then ranks every
              option and shows why.
            </p>
          </div>
          <dl className="dt-brief-stats">
            <div>
              <dt>Drill</dt>
              <dd>#{drillNumber(puzzle.seed)}</dd>
            </div>
            <div>
              <dt>Spread</dt>
              <dd>{puzzle.spread}</dd>
            </div>
            <div>
              <dt>Options</dt>
              <dd>{puzzle.ranking.length}</dd>
            </div>
          </dl>
        </section>

        <HandView hand={puzzle.hand} onDiscard={onDiscard} disabled={result !== null} />

        {result && <RankingView ranking={puzzle.ranking} result={result} />}

        {result && (
          <div className="dt-next-row">
            <button type="button" className="btn btn-primary dt-next" onClick={onNext}>
              Next drill →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
