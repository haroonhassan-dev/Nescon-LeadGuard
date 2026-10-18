import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ApiErrorResponse } from '../../../shared/contracts/api';

export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: Array<{ field?: string; message: string; code?: string }>;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_SERVER_ERROR',
    details?: Array<{ field?: string; message: string; code?: string }>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && (err as SyntaxError & { status?: number }).status === 400) {
    return new AppError('Request body is not valid JSON', 400, 'VALIDATION_FAILED');
  }
  if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.too.large') {
    return new AppError('Request body is too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError('A record with these values already exists', 409, 'CONFLICT');
    if (err.code === 'P2025') return new AppError('Record not found', 404, 'NOT_FOUND');
  }
  const internal = new AppError('An unexpected internal server error occurred', 500, 'INTERNAL_SERVER_ERROR');
  internal.stack = err instanceof Error ? err.stack : undefined;
  return internal;
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const appError = normalize(err);
  const requestId = (req as unknown as { id?: string }).id || (req.headers['x-request-id'] as string);

  const responseBody: ApiErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  if (appError.statusCode >= 500) {
    // Full error is logged server-side only; the client gets a generic message.
    console.error(`[CRITICAL ERROR] [${requestId}]`, err);
  }

  res.status(appError.statusCode).json(responseBody);
}
