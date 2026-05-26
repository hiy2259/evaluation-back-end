import { Router } from 'express';
import { Criterion } from '../models/index.js';
import { requireJwt } from '../middleware/auth.js';
import type { ICriterion } from '../../shared/types.js';

const router = Router();

router.get('/', requireJwt, async (_req, res) => {
  const docs = await Criterion.find({}).sort({ order: 1 }).lean();
  const body: ICriterion[] = docs.map((c) => ({
    _id: String(c._id),
    name: c.name,
    weight: c.weight,
    indicator: c.indicator ?? '',
    order: c.order,
  }));
  res.json(body);
});

export default router;
