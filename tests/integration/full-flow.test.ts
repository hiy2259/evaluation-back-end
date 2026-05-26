import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

interface JudgeState {
  _id: mongoose.Types.ObjectId;
  name: string;
  pinHash: string;
  role: 'judge' | 'admin';
  active: boolean;
  createdAt: Date;
}

interface EvalState {
  _id: mongoose.Types.ObjectId;
  judgeId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  scores: Array<{ criterionId: mongoose.Types.ObjectId; value: number }>;
  comment: string;
  version: number;
  updatedAt: Date;
}

interface SettingsState {
  _id: 'singleton';
  disclosureOpen: boolean;
  updatedAt: Date;
}

const state = {
  judges: [] as JudgeState[],
  teams: [] as Array<{ _id: mongoose.Types.ObjectId; divisionId: mongoose.Types.ObjectId; name: string; projectName: string; owner: string; members: string[]; oneLiner: string }>,
  divisions: [] as Array<{ _id: mongoose.Types.ObjectId; name: string }>,
  criteria: [] as Array<{ _id: mongoose.Types.ObjectId; name: string; weight: number; indicator: string; order: number }>,
  evaluations: [] as EvalState[],
  settings: null as SettingsState | null,
};

function leanChain<T>(value: T) {
  return {
    sort: () => leanChain(value),
    lean: () => Promise.resolve(value),
  };
}

vi.mock('../../src/models/index.js', () => {
  return {
    Judge: {
      findOne: vi.fn((q: { name?: string; active?: boolean }) => {
        const j = state.judges.find((x) => x.name === q.name && (q.active === undefined || x.active === q.active));
        return { lean: () => Promise.resolve(j ? { ...j } : null) };
      }),
      find: vi.fn((q: { active?: boolean } = {}) => {
        const list = state.judges.filter((x) => q.active === undefined || x.active === q.active);
        return { lean: () => Promise.resolve(list.map((x) => ({ ...x }))) };
      }),
      create: vi.fn(async (data: Partial<JudgeState>) => {
        const j: JudgeState = {
          _id: new mongoose.Types.ObjectId(),
          name: data.name!,
          pinHash: data.pinHash!,
          role: (data.role ?? 'judge') as 'judge' | 'admin',
          active: data.active ?? true,
          createdAt: new Date(),
        };
        state.judges.push(j);
        return j;
      }),
      findByIdAndUpdate: vi.fn(),
    },
    Division: { find: vi.fn(() => leanChain(state.divisions)) },
    Team: {
      find: vi.fn(() => leanChain(state.teams)),
      exists: vi.fn(async (q: { _id: string }) => {
        return state.teams.find((t) => String(t._id) === String(q._id)) ? { _id: q._id } : null;
      }),
      countDocuments: vi.fn(async () => state.teams.length),
    },
    Criterion: {
      find: vi.fn(() => leanChain(state.criteria)),
      countDocuments: vi.fn(async (q: { _id?: { $in: string[] } }) => {
        if (!q?._id?.$in) return state.criteria.length;
        const ids = q._id.$in.map(String);
        return state.criteria.filter((c) => ids.includes(String(c._id))).length;
      }),
    },
    Evaluation: {
      find: vi.fn((q: { judgeId?: string | mongoose.Types.ObjectId } = {}) => {
        const arr = q.judgeId
          ? state.evaluations.filter((e) => String(e.judgeId) === String(q.judgeId))
          : state.evaluations.slice();
        return leanChain(arr);
      }),
      findOne: vi.fn((q: { judgeId: mongoose.Types.ObjectId; teamId: mongoose.Types.ObjectId }) => {
        const ev = state.evaluations.find(
          (e) => String(e.judgeId) === String(q.judgeId) && String(e.teamId) === String(q.teamId),
        );
        return { lean: () => Promise.resolve(ev ? { ...ev } : null) };
      }),
      findOneAndUpdate: vi.fn((filter: { judgeId: mongoose.Types.ObjectId; teamId: mongoose.Types.ObjectId; version?: number }, update: Record<string, unknown>, options: { upsert?: boolean } = {}) => {
        const idx = state.evaluations.findIndex(
          (e) => String(e.judgeId) === String(filter.judgeId) && String(e.teamId) === String(filter.teamId),
        );
        const setVals = (update.$set ?? {}) as Partial<EvalState>;
        const incVals = (update.$inc ?? {}) as { version?: number };
        let result: EvalState | null = null;
        let duplicateError: Error | null = null;
        if (idx === -1) {
          if (options.upsert) {
            const created: EvalState = {
              _id: new mongoose.Types.ObjectId(),
              judgeId: filter.judgeId,
              teamId: filter.teamId,
              scores: (setVals.scores as EvalState['scores']) ?? [],
              comment: (setVals.comment as string) ?? '',
              version: (setVals.version as number) ?? 1,
              updatedAt: (setVals.updatedAt as Date) ?? new Date(),
            };
            state.evaluations.push(created);
            result = created;
          }
        } else {
          const cur = state.evaluations[idx];
          if (filter.version !== undefined && cur.version !== filter.version) {
            if (options.upsert) {
              const err = new Error('E11000 duplicate key') as Error & { code?: number };
              err.code = 11000;
              duplicateError = err;
            } else {
              result = null;
            }
          } else {
            const updated: EvalState = {
              ...cur,
              ...(setVals.scores !== undefined ? { scores: setVals.scores as EvalState['scores'] } : {}),
              ...(setVals.comment !== undefined ? { comment: setVals.comment as string } : {}),
              ...(setVals.updatedAt !== undefined ? { updatedAt: setVals.updatedAt as Date } : {}),
              version: (setVals.version as number | undefined) ?? cur.version + (incVals.version ?? 0),
            };
            state.evaluations[idx] = updated;
            result = updated;
          }
        }
        return {
          lean: () => duplicateError ? Promise.reject(duplicateError) : Promise.resolve(result ? { ...result } : null),
        };
      }),
      aggregate: vi.fn(async () => {
        const counts = new Map<string, number>();
        for (const e of state.evaluations) {
          if (e.scores.length === 0) continue;
          const k = String(e.judgeId);
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return Array.from(counts, ([id, count]) => ({ _id: new mongoose.Types.ObjectId(id), count }));
      }),
    },
    Settings: {
      findById: vi.fn(() => ({ lean: () => Promise.resolve(state.settings ? { ...state.settings } : null) })),
      findOneAndUpdate: vi.fn((_q: unknown, update: { $set?: Partial<SettingsState> }) => {
        state.settings = {
          _id: 'singleton',
          disclosureOpen: update.$set?.disclosureOpen ?? false,
          updatedAt: new Date(),
        };
        const snap = { ...state.settings };
        return { lean: () => Promise.resolve(snap) };
      }),
    },
    SETTINGS_ID: 'singleton',
  };
});

const { createApp } = await import('../../src/server.js');

async function seedFixtures() {
  state.judges.length = 0;
  state.teams.length = 0;
  state.divisions.length = 0;
  state.criteria.length = 0;
  state.evaluations.length = 0;
  state.settings = { _id: 'singleton', disclosureOpen: false, updatedAt: new Date() };

  const judgePin = await bcrypt.hash('1234', 4);
  const adminPin = await bcrypt.hash('9999', 4);
  state.judges.push({
    _id: new mongoose.Types.ObjectId(),
    name: 'judgeA',
    pinHash: judgePin,
    role: 'judge',
    active: true,
    createdAt: new Date(),
  });
  state.judges.push({
    _id: new mongoose.Types.ObjectId(),
    name: 'rootAdmin',
    pinHash: adminPin,
    role: 'admin',
    active: true,
    createdAt: new Date(),
  });

  const div = { _id: new mongoose.Types.ObjectId(), name: 'A. 본부' };
  state.divisions.push(div);
  state.teams.push({
    _id: new mongoose.Types.ObjectId(),
    divisionId: div._id,
    name: 'Team-1',
    projectName: 'P1',
    owner: 'O',
    members: ['M1'],
    oneLiner: 'one liner',
  });

  const cnames = [
    { order: 1, name: '문제 정의 명확성', weight: 20 },
    { order: 2, name: '구현 실현 가능성', weight: 30 },
    { order: 3, name: '차별성·독창성', weight: 20 },
    { order: 4, name: '업무 혁신성', weight: 15 },
    { order: 5, name: '확산 파급력', weight: 15 },
  ];
  for (const c of cnames) {
    state.criteria.push({
      _id: new mongoose.Types.ObjectId(),
      name: c.name,
      weight: c.weight,
      indicator: '',
      order: c.order,
    });
  }
}

let app: express.Express;

beforeEach(async () => {
  await seedFixtures();
  app = createApp();
});

describe('Integration: full flow (login → eval → 409 → stats → admin → disclosure)', () => {
  it('end-to-end happy + conflict + disclosure 게이트', async () => {
    const loginJudge = await request(app).post('/api/auth/login').send({ name: 'judgeA', pin: '1234' });
    expect(loginJudge.status).toBe(200);
    const judgeToken = loginJudge.body.token as string;
    expect(loginJudge.body.judge.role).toBe('judge');

    const loginAdmin = await request(app).post('/api/auth/login').send({ name: 'rootAdmin', pin: '9999' });
    expect(loginAdmin.status).toBe(200);
    const adminToken = loginAdmin.body.token as string;

    const teamsRes = await request(app).get('/api/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(teamsRes.status).toBe(200);
    const teamId = teamsRes.body[0]._id;

    const critRes = await request(app).get('/api/criteria').set('Authorization', `Bearer ${judgeToken}`);
    expect(critRes.status).toBe(200);
    const criteriaIds = critRes.body.map((c: { _id: string }) => c._id);

    const firstPatch = await request(app)
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .send({ scores: criteriaIds.map((id: string) => ({ criterionId: id, value: 4 })), comment: 'good' });
    expect(firstPatch.status).toBe(200);
    expect(firstPatch.body.version).toBe(1);

    const stalePatch = await request(app)
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .set('If-Match', '0')
      .send({ scores: criteriaIds.map((id: string) => ({ criterionId: id, value: 5 })), comment: 'stale' });
    expect(stalePatch.status).toBe(409);
    expect(stalePatch.body.error).toBe('version_conflict');

    const goodPatch = await request(app)
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${judgeToken}`)
      .set('If-Match', String(firstPatch.body.version))
      .send({ scores: criteriaIds.map((id: string) => ({ criterionId: id, value: 5 })), comment: 'better' });
    expect(goodPatch.status).toBe(200);
    expect(goodPatch.body.version).toBe(2);

    const meEvals = await request(app).get('/api/me/evaluations').set('Authorization', `Bearer ${judgeToken}`);
    expect(meEvals.status).toBe(200);
    expect(meEvals.body.length).toBe(1);

    const statsClosed = await request(app).get('/api/stats/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(statsClosed.status).toBe(403);

    const statsAdmin = await request(app).get('/api/stats/teams').set('Authorization', `Bearer ${adminToken}`);
    expect(statsAdmin.status).toBe(200);
    expect(statsAdmin.body[0].totalAvg).toBeCloseTo(100, 1);

    const toggleOn = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disclosureOpen: true });
    expect(toggleOn.status).toBe(200);
    expect(toggleOn.body.disclosureOpen).toBe(true);

    const statsOpen = await request(app).get('/api/stats/teams').set('Authorization', `Bearer ${judgeToken}`);
    expect(statsOpen.status).toBe(200);

    const progress = await request(app).get('/api/admin/progress').set('Authorization', `Bearer ${adminToken}`);
    expect(progress.status).toBe(200);
    const judgeProgress = progress.body.find((r: { judgeName: string }) => r.judgeName === 'judgeA');
    expect(judgeProgress.completed).toBe(1);

    const progressDenied = await request(app).get('/api/admin/progress').set('Authorization', `Bearer ${judgeToken}`);
    expect(progressDenied.status).toBe(403);
  });
});
