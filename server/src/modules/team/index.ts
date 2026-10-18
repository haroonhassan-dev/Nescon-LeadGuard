import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, clientIp } from '../../lib/http';
import { randomToken, sha256 } from '../../lib/crypto';
import { recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { ScopedRequest } from '../../middleware/workspaceContext';
import { reassignFromUnavailable, runLeadTx, OPEN_STATUSES } from '../leads/engine';
import { ACKNOWLEDGED_LEAD_POLICIES } from '../leads/settings';

export const teamRouter = Router();

const INVITE_TTL_DAYS = 7;
const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

/** GET /api/team: every member with availability and open-lead load (F3.2; managers' "who is available"). */
teamRouter.get(
  '/',
  asyncHandler<ScopedRequest>(async (req, res) => {
    const workspaceId = req.ctx.workspaceId;
    const [members, counts, settings] = await Promise.all([
      prisma.membership.findMany({
        where: { workspaceId },
        include: { user: true, role: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.lead.groupBy({
        by: ['currentOwnerId'],
        where: { workspaceId, status: { in: [...OPEN_STATUSES] } },
        _count: { _all: true },
      }),
      prisma.assignmentSettings.findUnique({ where: { workspaceId } }),
    ]);
    const openByUser = new Map(counts.map((c) => [c.currentOwnerId, c._count._all]));
    const canManage = hasPermission(req, 'user:manage') || hasPermission(req, 'assignment:manage');
    ok(req, res, {
      items: members.map((m) => ({
        userId: m.userId,
        name: `${m.user.firstName} ${m.user.lastName}`.trim(),
        email: canManage || m.userId === req.auth.userId ? m.user.email : undefined,
        baseLevel: m.baseLevel,
        role: m.role,
        status: m.status,
        availability: m.availability,
        availabilityChangedAt: m.availabilityChangedAt.toISOString(),
        autoAssignEnabled: m.autoAssignEnabled,
        openLeads: openByUser.get(m.userId) ?? 0,
        maxOpenLeads: m.maxOpenLeads ?? settings?.maxOpenLeadsPerUser ?? 10,
        telegramConfigured: Boolean(m.telegramChatId),
      })),
    });
  })
);

// ----------------------------------------------------
// Availability (F3.2 + F3.6)
// ----------------------------------------------------
const availabilitySchema = z.object({
  availability: z.enum(['AVAILABLE', 'BUSY', 'ON_LEAVE', 'OFFLINE']),
});

/**
 * PATCH /api/team/:userId/availability. Self, or anyone with assignment:manage.
 * Going On leave / Offline reassigns that person's unacknowledged leads in the same transaction.
 */
teamRouter.patch(
  '/:userId/availability',
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { availability } = parse(availabilitySchema, req.body);
    const targetUserId = req.params.userId === 'me' ? req.auth.userId : req.params.userId;
    if (targetUserId !== req.auth.userId && !hasPermission(req, 'assignment:manage')) {
      throw new AppError('You can only change your own status', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    }
    const workspaceId = req.ctx.workspaceId;

    const result = await runLeadTx(async (tx, effects) => {
      const member = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId: targetUserId } } });
      if (!member) throw new AppError('Member not found', 404, 'NOT_FOUND');
      if (member.availability === availability) return { availability, reassigned: 0 };

      await tx.membership.update({
        where: { id: member.id },
        data: { availability, availabilityChangedAt: new Date(), version: { increment: 1 } },
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'AVAILABILITY_CHANGED',
        entityType: 'Membership',
        entityId: member.id,
        before: { userId: targetUserId, availability: member.availability },
        after: { userId: targetUserId, availability },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      effects.push({ type: 'availability.changed', workspaceId, userId: targetUserId });

      const reassigned =
        availability === 'ON_LEAVE' || availability === 'OFFLINE'
          ? await reassignFromUnavailable(tx, workspaceId, targetUserId, actorOf(req), effects)
          : 0;
      return { availability, reassigned };
    });

    const settings = await prisma.assignmentSettings.findUnique({ where: { workspaceId } });
    const policy = settings?.acknowledgedLeadPolicy === 'REASSIGN' ? 'REASSIGN' : 'KEEP_WITH_OWNER';
    ok(req, res, { ...result, acknowledgedLeadPolicy: policy, policyDescription: ACKNOWLEDGED_LEAD_POLICIES[policy] });
  })
);

// ----------------------------------------------------
// Invitations (F1.2)
// ----------------------------------------------------
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  baseLevel: z.enum(['ADMIN', 'USER']),
  roleId: z.string().uuid(),
});

teamRouter.post(
  '/invitations',
  requirePermission('user:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(inviteSchema, req.body);
    const workspaceId = req.ctx.workspaceId;
    if (input.baseLevel === 'ADMIN' && req.ctx.baseLevel !== 'OWNER') {
      throw new AppError('Only the Owner can invite Admins', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
    }
    const role = await prisma.role.findFirst({ where: { id: input.roleId, workspaceId } });
    if (!role) throw new AppError('Role not found in this workspace', 400, 'VALIDATION_FAILED');
    const existing = await prisma.membership.findFirst({ where: { workspaceId, user: { email: input.email } } });
    if (existing) throw new AppError('This person is already a member', 409, 'ALREADY_MEMBER');

    const token = randomToken();
    const invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          workspaceId,
          email: input.email,
          baseLevel: input.baseLevel,
          roleId: role.id,
          tokenHash: sha256(token),
          invitedById: req.auth.userId,
          expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400 * 1000),
        },
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'MEMBER_INVITED',
        entityType: 'Invitation',
        entityId: created.id,
        after: { email: input.email, baseLevel: input.baseLevel, role: role.name },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return created;
    });

    // No email provider is wired for invitations yet: the inviter shares this link.
    const base = (process.env.APP_BASE_URL || process.env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
    ok(
      req,
      res,
      {
        id: invitation.id,
        email: invitation.email,
        baseLevel: invitation.baseLevel,
        role: { id: role.id, name: role.name },
        expiresAt: invitation.expiresAt.toISOString(),
        inviteToken: token,
        inviteUrl: `${base}/accept-invite?token=${token}`,
      },
      201
    );
  })
);

// ----------------------------------------------------
// Change level / role / status / capacity (F1.2)
// ----------------------------------------------------
const updateMemberSchema = z
  .object({
    baseLevel: z.enum(['ADMIN', 'USER']).optional(),
    roleId: z.string().uuid().optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    autoAssignEnabled: z.boolean().optional(),
    maxOpenLeads: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

teamRouter.patch(
  '/:userId',
  requirePermission('user:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(updateMemberSchema, req.body);
    const workspaceId = req.ctx.workspaceId;
    const actorLevel = req.ctx.baseLevel;

    const result = await runLeadTx(async (tx, effects) => {
      const target = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: req.params.userId } },
      });
      if (!target) throw new AppError('Member not found', 404, 'NOT_FOUND');

      // Hierarchy rules: nobody but the Owner touches the Owner; the Owner's own level is fixed
      // (no ownerless workspace); only the Owner manages Admins or creates new ones.
      if (target.baseLevel === 'OWNER') {
        if (actorLevel !== 'OWNER') throw new AppError('Admins cannot modify the Owner', 403, 'CANNOT_MODIFY_OWNER');
        if (input.baseLevel || input.roleId || input.status) {
          throw new AppError("The Owner's level, role and status cannot be changed", 403, 'CANNOT_MODIFY_OWNER');
        }
      }
      if (actorLevel !== 'OWNER' && (target.baseLevel === 'ADMIN' || input.baseLevel === 'ADMIN')) {
        throw new AppError('Only the Owner can manage Admins', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
      }
      if (target.userId === req.auth.userId && (input.baseLevel || input.roleId || input.status)) {
        throw new AppError('You cannot change your own level, role or status', 403, 'FORBIDDEN_INSUFFICIENT_PERMISSIONS');
      }
      if (input.roleId && !(await tx.role.findFirst({ where: { id: input.roleId, workspaceId } }))) {
        throw new AppError('Role not found in this workspace', 400, 'VALIDATION_FAILED');
      }

      const updated = await tx.membership.update({
        where: { id: target.id },
        data: { ...input, version: { increment: 1 } },
      });
      if (input.status === 'SUSPENDED') {
        // A suspended member's sessions stop working for this workspace immediately (membership check),
        // and their leads move on like any unavailable owner.
        await tx.membership.update({ where: { id: target.id }, data: { availability: 'OFFLINE' } });
        await reassignFromUnavailable(tx, workspaceId, target.userId, actorOf(req), effects);
      }
      const pick = (m: typeof target) => ({
        baseLevel: m.baseLevel,
        roleId: m.roleId,
        status: m.status,
        autoAssignEnabled: m.autoAssignEnabled,
        maxOpenLeads: m.maxOpenLeads,
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'MEMBER_UPDATED',
        entityType: 'Membership',
        entityId: target.id,
        before: { userId: target.userId, ...pick(target) },
        after: { userId: target.userId, ...pick(updated) },
        ipAddress: clientIp(req),
        requestId: req.id,
      });
      return pick(updated);
    });
    ok(req, res, result);
  })
);

const notificationSchema = z.object({
  telegramChatId: z.string().trim().regex(/^-?\d{3,20}$/, 'Telegram chat id must be numeric').nullable().optional(),
  notificationEmail: z.string().trim().toLowerCase().email().nullable().optional(),
});

/** PATCH /api/team/me/notifications: each employee sets their own alert destination (I4.3). */
teamRouter.patch(
  '/me/notifications',
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(notificationSchema, req.body);
    const updated = await prisma.membership.update({
      where: { id: req.ctx.membershipId },
      data: input,
      select: { telegramChatId: true, notificationEmail: true },
    });
    ok(req, res, updated);
  })
);
