import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import { clientIp } from './http';

/**
 * Fixed-window, per-IP limiter held in memory. Enough for a single server process;
 * per-account lockout (stored in the database) is the persistent protection for login.
 */
export function rateLimit(options: { name: string; windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, options.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${options.name}:${clientIp(req)}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > options.max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return next(new AppError('Too many requests. Please wait and try again.', 429, 'RATE_LIMITED'));
    }
    next();
  };
}
