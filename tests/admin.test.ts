import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

vi.mock('../src/models/index.js', () => {
  return {
    Judge: {
      create: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      find: vi.fn(),
    },
    Settings: { findOneAndUpdate: vi.fn() },
    Evaluation: { aggregate: vi.fn() },
    Team: { countDocuments: vi.fn() },
    SETTINGS_ID: 'singleton',
  };
});

const models = await import('../src/models/index.js') as unknown as {
  Judge: {
    create: ReturnType<typeof vi.fn>;
    findByIdAndUpdate: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  Settings: { findOneAndUpdate: ReturnType<typeof vi.fn> };
  Evaluation: { aggregate: ReturnType<typeof vi.fn> };
  Team: { countDocuments: ReturnType<typeof vi.fn> };
};
const router = (await import('../src/routes/admin.js')).default;
const { signJwt } = await import('../src/middleware/auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', router);
  return app;
}

const adminToken = signJwt({ judgeId: 'a1', role: 'admin', name: 'Root' });
const judgeToken = signJwt({ judgeId: 'j1', role: 'judge', name: 'Alice' });
const objId = () => new mongoose.Types.ObjectId().toString();

beforeEach(() => {
  Object.values(models).forEach((m) => {
    if (m && typeof m === 'object') {
      for (const k of Object.keys(m as Record<string, unknown>)) {
        const fn = (m as Record<string, unknown>)[k];
        if (typeof fn === 'function' && 'mockReset' in (fn as object)) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  });
});

describe('admin auth gate', () => {
  it('401 without token on any admin route', async () => {
    const r = await request(buildApp()).get('/api/admin/progress');
    expect(r.status).toBe(401);
  });
  it('403 for non-admin role', async () => {
    const r = await request(buildApp())
      .get('/api/admin/progress')
      .set('Authorization', `Bearer ${judgeToken}`);
    expect(r.status).toBe(403);
  });
});

describe('judges CRUD', () => {
  it('201 create judge with bcrypt hash', async () => {
    models.Judge.create.mockResolvedValueOnce({
      _id: 'new1', name: 'Bob', role: 'judge', active: true, createdAt: new Date(),
    });
    const r = await request(buildApp())
      .post('/api/admin/judges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bob', pin: '1234' });
    expect(r.status).toBe(201);
    expect(r.body.name).toBe('Bob');
    const args = models.Judge.create.mock.calls[0][0];
    expect(args.pinHash).not.toBe('1234');
    expect(args.pinHash.length).toBeGreaterThan(20);
  });

  it('400 on bad pin', async () => {
    const r = await request(buildApp())
      .post('/api/admin/judges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bob', pin: 'abc' });
    expect(r.status).toBe(400);
  });

  it('409 on duplicate name', async () => {
    models.Judge.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    const r = await request(buildApp())
      .post('/api/admin/judges')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bob', pin: '1234' });
    expect(r.status).toBe(409);
  });

  it('soft delete sets active=false', async () => {
    const id = objId();
    models.Judge.findByIdAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve({ _id: id, active: false }) });
    const r = await request(buildApp())
      .delete(`/api/admin/judges/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(models.Judge.findByIdAndUpdate.mock.calls[0][1]).toEqual({ $set: { active: false } });
  });

  it('pin reset generates fresh hash', async () => {
    const id = objId();
    models.Judge.findByIdAndUpdate.mockReturnValueOnce({ lean: () => Promise.resolve({ _id: id }) });
    const r = await request(buildApp())
      .patch(`/api/admin/judges/${id}/pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '9999' });
    expect(r.status).toBe(200);
    const update = models.Judge.findByIdAndUpdate.mock.calls[0][1];
    expect(update.$set.pinHash).not.toBe('9999');
  });
});

describe('settings + progress', () => {
  it('PATCH settings toggles disclosureOpen', async () => {
    models.Settings.findOneAndUpdate.mockReturnValueOnce({
      lean: () => Promise.resolve({ _id: 'singleton', disclosureOpen: true }),
    });
    const r = await request(buildApp())
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disclosureOpen: true });
    expect(r.status).toBe(200);
    expect(r.body.disclosureOpen).toBe(true);
  });

  it('400 when disclosureOpen not boolean', async () => {
    const r = await request(buildApp())
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ disclosureOpen: 'yes' });
    expect(r.status).toBe(400);
  });

  it('GET progress returns per-judge counts', async () => {
    models.Team.countDocuments.mockResolvedValueOnce(35);
    models.Judge.find.mockReturnValueOnce({
      lean: () => Promise.resolve([
        { _id: 'j1', name: 'Alice' },
        { _id: 'j2', name: 'Bob' },
      ]),
    });
    models.Evaluation.aggregate.mockResolvedValueOnce([
      { _id: 'j1', count: 12 },
    ]);
    const r = await request(buildApp())
      .get('/api/admin/progress')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([
      { judgeId: 'j1', judgeName: 'Alice', completed: 12, total: 35 },
      { judgeId: 'j2', judgeName: 'Bob', completed: 0, total: 35 },
    ]);
  });

  it('SSE accepts ?token query and emits first event', async () => {
    models.Team.countDocuments.mockResolvedValue(35);
    models.Judge.find.mockReturnValue({ lean: () => Promise.resolve([{ _id: 'j1', name: 'Alice' }]) });
    models.Evaluation.aggregate.mockResolvedValue([{ _id: 'j1', count: 5 }]);
    const res = await request(buildApp())
      .get(`/api/admin/progress/stream?token=${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        r.on('data', (chunk: Buffer) => {
          (r as unknown as { _chunks: Buffer[] })._chunks ??= [];
          (r as unknown as { _chunks: Buffer[] })._chunks.push(chunk);
          if (Buffer.concat((r as unknown as { _chunks: Buffer[] })._chunks).includes(Buffer.from('data:'))) {
            r.destroy();
          }
        });
        r.on('close', () => cb(null, Buffer.concat((r as unknown as { _chunks: Buffer[] })._chunks ?? [])));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(String((res.body as Buffer))).toContain('data:');
  }, 8_000);

  it('SSE 403 for non-admin via ?token', async () => {
    const res = await request(buildApp())
      .get(`/api/admin/progress/stream?token=${judgeToken}`);
    expect(res.status).toBe(403);
  });
});
