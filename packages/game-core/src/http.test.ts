import { describe, it, expect } from 'vitest';
import { RoomManager } from './rooms.js';
import { buildHealth, buildStats } from './http.js';
import type { HttpDeps, Metrics } from './http.js';

function deps(metrics: Metrics): HttpDeps {
  return {
    manager: new RoomManager({}),
    outcomeStore: { all: () => [] },
    io: { engine: { clientsCount: 0 } },
    metrics,
    funnel: {},
    startedAt: 500,
  };
}

describe('buildHealth', () => {
  it('returns ok, protocolVersion, rooms, and uptimeMs', () => {
    const health = buildHealth(deps({ msgCount: 7, msgWindowStart: 1000, totalRoomsCreated: 0, totalRoomsFinished: 0 }));
    expect(health.ok).toBe(true);
    expect(health.protocolVersion).toBeDefined();
    expect(health.rooms).toBe(0);
    expect(health.uptimeMs).toBeGreaterThan(0);
  });

  it('does not reset msgCount or msgWindowStart', () => {
    const metrics: Metrics = { msgCount: 7, msgWindowStart: 1000, totalRoomsCreated: 0, totalRoomsFinished: 0 };
    buildHealth(deps(metrics));
    expect(metrics.msgCount).toBe(7);
    expect(metrics.msgWindowStart).toBe(1000);
  });
});

describe('buildStats', () => {
  it('rolls the message-rate window (the mutating path)', () => {
    const metrics: Metrics = { msgCount: 7, msgWindowStart: 1000, totalRoomsCreated: 0, totalRoomsFinished: 0 };
    buildStats(deps(metrics), 5000);
    expect(metrics.msgCount).toBe(0);
    expect(metrics.msgWindowStart).toBe(5000);
  });
});
