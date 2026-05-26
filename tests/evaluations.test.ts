import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

vi.mock('../src/models/index.js', () => {
  return {
    Evaluation: {
      findOneAndUpdate: vi.fn(),
      findOne: vi.fn(),
    },
    Team: { exists: vi.fn() },
    Criterion: { countDocuments: vi.fn() },
  };
});

const models = await import('../src/models/index.js') as unknown as {
  Evaluation: { findOneAndUpdate: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn> };
  Team: { exists: ReturnType<typeof vi.fn> };
  Criterion: { countDocuments: ReturnType<typeof vi.fn> };
};
const router = (await import('../src/routes/evaluations.js')).default;
const { signJwt } = await import('../src/middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/evaluations', router);
  return app;
}

const judgeId = new mongoose.Types.ObjectId().toString();
const teamId = new mongoose.Types.ObjectId().toString();
const critA = new mongoose.Types.ObjectId().toString();
const critB = new mongoose.Types.ObjectId().toString();
const token = signJwt({ judgeId, role: 'judge', name: 'Alice' });

beforeEach(() => {
  models.Evaluation.findOneAndUpdate.mockReset();
  models.Evaluation.findOne.mockReset();
  models.Team.exists.mockReset();
  models.Criterion.countDocuments.mockReset();
});

describe('PATCH /api/evaluations/:teamId', () => {
  it('401 without token', async () => {
    const res = await request(buildApp()).patch(`/api/evaluations/${teamId}`).send({ scores: [] });
    expect(res.status).toBe(401);
  });

  it('400 on invalid teamId', async () => {
    const res = await request(buildApp())
      .patch('/api/evaluations/not-an-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [] });
    expect(res.status).toBe(400);
  });

  it('404 when team missing', async () => {
    models.Team.exists.mockResolvedValueOnce(null);
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [] });
    expect(res.status).toBe(404);
  });

  it('400 when value out of range', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [{ criterionId: critA, value: 6 }] });
    expect(res.status).toBe(400);
  });

  it('400 when value step != 0.5', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [{ criterionId: critA, value: 3.3 }] });
    expect(res.status).toBe(400);
  });

  it('400 on duplicate criterionId', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [
        { criterionId: critA, value: 3 },
        { criterionId: critA, value: 4 },
      ] });
    expect(res.status).toBe(400);
  });

  it('200 upsert when no If-Match (new evaluation)', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    models.Criterion.countDocuments.mockResolvedValueOnce(1);
    const saved = { _id: 'e1', judgeId, teamId, version: 1, scores: [{ criterionId: critA, value: 4 }], comment: 'ok' };
    models.Evaluation.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(saved) });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ scores: [{ criterionId: critA, value: 4 }], comment: 'ok' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
  });

  it('200 update with matching If-Match version', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    models.Criterion.countDocuments.mockResolvedValueOnce(2);
    const saved = { _id: 'e1', judgeId, teamId, version: 3, scores: [], comment: '' };
    models.Evaluation.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(saved) });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('If-Match', '2')
      .send({ scores: [
        { criterionId: critA, value: 4 },
        { criterionId: critB, value: 5 },
      ], comment: 'hi' });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(3);
    const call = models.Evaluation.findOneAndUpdate.mock.calls[0];
    expect(call[0]).toMatchObject({ version: 2 });
  });

  it('409 on version mismatch', async () => {
    models.Team.exists.mockResolvedValueOnce({ _id: teamId });
    models.Criterion.countDocuments.mockResolvedValueOnce(1);
    models.Evaluation.findOneAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve(null) });
    const current = { _id: 'e1', judgeId, teamId, version: 5, scores: [], comment: '' };
    models.Evaluation.findOne.mockReturnValueOnce({ lean: () => Promise.resolve(current) });
    const res = await request(buildApp())
      .patch(`/api/evaluations/${teamId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('If-Match', '2')
      .send({ scores: [{ criterionId: critA, value: 4 }] });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('version_conflict');
    expect(res.body.current.version).toBe(5);
  });
});
