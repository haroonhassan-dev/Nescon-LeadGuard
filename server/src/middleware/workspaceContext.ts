import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { prisma } from '../lib/prisma';
import { effectivePermissions } from '../lib/permissions';

export interface AuthContext {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  membershipId: string;
  baseLevel: 'OWNER' | 'ADMIN' | 'USER';
  roleId: string | null;
  permissions: Set<string>;
}

export interface WorkspaceScopedRequest extends Request {
  id?: string;
  auth?: AuthContext;
  ctx?: WorkspaceContext;
  /** Exact request bytes, kept for provider signature verification (Stripe, Twilio). */
  rawBody?: Buffer;
  // Kept for compatibility with the scaffold's field names.
  workspaceId?: string;
  userId?: string;
  userPermissions?: string[];
}

/** Request type for handlers mounted behind authenticate + requireWorkspaceContext. */
export interface ScopedRequest extends WorkspaceScopedRequest {
  auth: AuthContext;
  ctx: WorkspaceContext;
}

/**
 * Resolves the workspace for an authenticated user and PROVES membership.
 * X-Workspace-Id alone is never trusted: the user must hold an ACTIVE membership in it.
 * If the header is absent and the user belongs to exactly one workspace, that one is used.
 * Must run after `authenticate`.
 */
export async function requireWorkspaceContext(
  req: WorkspaceScopedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.auth) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');

    const header = req.headers['x-workspace-id'];
    const requested = Array.isArray(header) ? header[0] : header;

    const memberships = await prisma.membership.findMany({
      where: {
        userId: req.auth.userId,
        status: 'ACTIVE',
        workspace: { isActive: true },
        ...(requested ? { OR: [{ workspaceId: requested }, { workspace: { slug: requested } }] } : {}),
      },
      include: { role: true },
      take: 2,
    });

    if (!requested && memberships.length > 1) {
      throw new AppError(
        'You belong to several workspaces; send X-Workspace-Id to choose one',
        400,
        'MISSING_WORKSPACE_HEADER'
      );
    }
    const membership = memberships[0];
    if (!membership) {
      // Same answer whether the workspace does not exist or the user is not in it.
      throw new AppError('You are not a member of this workspace', 403, 'WORKSPACE_ACCESS_DENIED');
    }

    const permissions = effectivePermissions(membership.baseLevel, membership.role?.permissions);
    req.ctx = {
      workspaceId: membership.workspaceId,
      membershipId: membership.id,
      baseLevel: membership.baseLevel,
      roleId: membership.roleId,
      permissions,
    };
    req.workspaceId = membership.workspaceId;
    req.userPermissions = [...permissions];
    next();
  } catch (err) {
    next(err);
  }
}
