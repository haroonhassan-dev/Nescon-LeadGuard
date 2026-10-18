import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, clientIp } from '../../lib/http';
import { hashPassword, verifyPassword, burnPasswordCheck, sha256 } from '../../lib/crypto';
import { rateLimit } from '../../lib/rateLimit';
import { recordAudit } from '../../lib/audit';
import { effectivePermissions } from '../../lib/permissions';
import { AppError } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/authMiddleware';
import { WorkspaceScopedRequest } from '../../middleware/workspaceContext';
import {
  bootstrapWorkspace,
  createSession,
  publicUser,
  MAX_FAILED_LOGINS,
  LOCKOUT_MINUTES,
} from './service';

export const authRouter = Router();

const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);
const personName = z.string().trim().min(1).max(80);

const signupSchema = z.object({
  workspaceName: z.string().trim().min(2).max(80),
  firstName: personName,
  lastName: personName,
  email,
  password,
});

const loginSchema = z.object({ email, password: z.string().min(1).max(200) });

const acceptInviteSchema = z.object({
  token: z.string().min(10).max(200),
  firstName: personName.optional(),
  lastName: personName.optional(),
  password: z.string().min(1).max(200),
});

const loginLimiter = rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 30 });
const signupLimiter = rateLimit({ name: 'signup', windowMs: 60 * 60 * 1000, max: 20 });

async function membershipsOf(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: 'ACTIVE', workspace: { isActive: true } },
    include: { workspace: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  return memberships.map((m) => ({
    workspaceId: m.workspaceId,
    workspaceName: m.workspace.name,
    workspaceSlug: m.workspace.slug,
    baseLevel: m.baseLevel,
    role: m.role ? { id: m.role.id, name: m.role.name } : null,
    availability: m.availability,
    permissions: [...effectivePermissions(m.baseLevel, m.role?.permissions)],
  }));
}

/** POST /api/auth/signup: creates a new workspace and makes the caller its Owner. */
authRouter.post(
  '/signup',
  signupLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(signupSchema, req.body);
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw new AppError('An account with this email already exists. Log in instead.', 409, 'EMAIL_IN_USE');
    }
    const passwordHash = await hashPassword(input.password);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash, firstName: input.firstName, lastName: input.lastName },
      });
      const { workspace } = await bootstrapWorkspace(tx, {
        name: input.workspaceName,
        ownerUserId: user.id,
        ownerName: `${user.firstName} ${user.lastName}`,
      });
      const session = await createSession(tx, user.id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
      return { user, workspace, session };
    });

    ok(
      req,
      res,
      {
        token: result.session.token,
        expiresAt: result.session.expiresAt.toISOString(),
        user: publicUser(result.user),
        workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
        memberships: await membershipsOf(result.user.id),
      },
      201
    );
  })
);

/** POST /api/auth/login. Per-IP rate limit + per-account lockout after repeated failures (Q1). */
authRouter.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(loginSchema, req.body);
    const invalid = new AppError('Email or password is incorrect', 401, 'INVALID_CREDENTIALS');

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      await burnPasswordCheck(input.password);
      throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(
        `Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`,
        429,
        'ACCOUNT_LOCKED'
      );
    }

    if (!(await verifyPassword(input.password, user.passwordHash))) {
      const failed = user.failedLoginCount + 1;
      await prisma.user.update({
        where: { id: user.id },
        data:
          failed >= MAX_FAILED_LOGINS
            ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) }
            : { failedLoginCount: failed },
      });
      throw invalid;
    }

    const session = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      return createSession(tx, user.id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    });

    ok(req, res, {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: publicUser(user),
      memberships: await membershipsOf(user.id),
    });
  })
);

/** POST /api/auth/logout: revokes the current session immediately. */
authRouter.post(
  '/logout',
  authenticate,
  asyncHandler<WorkspaceScopedRequest>(async (req, res) => {
    await prisma.session.update({ where: { id: req.auth!.sessionId }, data: { revokedAt: new Date() } });
    ok(req, res, { loggedOut: true });
  })
);

/** GET /api/auth/me: profile plus every workspace the user belongs to, with effective permissions. */
authRouter.get(
  '/me',
  authenticate,
  asyncHandler<WorkspaceScopedRequest>(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.userId } });
    ok(req, res, { user: publicUser(user), memberships: await membershipsOf(user.id) });
  })
);

/**
 * POST /api/auth/accept-invite: public. Creates the account (or verifies the existing one's
 * password) and joins the workspace with the level and role chosen by the inviter.
 */
authRouter.post(
  '/accept-invite',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(acceptInviteSchema, req.body);
    const invitation = await prisma.invitation.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) {
      throw new AppError('This invitation is invalid or has expired. Ask for a new one.', 400, 'INVITATION_INVALID');
    }

    let user = await prisma.user.findUnique({ where: { email: invitation.email } });
    if (user) {
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        throw new AppError('Enter the password of your existing account to join', 401, 'INVALID_CREDENTIALS');
      }
    } else {
      const pw = parse(password, input.password);
      if (!input.firstName || !input.lastName) {
        throw new AppError('First and last name are required', 400, 'VALIDATION_FAILED');
      }
      user = await prisma.user.create({
        data: {
          email: invitation.email,
          passwordHash: await hashPassword(pw),
          firstName: input.firstName,
          lastName: input.lastName,
        },
      });
    }
    const joiningUser = user;

    const session = await prisma.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new AppError('This invitation was already used', 409, 'INVITATION_INVALID');

      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: joiningUser.id } },
      });
      if (existing) throw new AppError('You are already a member of this workspace', 409, 'ALREADY_MEMBER');

      const membership = await tx.membership.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: joiningUser.id,
          baseLevel: invitation.baseLevel,
          roleId: invitation.roleId,
        },
      });
      await recordAudit(tx, {
        workspaceId: invitation.workspaceId,
        actor: { type: 'USER', id: joiningUser.id, name: `${joiningUser.firstName} ${joiningUser.lastName}` },
        action: 'MEMBER_JOINED',
        entityType: 'Membership',
        entityId: membership.id,
        after: { userId: joiningUser.id, baseLevel: membership.baseLevel, roleId: membership.roleId },
        ipAddress: clientIp(req),
      });
      return createSession(tx, joiningUser.id, { ip: clientIp(req), userAgent: req.headers['user-agent'] });
    });

    ok(req, res, {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      user: publicUser(joiningUser),
      memberships: await membershipsOf(joiningUser.id),
    });
  })
);
