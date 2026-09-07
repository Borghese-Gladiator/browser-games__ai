export interface TokenBucketOptions {
  capacity?: number;
  refillRate?: number;
  refillIntervalMs?: number;
  now?: number;
}

export class TokenBucket {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
  _tokens: number;
  _lastRefill: number;

  constructor({ capacity = 30, refillRate = 2, refillIntervalMs = 1000, now = Date.now() }: TokenBucketOptions = {}) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.refillIntervalMs = refillIntervalMs;
    this._tokens = capacity;
    // Anchored to the same clock callers pass to consume(); tests inject a fixed
    // `now` so refill math is independent of wall-clock time.
    this._lastRefill = now;
  }

  consume(now = Date.now()): boolean {
    const intervals = Math.floor((now - this._lastRefill) / this.refillIntervalMs);
    if (intervals > 0) {
      this._tokens = Math.min(this.capacity, this._tokens + intervals * this.refillRate);
      this._lastRefill += intervals * this.refillIntervalMs;
    }
    if (this._tokens >= 1) {
      this._tokens -= 1;
      return true;
    }
    return false;
  }
}
