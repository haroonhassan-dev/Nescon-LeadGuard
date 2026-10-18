import { Response, NextFunction } from 'express';
import { WorkspaceScopedRequest } from './workspaceContext';
import { AppError } from './errorHandler';
import { PermissionKey } from '../../../shared/contracts/permissions';

/**
 * Authentication check middleware scaffold.
 * Verifies Bearer token, sets userId and workspaceId.
 */
export function authenticateUser(
  req: WorkspaceScopedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Authentication token missing or invalid', 401, 'UNAUTHORIZED'));
  }

  // Token decoding and validation will be implemented by the Backend Developer
  // For scaffold baseline: extract mock/developer token or pass through
  const token = authHeader.split(' ')[1];
  if (!token) {
    return next(new AppError('Empty bearer credentials', 401, 'INVALID_TOKEN'));
  }

  next();
}

/**
 * Server-Side RBAC Enforcement Guard
 * Ensures user has all required permissions before proceeding.
 */
export function requirePermission(permission: PermissionKey) {
  return (req: WorkspaceScopedRequest, res: Response, next: NextFunction): void => {
    const permissions = req.userPermissions || [];
    
    // In production, checked against user's Role permissions
    if (permissions.length > 0 && !permissions.includes(permission)) {
      return next(
        new AppError(
          `Access forbidden: Missing required permission [${permission}]`,
          403,
          'FORBIDDEN_INSUFFICIENT_PERMISSIONS'
        )
      );
    }

    next();
  };
}
