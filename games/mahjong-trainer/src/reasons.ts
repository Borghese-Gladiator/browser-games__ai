import type { DiscardReason, DiscardReasonCode } from '@browser-games/engine-mahjong-analysis';

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}

const RENDERERS: Record<DiscardReasonCode, (value: number) => string> = {
  'completion-distance': (value) => `Keeps the hand ${value} ${plural(value, 'step')} from a win.`,
  'improving-tiles': (value) => `${value} ${plural(value, 'tile kind')} improve the hand.`,
  'good-shapes': (value) => `The remaining tiles form ${value} good ${plural(value, 'shape')}.`,
  'wait-count': (value) => `The hand waits on ${value} ${plural(value, 'tile')}.`,
  'isolated-penalty': (value) => `Isolated tiles add a penalty of ${value}.`,
};

export function renderReason(reason: DiscardReason): string | null {
  const render = RENDERERS[reason.code];
  return render ? render(reason.value) : null;
}

export function renderReasons(reasons: readonly DiscardReason[]): string[] {
  const sentences: string[] = [];
  for (const reason of reasons) {
    const sentence = renderReason(reason);
    if (sentence !== null) {
      sentences.push(sentence);
    }
  }
  return sentences;
}
