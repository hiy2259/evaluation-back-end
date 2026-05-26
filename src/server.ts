import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { connectDb } from './db.js';
import authRouter from './routes/auth.js';
import evaluationsRouter from './routes/evaluations.js';
import teamsRouter from './routes/teams.js';
import criteriaRouter from './routes/criteria.js';
import meRouter from './routes/me.js';
import adminRouter from './routes/admin.js';
import statsRouter from './routes/stats.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, env: config.env, ts: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/evaluations', evaluationsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/criteria', criteriaRouter);
  app.use('/api/me', meRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/stats', statsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'not_found', path: req.path });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  });

  return app;
}

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[server] listening on :${config.port} (${config.env})`);
  });
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error('[fatal]', err);
    process.exit(1);
  });
}
