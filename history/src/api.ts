// Read-only client for the review HTTP surface. Mirrors the GameReview JSON the
// gateway returns from packages/game-core/src/review.ts. Pure fetch wrappers, no
// engine code, so this page stays a thin renderer.

export type MistakeSeverity = "optimal" | "minor" | "moderate" | "severe";

export interface DiscardEvaluation {
  kind: string;
  score: number;
  reasons: string[];
}

export interface ReviewStep {
  index: number;
  sequence: number;
  seat: number;
  hand: string[];
  chosen: DiscardEvaluation;
  best: DiscardEvaluation;
  mistakeScore: number;
  severity: MistakeSeverity;
}

export interface SeatSummary {
  seat: number;
  discards: number;
  counts: Record<MistakeSeverity, number>;
}

export interface GameReview {
  instanceId: string;
  gameType: string;
  steps: ReviewStep[];
  summary: SeatSummary[];
}

export interface ReviewListEntry {
  gameType: string;
  roomCode: string;
  ts: number;
}

function base(): string {
  const gw = import.meta.env?.VITE_GATEWAY_URL;
  if (!gw) return "http://localhost:3001";
  return gw.replace(/^ws/, "http");
}

export async function fetchReviews(): Promise<ReviewListEntry[]> {
  const res = await fetch(`${base()}/api/reviews`);
  if (!res.ok) throw new Error(`reviews request failed: ${res.status}`);
  const body = (await res.json()) as { games: ReviewListEntry[] };
  return body.games;
}

export async function fetchReview(gameId: string): Promise<GameReview> {
  const res = await fetch(`${base()}/api/review/${encodeURIComponent(gameId)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `review request failed: ${res.status}`);
  }
  return (await res.json()) as GameReview;
}
