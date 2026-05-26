import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { Judge, Settings, Evaluation, Team, SETTINGS_ID } from '../models/index.js';
import { requireJwt, requireRole } from '../middleware/auth.js';
import { config } from '../config.js';
import type { AdminProgressEntry } from '../../shared/types.js';

const router = Router();

router.use(requireJwt, requireRole('admin'));

interface CreateJudgeBody { name?: unknown; pin?: unknown; role?: unknown }

router.post('/judges', async (req: Request<unknown, unknown, CreateJudgeBody>, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
  const role = req.body?.role === 'admin' ? 'admin' : 'judge';
  if (!name || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'bad_request', message: 'name and 4-digit pin required' });
    return;
  }
  const pinHash = await bcrypt.hash(pin, config.bcryptRounds);
  try {
    const judge = await Judge.create({ name, pinHash, role, active: true });
    res.status(201).json({
      _id: String(judge._id),
      name: judge.name,
      role: judge.role,
      active: judge.active,
      createdAt: new Date(judge.createdAt as unknown as string | Date).toISOString(),
    });
  } catch (err: unknown) {
    if ((err as { code?: number })?.code === 11000) {
      res.status(409).json({ error: 'duplicate_name' });
      return;
    }
    throw err;
  }
});

router.delete('/judges/:id', async (req: Request<{ id: string }>, res: Response) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid id' });
    return;
  }
  const updated = await Judge.findByIdAndUpdate(req.params.id, { $set: { active: false } }, { new: true }).lean();
  if (!updated) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ ok: true });
});

interface PinResetBody { pin?: unknown }
router.patch('/judges/:id/pin', async (req: Request<{ id: string }, unknown, PinResetBody>, res: Response) => {
  const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';
  if (!/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'bad_request', message: '4-digit pin required' });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid id' });
    return;
  }
  const pinHash = await bcrypt.hash(pin, config.bcryptRounds);
  const updated = await Judge.findByIdAndUpdate(req.params.id, { $set: { pinHash } }, { new: true }).lean();
  if (!updated) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json({ ok: true });
});

interface SettingsBody { disclosureOpen?: unknown }
router.patch('/settings', async (req: Request<unknown, unknown, SettingsBody>, res: Response) => {
  if (typeof req.body?.disclosureOpen !== 'boolean') {
    res.status(400).json({ error: 'bad_request', message: 'disclosureOpen must be boolean' });
    return;
  }
  const updated = await Settings.findOneAndUpdate(
    { _id: SETTINGS_ID },
    { $set: { disclosureOpen: req.body.disclosureOpen, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  res.json(updated);
});

export async function computeProgress(): Promise<AdminProgressEntry[]> {
  const totalTeams = await Team.countDocuments();
  const judges = await Judge.find({ active: true }).lean();
  const counts = await Evaluation.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { 'scores.0': { $exists: true } } },
    { $group: { _id: '$judgeId', count: { $sum: 1 } } },
  ]);
  const map = new Map(counts.map((c) => [String(c._id), c.count]));
  return judges.map((j) => ({
    judgeId: String(j._id),
    judgeName: j.name,
    completed: map.get(String(j._id)) ?? 0,
    total: totalTeams,
  }));
}

router.get('/progress', async (_req, res: Response) => {
  res.json(await computeProgress());
});

router.get('/progress/stream', async (req: Request, res: Response) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = async () => {
    try {
      const data = await computeProgress();
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`);
    }
  };

  await send();
  const interval = setInterval(send, 5_000);
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25_000);

  const cleanup = () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  };
  req.on('close', cleanup);
  req.on('aborted', cleanup);
});

export default router;
