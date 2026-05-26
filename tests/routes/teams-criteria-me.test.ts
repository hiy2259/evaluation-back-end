import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/db.js', () => ({
  connectDb: vi.fn().mockResolvedValue({}),
  disconnectDb: vi.fn().mockResolvedValue(undefined),
}));

const teamDocs = [
  { _id: 't1', divisionId: 'd1', name: 'Alpha', projectName: 'A', owner: 'u1', members: ['m1'], oneLiner: 'one-a' },
  { _id: 't2', divisionId: 'd2', name: 'Bravo', projectName: 'B', owner: 'u2', members: [], oneLiner: 'one-b' },
];
const divisionDocs = [
  { _id: 'd1', name: 'Div One' },
  { _id: 'd2', name: 'Div Two' },
];
const criterionDocs = [
  { _id: 'c1', name: '문제정의', weight: 20, indicator: 'i1', order: 1 },
  { _id: 'c2', name: '구현', weight: 30, indicator: 'i2', order: 2 },
];
const evaluationDocs = [
  {
    _id: 'e1',
    judgeId: 'j1',
    teamId: 't1',
    scores: [{ criterionId: 'c1', value: 4 }],
    comment: 'ok',
    version: 1,
    updatedAt: new Date('2026-05-26T00:00:00Z'),
  },
];

function makeChain<T>(value: T) {
  const chain: any = {};
  chain.sort = vi.fn().mockReturnValue(chain);
  chain.lean = vi.fn().mockResolvedValue(value);
  return chain;
}

vi.mock('../../src/models/index.js', () => ({
  Team: { find: vi.fn(() => makeChain(teamDocs)) },
  Division: { find: vi.fn(() => makeChain(divisionDocs)) },
  Criterion: { find: vi.fn(() => makeChain(criterionDocs)) },
  Evaluation: { find: vi.fn(() => makeChain(evaluationDocs)) },
  Judge: { findOne: vi.fn() },
  Settings: { findById: vi.fn() },
  SETTINGS_ID: 'singleton',
}));

import { createApp } from '../../src/server.js';
import { config } from '../../src/config.js';

function makeToken(role: 'judge' | 'admin' = 'judge', judgeId = 'j1') {
  return jwt.sign({ judgeId, role, name: 'tester' }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

let app: ReturnType<typeof createApp>;
beforeAll(() => {
  app = createApp();
});
afterAll(() => {
  vi.restoreAllMocks();
});

describe('GET /api/teams', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(401);
  });

  it('returns teams with divisionName populated', async () => {
    const res = await request(app)
      .get('/api/teams')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ _id: 't1', name: 'Alpha', divisionName: 'Div One' });
    expect(res.body[1]).toMatchObject({ _id: 't2', name: 'Bravo', divisionName: 'Div Two' });
  });
});

describe('GET /api/criteria', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/criteria');
    expect(res.status).toBe(401);
  });

  it('returns criteria sorted by order', async () => {
    const res = await request(app)
      .get('/api/criteria')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ _id: 'c1', order: 1, weight: 20 });
  });
});

describe('GET /api/me/evaluations', () => {
  it('401 without token', async () => {
    const res = await request(app).get('/api/me/evaluations');
    expect(res.status).toBe(401);
  });

  it('returns judge own evaluations with serialized fields', async () => {
    const res = await request(app)
      .get('/api/me/evaluations')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      _id: 'e1',
      judgeId: 'j1',
      teamId: 't1',
      comment: 'ok',
      version: 1,
    });
    expect(res.body[0].scores).toEqual([{ criterionId: 'c1', value: 4 }]);
    expect(typeof res.body[0].updatedAt).toBe('string');
  });
});
