import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { Judge } from '../models/index.js';
import { signJwt } from '../middleware/auth.js';
import { config } from '../config.js';
import type { LoginRequest, LoginResponse } from '../../shared/types.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: config.loginRateLimit.windowMs,
  max: config.loginRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().toLowerCase() : '';
    return `${req.ip ?? 'unknown'}::${name}`;
  },
  handler: (_req, res) => {
    res.status(429).json({ error: 'rate_limited', message: 'too many login attempts' });
  },
});

router.post('/login', loginLimiter, async (req: Request<unknown, unknown, LoginRequest>, res: Response) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const pin = typeof req.body?.pin === 'string' ? req.body.pin : '';

  if (!name || !pin) {
    res.status(400).json({ error: 'bad_request', message: 'name and pin required' });
    return;
  }

  const judge = await Judge.findOne({ name, active: true }).lean();
  if (!judge) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const ok = await bcrypt.compare(pin, judge.pinHash);
  if (!ok) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  const judgeId = String(judge._id);
  const token = signJwt({ judgeId, role: judge.role, name: judge.name });

  const response: LoginResponse = {
    token,
    judge: {
      _id: judgeId,
      name: judge.name,
      active: judge.active,
      role: judge.role,
      createdAt: new Date(judge.createdAt as unknown as string | Date).toISOString(),
    },
  };
  res.json(response);
});

export default router;
