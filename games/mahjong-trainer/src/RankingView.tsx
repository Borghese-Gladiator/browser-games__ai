import type { RankedDiscard } from "@browser-games/engine-mahjong-analysis";
import { TileFace, kindToTileId } from "@portal/shared/tiles";
import { renderReasons } from "./reasons.ts";
import type { MistakeSeverity, PlayerChoiceResult } from "./severity.ts";
import { tileToId } from "./tiles.ts";

const SEVERITY_LABEL: Record<MistakeSeverity, string> = {
  optimal: "Optimal discard",
  minor: "Minor mistake",
  moderate: "Moderate mistake",
  severe: "Severe mistake",
};

const SEVERITY_NOTE: Record<MistakeSeverity, string> = {
  optimal: "You picked the best available discard.",
  minor: "A stronger discard was available.",
  moderate: "This discard gives up meaningful value.",
  severe: "This discard is far from the best option.",
};

export function RankingView({
  ranking,
  result,
}: {
  ranking: readonly RankedDiscard[];
  result: PlayerChoiceResult;
}): JSX.Element {
  return (
    <section className="dt-ranking-section" aria-label="Discard ranking">
      <div className={`dt-result dt-result-${result.severity}`} role="status">
        <p className="dt-result-severity">{SEVERITY_LABEL[result.severity]}</p>
        <p className="dt-result-note">{SEVERITY_NOTE[result.severity]}</p>
        <dl className="dt-result-stats">
          <div>
            <dt>Your pick</dt>
            <dd>
              <span className="dt-tile-stat">
                <TileFace tile={tileToId(result.choice)} size="md" decorative />
                <span className="dt-tile-rank">#{result.choiceRank}</span>
              </span>
            </dd>
          </div>
          <div>
            <dt>Best</dt>
            <dd>
              <TileFace tile={kindToTileId(result.best.kind)} size="md" decorative />
            </dd>
          </div>
          <div>
            <dt>Points lost</dt>
            <dd>{result.deltaScore}</dd>
          </div>
        </dl>
      </div>

      <h2 className="dt-ranking-heading">Full ranking</h2>
      <ol className="dt-ranking">
        {ranking.map((entry, index) => {
          const rank = index + 1;
          const isChoice = rank === result.choiceRank;
          const sentences = renderReasons(entry.reasons);
          return (
            <li
              key={entry.kind}
              className={`dt-rank-row${isChoice ? " dt-rank-choice" : ""}`}
              aria-current={isChoice ? "true" : undefined}
            >
              <div className="dt-rank-head">
                <span className="dt-rank-num">#{rank}</span>
                <span className="dt-rank-tile">
                  <TileFace tile={kindToTileId(entry.kind)} size="md" decorative />
                </span>
                <span className="dt-rank-score">{entry.score}</span>
                {rank === 1 && <span className="dt-badge dt-badge-best">Best</span>}
                {isChoice && <span className="dt-badge dt-badge-choice">Your pick</span>}
              </div>
              {sentences.length > 0 && (
                <ul className="dt-reasons">
                  {sentences.map((sentence) => (
                    <li key={sentence}>{sentence}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
