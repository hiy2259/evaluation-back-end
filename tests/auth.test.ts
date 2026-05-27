import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';

vi.mock('../src/models/index.js', () => {
  const findOne = vi.fn();
  return {
    Judge: { findOne },
    __findOne: findOne,
  };
});

const models = await import('../src/models/index.js');
const findOne = (models as unknown as { __findOne: ReturnType<typeof vi.fn> }).__findOne;
const authRouter = (await import('../src/routes/auth.js')).default;
const { verifyJwt } = await import('../src/middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
}

const pinHash = bcrypt.hashSync('1234', 4);
const judgeDoc = {
  _id: 'j1',
  name: 'Alice',
  pinHash,
  active: true,
  role: 'judge' as const,
  createdAt: new Date('2026-05-26T00:00:00Z'),
};

beforeEach(() => {
  findOne.mockReset();
});

describe('POST /api/auth/login', () => {
  it('200 + JWT on valid credentials', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(judgeDoc) });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Alice', pin: '1234' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    const payload = verifyJwt(res.body.token);
    expect(payload).toMatchObject({ judgeId: 'j1', role: 'judge', name: 'Alice' });
    expect(res.body.judge.pinHash).toBeUndefined();
  });

  it('401 invalid_credentials when judge missing', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(null) });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Nope', pin: '1234' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  it('401 invalid_credentials on wrong PIN', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(judgeDoc) });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Alice', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  it('200 + JWT with name only (no PIN)', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(judgeDoc) });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
  });

  it('400 when name missing', async () => {
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('429 after exceeding rate limit per IP+name', async () => {
    findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
    const app = buildApp();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = await request(app)
        .post('/api/auth/login')
        .send({ name: 'Bob', pin: '0000' });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
