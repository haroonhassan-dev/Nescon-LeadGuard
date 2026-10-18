import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export interface WorkspaceScopedRequest extends Request {
  workspaceId?: string;
  userId?: string;
  userPermissions?: string[];
}

/**
 * Ensures every incoming tenant request has an explicit workspace context.
 * Can be provided via 'X-Workspace-Id' header or extracted from verified JWT/session.
 */
export function requireWorkspaceContext(
  req: WorkspaceScopedRequest,
  res: Response,
  next: NextFunction
): void {
  const queryWorkspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const rawWorkspaceId = (req.headers['x-workspace-id'] as string) || queryWorkspaceId;

  // For public endpoints or health checks, skip requirement
  if (req.path === '/api/health' || req.path.startsWith('/api/public') || req.path.startsWith('/api/webhooks')) {
    return next();
  }

  if (!rawWorkspaceId) {
    return next(
      new AppError(
        'Workspace context header (X-Workspace-Id) is required for multi-tenant scoping',
        400,
        'MISSING_WORKSPACE_HEADER'
      )
    );
  }

  req.workspaceId = Array.isArray(rawWorkspaceId) ? rawWorkspaceId[0] : rawWorkspaceId;
  next();
}
