import { Request, Response, NextFunction } from 'express';
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

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const requestId = (req.headers['x-request-id'] as string) || (req as unknown as { id?: string }).id;

  const responseBody: ApiErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: err.message || 'An unexpected internal server error occurred',
      details: err instanceof AppError ? err.details : undefined,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  if (statusCode >= 500) {
    console.error(`[CRITICAL ERROR] [${requestId}]`, err);
  }

  res.status(statusCode).json(responseBody);
}
