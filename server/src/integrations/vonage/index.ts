import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse, clientIp } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { AppError } from '../../middleware/errorHandler';
import { authenticate, requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { requireWorkspaceContext, ScopedRequest, WorkspaceScopedRequest } from '../../middleware/workspaceContext';
import { verifyVonageSignature, vonageConfig, isVonageConfigured } from './client';
import { handleInbound, handleStatus, sendToContact, retryMessage, PROVIDER, InboundPayload, StatusPayload } from './service';

/**
 * WhatsApp messaging through the Vonage Messages API sandbox (I1 / rubric criterion 5).
 *   POST /api/integrations/vonage/inbound   (public, signed by Vonage)
 *   POST /api/integrations/vonage/status    (public, signed by Vonage)
 */
export const vonageRouter = Router();
const tenant = [authenticate, requireWorkspaceContext];
const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

async function rejectForged(req: WorkspaceScopedRequest, kind: string): Promise<boolean> {
  const problem = verifyVonageSignature(req.headers.authorization, req.rawBody);
  if (!problem) return false;
  await prisma.integrationEvent.create({
    data: { provider: PROVIDER, direction: 'INBOUND', eventType: kind, result: 'REJECTED', detail: `Signature check failed: ${problem}`.slice(0, 500) },
  });
  return true;
}

const inboundSchema = z.object({
  message_uuid: z.string().min(1),
  from: z.string().min(5),
  to: z.string().min(5),
  text: z.string().optional(),
  message_type: z.string().optional(),
  channel: z.string().optional(),
  timestamp: z.string().optional(),
  profile: z.object({ name: z.string().optional() }).optional(),
});

vonageRouter.post(
  '/inbound',
  asyncHandler<WorkspaceScopedRequest>(async (req, res) => {
    if (await rejectForged(req, 'message.inbound')) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    const payload = parse(inboundSchema, req.body) as InboundPayload;
    const outcome = await handleInbound(payload);
    res.status(200).json({ received: true, ...outcome });
  })
);

const statusSchema = z.object({
  message_uuid: z.string().min(1),
  status: z.string().min(1),
  timestamp: z.string().optional(),
  error: z.object({ type: z.string().optional(), title: z.string().optional(), detail: z.string().optional() }).passthrough().optional(),
});

vonageRouter.post(
  '/status',
  asyncHandler<WorkspaceScopedRequest>(async (req, res) => {
    if (await rejectForged(req, 'message.status')) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    const outcome = await handleStatus(parse(statusSchema, req.body) as StatusPayload);
    res.status(200).json({ received: true, ...outcome });
  })
);

// ----------------------------------------------------
// Connection (per workspace) + status page (I5.1, I5.2, I5.6, I5.7)
// ----------------------------------------------------
vonageRouter.post(
  '/connect',
  ...tenant,
  requirePermission('integration:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const cfg = vonageConfig();
    const taken = await prisma.integrationConnection.findFirst({
      where: { provider: PROVIDER, status: 'CONNECTED', publicConfig: { path: ['whatsappNumber'], equals: cfg.number }, NOT: { workspaceId: req.ctx.workspaceId } },
    });
    if (taken) throw new AppError('This WhatsApp number is already connected to another workspace', 409, 'NUMBER_IN_USE');
    const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId: req.ctx.workspaceId, provider: PROVIDER, userId: null } });
    const data = { status: 'CONNECTED', publicConfig: { whatsappNumber: cfg.number, apiKeyHint: `${cfg.apiKey.slice(0, 3)}****` }, lastSuccessAt: new Date(), lastError: null };
    const conn = existing
      ? await prisma.integrationConnection.update({ where: { id: existing.id }, data })
      : await prisma.integrationConnection.create({ data: { workspaceId: req.ctx.workspaceId, provider: PROVIDER, ...data } });
    await prisma.$transaction((tx) =>
      recordAudit(tx, { workspaceId: req.ctx.workspaceId, actor: actorOf(req), action: 'INTEGRATION_CONNECTED', entityType: 'IntegrationConnection', entityId: conn.id, after: { provider: PROVIDER, whatsappNumber: cfg.number }, ipAddress: clientIp(req) })
    );
    ok(req, res, { connected: true, whatsappNumber: `+${cfg.number}` });
  })
);

vonageRouter.delete(
  '/connect',
  ...tenant,
  requirePermission('integration:manage'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId: req.ctx.workspaceId, provider: PROVIDER, userId: null } });
    if (conn) {
      await prisma.integrationConnection.update({ where: { id: conn.id }, data: { status: 'NOT_CONNECTED' } });
      await prisma.$transaction((tx) =>
        recordAudit(tx, { workspaceId: req.ctx.workspaceId, actor: actorOf(req), action: 'INTEGRATION_DISCONNECTED', entityType: 'IntegrationConnection', entityId: conn.id, before: { provider: PROVIDER } })
      );
    }
    ok(req, res, { connected: false });
  })
);

vonageRouter.get(
  '/status',
  ...tenant,
  asyncHandler<ScopedRequest>(async (req, res) => {
    const conn = await prisma.integrationConnection.findFirst({ where: { workspaceId: req.ctx.workspaceId, provider: PROVIDER, userId: null } });
    const scope = { provider: PROVIDER, OR: [{ workspaceId: req.ctx.workspaceId }, { workspaceId: null }] };
    const [lastOk, errors] = await Promise.all([
      prisma.integrationEvent.findFirst({ where: { ...scope, result: 'OK' }, orderBy: { createdAt: 'desc' } }),
      hasPermission(req, 'integration:manage')
        ? prisma.integrationEvent.findMany({ where: { ...scope, result: { in: ['FAILED', 'REJECTED'] } }, orderBy: { createdAt: 'desc' }, take: 10 })
        : Promise.resolve([]),
    ]);
    ok(req, res, {
      provider: 'vonage-whatsapp-sandbox',
      configuredOnServer: isVonageConfigured(),
      status: !conn || conn.status !== 'CONNECTED' ? 'not_connected' : errors[0] && (!lastOk || errors[0].createdAt > lastOk.createdAt) ? 'error' : 'connected',
      whatsappNumber: (conn?.publicConfig as { whatsappNumber?: string } | null)?.whatsappNumber ?? null,
      lastWorkedAt: lastOk?.createdAt.toISOString() ?? null,
      recentErrors: errors.map((e) => ({ at: e.createdAt.toISOString(), type: e.eventType, result: e.result, detail: e.detail })),
      limits: [
        'Sandbox: only phones that have joined the Vonage WhatsApp sandbox (by sending its passphrase) can send or receive.',
        'Free-form replies are allowed only within 24 hours of the customer’s last message (WhatsApp rule).',
        'Customers who reply STOP are opted out and cannot be messaged.',
        'Text messages only; media is shown as a placeholder.',
      ],
    });
  })
);

// ----------------------------------------------------
// Conversations (I1.1, I1.6) and sending (I1.3, I1.7, I1.9)
// ----------------------------------------------------

/** I1.6: a conversation is visible to the owner of the contact's open lead, or to lead:read_all holders. */
async function assertCanSeeContact(req: ScopedRequest, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId: req.ctx.workspaceId } });
  if (!contact) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  if (hasPermission(req, 'lead:read_all')) return contact;
  const owns = await prisma.lead.findFirst({ where: { workspaceId: req.ctx.workspaceId, contactId, currentOwnerId: req.auth.userId } });
  if (!owns) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  return contact;
}

vonageRouter.get(
  '/conversations',
  ...tenant,
  requirePermission('message:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const visibleContactIds = hasPermission(req, 'lead:read_all')
      ? undefined
      : (await prisma.lead.findMany({ where: { workspaceId: req.ctx.workspaceId, currentOwnerId: req.auth.userId }, select: { contactId: true } }))
          .map((l) => l.contactId)
          .filter(Boolean) as string[];
    const contacts = await prisma.contact.findMany({
      where: { workspaceId: req.ctx.workspaceId, messages: { some: {} }, ...(visibleContactIds ? { id: { in: visibleContactIds } } : {}) },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        leads: { orderBy: { createdAt: 'desc' }, take: 1, include: { currentOwner: { select: { id: true, firstName: true, lastName: true } } } },
      },
      take: 100,
    });
    const items = contacts
      .map((c) => ({
        contactId: c.id,
        name: `${c.firstName} ${c.lastName}`.trim(),
        phone: c.phone,
        optedOut: c.optedOut,
        lastMessage: c.messages[0] ? { body: c.messages[0].body, direction: c.messages[0].direction, status: c.messages[0].status, at: c.messages[0].createdAt.toISOString() } : null,
        leadId: c.leads[0]?.id ?? null,
        assignedEmployee: c.leads[0]?.currentOwner ? { id: c.leads[0].currentOwner.id, name: `${c.leads[0].currentOwner.firstName} ${c.leads[0].currentOwner.lastName}`.trim() } : null,
      }))
      .sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''));
    ok(req, res, { items });
  })
);

vonageRouter.get(
  '/conversations/:contactId',
  ...tenant,
  requirePermission('message:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const contact = await assertCanSeeContact(req, req.params.contactId);
    const [messages, lead] = await Promise.all([
      prisma.message.findMany({ where: { workspaceId: req.ctx.workspaceId, contactId: contact.id }, orderBy: { createdAt: 'asc' }, take: 500 }),
      prisma.lead.findFirst({ where: { contactId: contact.id }, orderBy: { createdAt: 'desc' }, include: { currentOwner: { select: { id: true, firstName: true, lastName: true } } } }),
    ]);
    ok(req, res, {
      contact: { id: contact.id, name: `${contact.firstName} ${contact.lastName}`.trim(), phone: contact.phone, optedOut: contact.optedOut },
      leadId: lead?.id ?? null,
      assignedEmployee: lead?.currentOwner ? { id: lead.currentOwner.id, name: `${lead.currentOwner.firstName} ${lead.currentOwner.lastName}`.trim() } : null,
      canSend: !contact.optedOut,
      cannotSendReason: contact.optedOut ? 'This customer opted out of WhatsApp messages (replied STOP).' : null,
      messages: messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        error: m.errorMessage,
        canRetry: m.direction === 'OUTBOUND' && m.status === 'FAILED' && !contact.optedOut,
        sentById: m.sentById,
        at: m.createdAt.toISOString(),
        deliveredAt: m.deliveredAt?.toISOString() ?? null,
      })),
    });
  })
);

const sendSchema = z.object({ text: z.string().trim().min(1).max(4000), leadId: z.string().uuid().optional() });

vonageRouter.post(
  '/conversations/:contactId/messages',
  ...tenant,
  requirePermission('message:send'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(sendSchema, req.body);
    const contact = await assertCanSeeContact(req, req.params.contactId);
    const leadId =
      input.leadId ??
      (await prisma.lead.findFirst({ where: { contactId: contact.id, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' } }))?.id ??
      null;
    const message = await sendToContact({ workspaceId: req.ctx.workspaceId, contactId: contact.id, leadId, text: input.text, actor: actorOf(req) });
    // 201 even on failure: the message exists, is shown as FAILED with the reason, and can be retried.
    ok(req, res, { id: message.id, status: message.status, error: message.errorMessage, canRetry: message.status === 'FAILED' }, 201);
  })
);

vonageRouter.post(
  '/messages/:id/retry',
  ...tenant,
  requirePermission('message:send'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const message = await retryMessage(req.ctx.workspaceId, req.params.id, actorOf(req));
    ok(req, res, { id: message.id, status: message.status, error: message.errorMessage, canRetry: message.status === 'FAILED' });
  })
);

const optOutSchema = z.object({ optedOut: z.boolean() });

/** POST /contacts/:id/opt-out: staff can mark a customer as not to be messaged (I1.9). */
vonageRouter.post(
  '/contacts/:id/opt-out',
  ...tenant,
  requirePermission('contact:update'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const { optedOut } = parse(optOutSchema, req.body);
    const contact = await prisma.contact.findFirst({ where: { id: req.params.id, workspaceId: req.ctx.workspaceId } });
    if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
    await prisma.$transaction(async (tx) => {
      await tx.contact.update({ where: { id: contact.id }, data: { optedOut, version: { increment: 1 } } });
      await recordAudit(tx, { workspaceId: req.ctx.workspaceId, actor: actorOf(req), action: optedOut ? 'CONTACT_OPTED_OUT' : 'CONTACT_OPTED_IN', entityType: 'Contact', entityId: contact.id, before: { optedOut: contact.optedOut }, after: { optedOut } });
    });
    ok(req, res, { contactId: contact.id, optedOut });
  })
);
