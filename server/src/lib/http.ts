import { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodTypeAny } from 'zod';
import { ApiResponse } from '../../../shared/contracts/api';
import { AppError } from '../middleware/errorHandler';

export const API_VERSION = '0.1.0';

/** Sends the standard success envelope from docs/API_CONTRACT.md. */
export function ok<T>(req: Request, res: Response, data: T, status = 200): void {
  const body: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: (req as Request & { id?: string }).id,
      timestamp: new Date().toISOString(),
      version: API_VERSION,
    },
  };
  res.status(status).json(body);
}

/** Express 4 does not catch rejected promises; this forwards them to the error handler. */
export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req as R, res, next).catch(next);
  };
}

/** Validates input with zod and throws VALIDATION_FAILED with per-field details. */
export function parse<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      'Request validation failed',
      400,
      'VALIDATION_FAILED',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || undefined,
        message: issue.message,
        code: issue.code,
      }))
    );
  }
  return result.data;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function paginate(page: number, limit: number, totalItems: number) {
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}
