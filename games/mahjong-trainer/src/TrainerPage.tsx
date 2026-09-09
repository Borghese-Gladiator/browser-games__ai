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

export function TrainerPage({ initialSeed }: { initialSeed?: number } = {}): JSX.Element {
  const [seed, setSeed] = useState(() => initialSeed ?? randomSeed());
  const [choice, setChoice] = useState<Tile | null>(null);

  const puzzle = useMemo(() => generatePuzzle(seed), [seed]);
  const result = useMemo(
    () => (choice ? scoreChoice(puzzle, choice) : null),
    [puzzle, choice],
  );

  function onDiscard(tile: Tile): void {
    setChoice(tile);
  }

  function onNext(): void {
    setChoice(null);
    setSeed(nextSeed(puzzle.seed));
  }

  return (
    <main className="dt">
      <a className="dt-back" href="/">
        ← All games
      </a>
      <header className="dt-header">
        <h1>Discard Trainer</h1>
        <p className="dt-muted">
          Pick the tile you would discard, then compare your choice against the
          analyzer ranking.
        </p>
      </header>

      <HandView hand={puzzle.hand} onDiscard={onDiscard} disabled={result !== null} />

      {result && <RankingView ranking={puzzle.ranking} result={result} />}

      {result && (
        <button type="button" className="btn dt-next" onClick={onNext}>
          Next puzzle
        </button>
      )}
    </main>
  );
}
