import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcrypt';

vi.mock('../src/models/index.js', () => {
  const findOne = vi.fn();
  const create = vi.fn();
  return {
    Judge: { findOne, create },
    __findOne: findOne,
    __create: create,
  };
});

const models = await import('../src/models/index.js');
const findOne = (models as unknown as { __findOne: ReturnType<typeof vi.fn> }).__findOne;
const createMock = (models as unknown as { __create: ReturnType<typeof vi.fn> }).__create;
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
  createMock.mockReset();
});

describe('POST /api/auth/login', () => {
  it('200 + JWT on returning judge with matching PIN', async () => {
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

  it('auto-registers new judge with first PIN', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(null) });
    createMock.mockResolvedValueOnce({
      toObject: () => ({
        _id: 'jnew',
        name: 'Newbie',
        pinHash: 'hash',
        role: 'judge',
        active: true,
        createdAt: new Date(),
      }),
    });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Newbie', pin: '2468' });
    expect(res.status).toBe(200);
    expect(createMock).toHaveBeenCalledOnce();
    const arg = createMock.mock.calls[0][0];
    expect(arg.name).toBe('Newbie');
    expect(arg.role).toBe('judge');
    expect(arg.active).toBe(true);
    expect(arg.pinHash).toBeTypeOf('string');
  });

  it('returning judge with wrong PIN → 401', async () => {
    findOne.mockReturnValueOnce({ lean: () => Promise.resolve(judgeDoc) });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ name: 'Alice', pin: '9999' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('400 when PIN missing or non-4-digit', async () => {
    const r1 = await request(buildApp()).post('/api/auth/login').send({ name: 'X' });
    expect(r1.status).toBe(400);
    const r2 = await request(buildApp()).post('/api/auth/login').send({ name: 'X', pin: '12' });
    expect(r2.status).toBe(400);
    const r3 = await request(buildApp()).post('/api/auth/login').send({ name: '', pin: '1234' });
    expect(r3.status).toBe(400);
  });

  it('429 after exceeding rate limit per IP+name', async () => {
    findOne.mockReturnValue({ lean: () => Promise.resolve(judgeDoc) });
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
