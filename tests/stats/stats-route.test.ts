import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/models/index.js', () => {
  return {
    Evaluation: { find: vi.fn() },
    Criterion: { find: vi.fn() },
    Team: { find: vi.fn() },
    Settings: { findById: vi.fn() },
    SETTINGS_ID: 'singleton',
  };
});

const models = (await import('../../src/models/index.js')) as unknown as {
  Evaluation: { find: ReturnType<typeof vi.fn> };
  Criterion: { find: ReturnType<typeof vi.fn> };
  Team: { find: ReturnType<typeof vi.fn> };
  Settings: { findById: ReturnType<typeof vi.fn> };
};
const router = (await import('../../src/routes/stats.js')).default;
const { signJwt } = await import('../../src/middleware/auth.js');

const adminToken = signJwt({ judgeId: 'a1', role: 'admin', name: 'Root' });
const judgeToken = signJwt({ judgeId: 'j1', role: 'judge', name: 'A' });

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/stats', router);
  return app;
}

function leanChain(value: unknown) {
  return {
    sort: () => leanChain(value),
    lean: () => Promise.resolve(value),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  models.Evaluation.find.mockReturnValue(leanChain([]));
  models.Criterion.find.mockReturnValue(leanChain([
    { _id: 'c1', name: '문제 정의 명확성', weight: 20, indicator: '', order: 1 },
    { _id: 'c2', name: '구현 실현 가능성', weight: 30, indicator: '', order: 2 },
    { _id: 'c3', name: '차별성·독창성', weight: 20, indicator: '', order: 3 },
    { _id: 'c4', name: '업무 혁신성', weight: 15, indicator: '', order: 4 },
    { _id: 'c5', name: '확산 파급력', weight: 15, indicator: '', order: 5 },
  ]));
  models.Team.find.mockReturnValue(leanChain([
    { _id: 't1', divisionId: 'd1', name: 'T1', projectName: '', owner: '', members: [], oneLiner: '' },
  ]));
});

describe('GET /api/stats/teams — auth & disclosure', () => {
  it('토큰 없음 → 401', async () => {
    const res = await request(buildApp()).get('/api/stats/teams');
    expect(res.status).toBe(401);
  });

  it('admin → 200 (disclosure 무관)', async () => {
    models.Settings.findById.mockReturnValue({ lean: () => Promise.resolve({ disclosureOpen: false }) });
    const res = await request(buildApp()).get('/api/stats/teams').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('judge + disclosureOpen=false → 403', async () => {
    models.Settings.findById.mockReturnValue({ lean: () => Promise.resolve({ disclosureOpen: false }) });
    const res = await request(buildApp()).get('/api/stats/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(res.status).toBe(403);
  });

  it('judge + Settings 미존재 → 403', async () => {
    models.Settings.findById.mockReturnValue({ lean: () => Promise.resolve(null) });
    const res = await request(buildApp()).get('/api/stats/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(res.status).toBe(403);
  });

  it('judge + disclosureOpen=true → 200', async () => {
    models.Settings.findById.mockReturnValue({ lean: () => Promise.resolve({ disclosureOpen: true }) });
    const res = await request(buildApp()).get('/api/stats/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(res.status).toBe(200);
  });

  it('admin 응답에 RankedTeam 형식', async () => {
    models.Evaluation.find.mockReturnValue(leanChain([
      { _id: 'e1', judgeId: 'j1', teamId: 't1', scores: [
        { criterionId: 'c1', value: 5 }, { criterionId: 'c2', value: 5 },
        { criterionId: 'c3', value: 5 }, { criterionId: 'c4', value: 5 }, { criterionId: 'c5', value: 5 },
      ], comment: '', version: 1, updatedAt: new Date() },
    ]));
    const res = await request(buildApp()).get('/api/stats/teams').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body[0].teamId).toBe('t1');
    expect(res.body[0].totalAvg).toBeCloseTo(100, 6);
  });
});
