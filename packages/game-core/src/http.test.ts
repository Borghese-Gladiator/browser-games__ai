import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { RoomManager } from './rooms.js';
import { buildHealth, buildStats, registerHttpRoutes } from './http.js';
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

describe('the HTTP surface after the leaderboard removal', () => {
  const record = { id: 'o1', gameId: 'mahjong', roomCode: 'ABCD', ts: 1000, outcomes: [] };

  function app() {
    const metrics: Metrics = { msgCount: 0, msgWindowStart: 1000, totalRoomsCreated: 0, totalRoomsFinished: 0 };
    const instance = Fastify();
    registerHttpRoutes(instance, { ...deps(metrics), outcomeStore: { all: () => [record] } });
    return instance;
  }

  it.each(['/api/leaderboard', '/api/history?playerId=p0', '/api/h2h?playerA=p0&playerB=p1'])(
    'no longer serves %s',
    async (url) => {
      const res = await app().inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
    },
  );

  // The outcome log stays because this endpoint is the /history/ page's index of
  // reviewable rooms. Guard it so a later cleanup cannot delete the log silently.
  it('still lists reviewable mahjong rooms from the outcome log', async () => {
    const res = await app().inject({ method: 'GET', url: '/api/reviews' });
    expect(res.statusCode).toBe(200);
    expect(res.json().games).toEqual([{ gameType: 'mahjong', roomCode: 'ABCD', ts: 1000 }]);
  });
});
