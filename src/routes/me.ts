import { Router } from 'express';
import { Evaluation } from '../models/index.js';
import { requireJwt } from '../middleware/auth.js';
import type { IEvaluation } from '../../shared/types.js';

const router = Router();

router.get('/evaluations', requireJwt, async (req, res) => {
  const judgeId = req.auth!.judgeId;
  const docs = await Evaluation.find({ judgeId }).lean();
  const body: IEvaluation[] = docs.map((e) => ({
    _id: String(e._id),
    judgeId: String(e.judgeId),
    teamId: String(e.teamId),
    scores: (e.scores ?? []).map((s) => ({
      criterionId: String(s.criterionId),
      value: s.value,
    })),
    comment: e.comment ?? '',
    version: e.version ?? 0,
    updatedAt: new Date(e.updatedAt as unknown as string | Date).toISOString(),
  }));
  res.json(body);
});

export default router;
