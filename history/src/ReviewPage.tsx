import { useEffect, useState } from "react";
import { TileFace, kindToTileId } from "@portal/shared/tiles";
import { fetchReview, type GameReview, type MistakeSeverity, type ReviewStep } from "./api.ts";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; review: GameReview };

const SEVERITY_LABEL: Record<MistakeSeverity, string> = {
  optimal: "Optimal",
  minor: "Minor mistake",
  moderate: "Moderate mistake",
  severe: "Severe mistake",
};

export function ReviewPage({ gameId }: { gameId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [step, setStep] = useState(0);

  useEffect(() => {
    let live = true;
    fetchReview(gameId)
      .then((review) => live && setState({ status: "ready", review }))
      .catch((e: Error) => live && setState({ status: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, [gameId]);

  return (
    <main className="rv">
      <a className="rv-back" href="/history/">
        ← All games
      </a>
      <header className="rv-header">
        <h1>Game Review</h1>
        <p className="rv-muted">{gameId}</p>
      </header>

      {state.status === "loading" && <p className="rv-muted">Replaying the game…</p>}

      {state.status === "error" && (
        <div className="rv-panel rv-panel-error" role="alert">
          <p className="rv-panel-title">Could not load this review</p>
          <p className="rv-muted">{state.message}</p>
        </div>
      )}

      {state.status === "ready" && state.review.steps.length === 0 && (
        <div className="rv-panel">
          <p className="rv-panel-title">No discards to review</p>
          <p className="rv-muted">This game recorded no discard decisions.</p>
        </div>
      )}

      {state.status === "ready" && state.review.steps.length > 0 && (
        <>
          <SummaryPanel review={state.review} />
          <StepView
            step={state.review.steps[Math.min(step, state.review.steps.length - 1)]}
            index={Math.min(step, state.review.steps.length - 1)}
            total={state.review.steps.length}
            onPrev={() => setStep((s) => Math.max(0, s - 1))}
            onNext={() => setStep((s) => Math.min(state.review.steps.length - 1, s + 1))}
          />
        </>
      )}
    </main>
  );
}

function SummaryPanel({ review }: { review: GameReview }) {
  const bands: MistakeSeverity[] = ["optimal", "minor", "moderate", "severe"];
  return (
    <section className="rv-panel" aria-label="Player summary">
      <p className="rv-label">Per-player severity</p>
      <table className="rv-summary">
        <thead>
          <tr>
            <th scope="col">Seat</th>
            <th scope="col">Discards</th>
            {bands.map((b) => (
              <th scope="col" key={b}>
                {SEVERITY_LABEL[b]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {review.summary.map((seat) => (
            <tr key={seat.seat}>
              <td>Seat {seat.seat}</td>
              <td className="rv-num">{seat.discards}</td>
              {bands.map((b) => (
                <td className="rv-num" key={b}>
                  {seat.counts[b]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function StepView({
  step,
  index,
  total,
  onPrev,
  onNext,
}: {
  step: ReviewStep;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <section className={`rv-panel rv-step rv-step-${step.severity}`} aria-label="Move review">
      <div className="rv-step-head">
        <p className="rv-label">
          Turn {index + 1} of {total} — Seat {step.seat}
        </p>
        <span className={`rv-badge rv-badge-${step.severity}`}>{SEVERITY_LABEL[step.severity]}</span>
      </div>

      {step.hand.length > 0 && (
        <div className="rv-hand" aria-label="Hand at this turn">
          {step.hand.map((kind, i) => (
            <TileFace key={`${kind}-${i}`} tile={kindToTileId(kind)} size="sm" decorative />
          ))}
        </div>
      )}

      <div className="rv-compare" aria-label="Chosen versus best">
        <div className="rv-move rv-move-chosen">
          <h2>Chosen discard</h2>
          <p className="rv-move-tile">
            <TileFace tile={kindToTileId(step.chosen.kind)} size="lg" decorative />
          </p>
          <p className="rv-muted rv-num">Score {step.chosen.score}</p>
          <ReasonList reasons={step.chosen.reasons} />
        </div>
        <div className="rv-move rv-move-best">
          <h2>Best discard</h2>
          <p className="rv-move-tile">
            <TileFace tile={kindToTileId(step.best.kind)} size="lg" decorative />
          </p>
          <p className="rv-muted rv-num">Score {step.best.score}</p>
          <ReasonList reasons={step.best.reasons} />
        </div>
      </div>

      <p className="rv-mistake">
        Mistake score: <strong className="rv-num">{step.mistakeScore}</strong>
      </p>

      <div className="rv-nav">
        <button type="button" className="btn rv-nav-btn" onClick={onPrev} disabled={index === 0}>
          Previous turn
        </button>
        <button
          type="button"
          className="btn rv-nav-btn"
          onClick={onNext}
          disabled={index === total - 1}
        >
          Next turn
        </button>
      </div>
    </section>
  );
}

function ReasonList({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="rv-reasons">
      {reasons.map((r, i) => (
        <li key={i}>{r}</li>
      ))}
    </ul>
  );
}
