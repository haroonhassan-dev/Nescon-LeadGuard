import { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = (req.headers['x-request-id'] as string) || `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  res.setHeader('X-Request-Id', requestId);
  (req as Request & { id: string }).id = requestId;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(`[${new Date().toISOString()}] [${logLevel}] [${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });

  next();
}
