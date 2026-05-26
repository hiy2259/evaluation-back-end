import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { Role } from '../../shared/types.js';

export interface JwtPayload {
  judgeId: string;
  role: Role;
  name: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload;
  }
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtTtl as jwt.SignOptions['expiresIn'],
  });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  return null;
}

export const requireJwt: RequestHandler = (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'missing token' });
    return;
  }
  try {
    req.auth = verifyJwt(token);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'invalid token' });
  }
};

export function requireRole(role: Role): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    if (req.auth.role !== role) {
      res.status(403).json({ error: 'forbidden', message: `requires role=${role}` });
      return;
    }
    next();
  };
}
