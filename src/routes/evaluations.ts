import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { Evaluation, Team, Criterion } from '../models/index.js';
import { requireJwt } from '../middleware/auth.js';
import type { ScoreEntry } from '../../shared/types.js';

const router = Router();

function isValidScoreValue(v: unknown): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  if (v < 1 || v > 5) return false;
  return Math.round(v * 2) === v * 2;
}

function isObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

interface PatchBody {
  scores?: Array<{ criterionId?: unknown; value?: unknown }>;
  comment?: unknown;
}

router.patch('/:teamId', requireJwt, async (req: Request<{ teamId: string }, unknown, PatchBody>, res: Response) => {
  const { teamId } = req.params;
  const auth = req.auth!;

  if (!isObjectId(teamId)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid teamId' });
    return;
  }

  const team = await Team.exists({ _id: teamId });
  if (!team) {
    res.status(404).json({ error: 'not_found', message: 'team not found' });
    return;
  }

  const body = req.body ?? {};
  if (!Array.isArray(body.scores)) {
    res.status(400).json({ error: 'bad_request', message: 'scores must be array' });
    return;
  }

  const normalized: ScoreEntry[] = [];
  const seen = new Set<string>();
  for (const s of body.scores) {
    if (typeof s?.criterionId !== 'string' || !isObjectId(s.criterionId)) {
      res.status(400).json({ error: 'bad_request', message: 'invalid criterionId' });
      return;
    }
    if (!isValidScoreValue(s.value)) {
      res.status(400).json({ error: 'bad_request', message: 'value must be 1..5 step 0.5' });
      return;
    }
    if (seen.has(s.criterionId)) {
      res.status(400).json({ error: 'bad_request', message: 'duplicate criterionId' });
      return;
    }
    seen.add(s.criterionId);
    normalized.push({ criterionId: s.criterionId, value: s.value });
  }

  if (normalized.length > 0) {
    const criteriaCount = await Criterion.countDocuments({ _id: { $in: normalized.map((s) => s.criterionId) } });
    if (criteriaCount !== normalized.length) {
      res.status(400).json({ error: 'bad_request', message: 'unknown criterionId' });
      return;
    }
  }

  const comment = typeof body.comment === 'string' ? body.comment.slice(0, 2_000) : '';
  if (comment.length > 2_000) {
    res.status(400).json({ error: 'bad_request', message: 'comment too long' });
    return;
  }

  const ifMatch = req.header('If-Match');
  const clientVersion = ifMatch !== undefined ? Number(ifMatch) : undefined;
  if (ifMatch !== undefined && (!Number.isInteger(clientVersion) || (clientVersion as number) < 0)) {
    res.status(400).json({ error: 'bad_request', message: 'invalid If-Match' });
    return;
  }

  const now = new Date();
  const judgeObjectId = new mongoose.Types.ObjectId(auth.judgeId);
  const teamObjectId = new mongoose.Types.ObjectId(teamId);

  if (clientVersion === undefined || clientVersion === 0) {
    try {
      const updated = await Evaluation.findOneAndUpdate(
        { judgeId: judgeObjectId, teamId: teamObjectId, version: 0 },
        {
          $setOnInsert: { judgeId: judgeObjectId, teamId: teamObjectId },
          $set: { scores: normalized, comment, updatedAt: now, version: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ).lean();
      res.json(updated);
      return;
    } catch (err: unknown) {
      if ((err as { code?: number })?.code === 11000) {
        const current = await Evaluation.findOne({ judgeId: judgeObjectId, teamId: teamObjectId }).lean();
        res.status(409).json({ error: 'version_conflict', current });
        return;
      }
      throw err;
    }
  }

  const updated = await Evaluation.findOneAndUpdate(
    { judgeId: judgeObjectId, teamId: teamObjectId, version: clientVersion },
    { $set: { scores: normalized, comment, updatedAt: now }, $inc: { version: 1 } },
    { new: true },
  ).lean();

  if (!updated) {
    const current = await Evaluation.findOne({ judgeId: judgeObjectId, teamId: teamObjectId }).lean();
    res.status(409).json({ error: 'version_conflict', current });
    return;
  }

  res.json(updated);
});

export default router;
