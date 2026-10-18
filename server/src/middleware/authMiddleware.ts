import { Response, NextFunction } from 'express';
import { WorkspaceScopedRequest } from './workspaceContext';
import { AppError } from './errorHandler';
import { prisma } from '../lib/prisma';
import { sha256 } from '../lib/crypto';
import { Permission } from '../lib/permissions';

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Verifies `Authorization: Bearer <token>` against the sessions table.
 * Rejects unknown, expired and revoked (logged-out) sessions.
 */
export async function authenticateUser(
  req: WorkspaceScopedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new AppError('Authentication token missing', 401, 'UNAUTHORIZED');

    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new AppError('Session is invalid or has expired. Please log in again.', 401, 'UNAUTHORIZED');
    }

    if (now.getTime() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: now } });
    }

    req.auth = {
      userId: session.userId,
      sessionId: session.id,
      email: session.user.email,
      name: `${session.user.firstName} ${session.user.lastName}`.trim(),
    };
    req.userId = session.userId;
    next();
  } catch (err) {
    next(err);
  }
}

export const authenticate = authenticateUser;

/**
 * Server-side RBAC guard. FAIL CLOSED: no workspace context or an empty permission set
 * means no access. Must run after authenticate + requireWorkspaceContext.
 */
export function requirePermission(...required: Permission[]) {
  return (req: WorkspaceScopedRequest, _res: Response, next: NextFunction): void => {
    const granted = req.ctx?.permissions;
    if (!granted) {
      return next(new AppError('Workspace context required', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS'));
    }
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      return next(
        new AppError(
          `Access forbidden: missing permission ${missing.map((p) => `[${p}]`).join(', ')}`,
          403,
          'FORBIDDEN_INSUFFICIENT_PERMISSIONS'
        )
      );
    }
    next();
  };
}

export function hasPermission(req: WorkspaceScopedRequest, permission: Permission): boolean {
  return req.ctx?.permissions.has(permission) ?? false;
}
