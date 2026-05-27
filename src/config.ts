import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/nova-judging'),
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  jwtTtl: process.env.JWT_TTL ?? '12h',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  corsAllowVercel: (process.env.CORS_ALLOW_VERCEL ?? 'true').toLowerCase() === 'true',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  loginRateLimit: {
    max: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),
    windowMs: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS ?? 60_000),
  },
  seedMdPath: process.env.SEED_MD_PATH ?? './seed-data/팀별_스킬_정리.md',
};

export type AppConfig = typeof config;
