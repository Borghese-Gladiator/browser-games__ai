import type { TaiwaneseRules } from './taiwanese.ts';

export type ClaimType = 'WIN' | 'KONG' | 'PONG' | 'CHOW';

export interface Claim {
  readonly seat: number;
  readonly type: ClaimType;
}

export function claimRank(type: ClaimType): number {
  switch (type) {
    case 'WIN':
      return 3;
    case 'KONG':
      return 2;
    case 'PONG':
      return 2;
    case 'CHOW':
      return 1;
  }
}

export function isChowSeat(seat: number, discarder: number, rules: TaiwaneseRules): boolean {
  return seat === (discarder + 1) % rules.playerCount;
}

export function resolveClaims(
  claims: readonly Claim[],
  discarder: number,
  rules: TaiwaneseRules,
): Claim | null {
  const valid = claims.filter(
    (claim) => claim.type !== 'CHOW' || isChowSeat(claim.seat, discarder, rules),
  );
  if (valid.length === 0) {
    return null;
  }
  const topRank = Math.max(...valid.map((claim) => claimRank(claim.type)));
  const contenders = valid.filter((claim) => claimRank(claim.type) === topRank);
  const distance = (seat: number): number =>
    (seat - discarder - 1 + rules.playerCount) % rules.playerCount;
  return contenders.reduce((best, claim) =>
    distance(claim.seat) < distance(best.seat) ? claim : best,
  );
}
