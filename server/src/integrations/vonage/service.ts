import { Message } from '@prisma/client';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { AuditActor, recordAudit } from '../../lib/audit';
import { publish } from '../../lib/events';
import { AppError } from '../../middleware/errorHandler';
import { ingestLead, recordLeadAction } from '../../modules/leads/service';
import { sendWhatsApp, SendError, toE164, vonageConfig } from './client';

const PROVIDER = 'vonage';
const OPT_OUT_WORDS = new Set(['STOP', 'UNSUBSCRIBE', 'STOPALL', 'CANCEL', 'END', 'QUIT']);

export interface InboundPayload {
  message_uuid: string;
  channel?: string;
  message_type?: string;
  from: string;
  to: string;
  text?: string;
  timestamp?: string;
  profile?: { name?: string };
}

export interface StatusPayload {
  message_uuid: string;
  status: string;
  timestamp?: string;
  error?: { type?: string; title?: string; detail?: string };
}

/** Which workspace owns the WhatsApp number a message was sent to (set by POST /connect). */
async function workspaceForNumber(number: string): Promise<string | null> {
  const conn = await prisma.integrationConnection.findFirst({
    where: { provider: PROVIDER, status: 'CONNECTED', publicConfig: { path: ['whatsappNumber'], equals: number.replace(/\D/g, '') } },
  });
  return conn?.workspaceId ?? null;
}

async function logEvent(data: { workspaceId?: string | null; eventType: string; externalId?: string | null; result: string; detail?: string; direction?: string }) {
  return prisma.integrationEvent.create({
    data: { provider: PROVIDER, direction: data.direction ?? 'INBOUND', workspaceId: data.workspaceId ?? null, eventType: data.eventType, externalId: data.externalId ?? null, result: data.result, detail: data.detail?.slice(0, 500) },
  });
}

/**
 * Incoming WhatsApp message (I1.1, I1.5, I1.8, I1.9).
 * Known number → attached to the contact (and its open lead). Unknown → new contact + new lead,
 * which the lead engine assigns and escalates like any other lead.
 */
export async function handleInbound(p: InboundPayload): Promise<{ result: string; detail?: string }> {
  const workspaceId = await workspaceForNumber(p.to);
  // Dedupe marker first: a redelivered webhook stops here.
  let marker;
  try {
    marker = await logEvent({ workspaceId, eventType: 'message.inbound', externalId: `in:${p.message_uuid}`, result: 'PROCESSING' });
  } catch (err) {
    if (isUniqueViolation(err)) return { result: 'DUPLICATE' };
    throw err;
  }
  if (!workspaceId) {
    await prisma.integrationEvent.update({ where: { id: marker.id }, data: { result: 'IGNORED', detail: `number ${p.to} is not connected to any workspace` } });
    return { result: 'IGNORED', detail: 'number not connected to a workspace' };
  }

  try {
    const phone = toE164(p.from);
    const text = (p.text ?? `[${p.message_type ?? 'non-text'} message]`).slice(0, 4000);
    const name = p.profile?.name?.trim() || phone;
    const actor: AuditActor = { type: 'INTEGRATION', id: null, name: 'whatsapp (vonage)' };

    let contact = await prisma.contact.findFirst({ where: { workspaceId, phone } });
    let leadId: string | null = null;
    let createdLead = false;
    if (!contact) {
      const { lead } = await ingestLead({
        workspaceId,
        source: 'WHATSAPP',
        contactName: name,
        contactPhone: phone,
        message: text,
        title: `WhatsApp from ${name}`,
        intakeKey: p.message_uuid,
        actor,
      });
      leadId = lead.id;
      createdLead = true;
      contact = await prisma.contact.findUniqueOrThrow({ where: { id: lead.contactId! } });
    } else {
      const open = await prisma.lead.findFirst({
        where: { workspaceId, contactId: contact.id, status: { not: 'CLOSED' } },
        orderBy: { createdAt: 'desc' },
      });
      leadId = open?.id ?? null;
    }

    const message = await prisma.message.create({
      data: {
        workspaceId,
        contactId: contact.id,
        leadId,
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        sender: phone,
        recipient: toE164(p.to),
        body: text,
        status: 'RECEIVED',
        externalMessageId: p.message_uuid,
        sentAt: p.timestamp ? new Date(p.timestamp) : new Date(),
      },
    });

    if (leadId && !createdLead) {
      await recordLeadAction({ workspaceId, leadId, actor, kind: 'MESSAGE', body: `WhatsApp from ${name}: ${text.slice(0, 200)}` });
    }

    if (OPT_OUT_WORDS.has(text.trim().toUpperCase()) && !contact.optedOut) {
      await prisma.$transaction(async (tx) => {
        await tx.contact.update({ where: { id: contact!.id }, data: { optedOut: true, version: { increment: 1 } } });
        await recordAudit(tx, { workspaceId, actor, action: 'CONTACT_OPTED_OUT', entityType: 'Contact', entityId: contact!.id, before: { optedOut: false }, after: { optedOut: true, via: `WhatsApp "${text.trim()}"` } });
      });
    }

    await prisma.integrationEvent.update({ where: { id: marker.id }, data: { result: 'OK', detail: createdLead ? 'new contact + lead' : 'attached to existing contact' } });
    publish({ type: 'message.received', workspaceId, leadId: leadId ?? undefined });
    return { result: 'OK', detail: message.id };
  } catch (err) {
    // Free the dedupe key so Vonage's retry is processed; keep the failure visible.
    await prisma.integrationEvent.update({
      where: { id: marker.id },
      data: { result: 'FAILED', externalId: null, detail: err instanceof Error ? err.message.slice(0, 500) : 'unknown' },
    });
    throw err;
  }
}

const STATUS_MAP: Record<string, string> = {
  submitted: 'SENT',
  delivered: 'DELIVERED',
  read: 'READ',
  rejected: 'FAILED',
  undeliverable: 'FAILED',
};
const RANK: Record<string, number> = { QUEUED: 0, FAILED: 1, SENT: 2, DELIVERED: 3, READ: 4 };

/** Delivery receipts (I1.4). Statuses only move forward; a late "submitted" never undoes "read". */
export async function handleStatus(p: StatusPayload): Promise<{ result: string }> {
  const next = STATUS_MAP[p.status];
  try {
    await logEvent({ eventType: `message.status.${p.status}`, externalId: `st:${p.message_uuid}:${p.status}`, result: 'OK' });
  } catch (err) {
    if (isUniqueViolation(err)) return { result: 'DUPLICATE' };
    throw err;
  }
  if (!next) return { result: 'IGNORED' };
  const msg = await prisma.message.findFirst({ where: { externalMessageId: p.message_uuid, direction: 'OUTBOUND' } });
  if (!msg) return { result: 'IGNORED' };
  if (next !== 'FAILED' && (RANK[next] ?? 0) <= (RANK[msg.status] ?? 0)) return { result: 'OK' };
  if (next === 'FAILED' && (msg.status === 'DELIVERED' || msg.status === 'READ')) return { result: 'OK' };

  await prisma.message.update({
    where: { id: msg.id },
    data: {
      status: next,
      ...(next === 'DELIVERED' || next === 'READ' ? { deliveredAt: msg.deliveredAt ?? new Date(p.timestamp ?? Date.now()) } : {}),
      ...(next === 'FAILED' ? { errorMessage: [p.error?.title, p.error?.detail].filter(Boolean).join(': ') || 'Provider reported the message as undeliverable' } : {}),
    },
  });
  publish({ type: 'message.received', workspaceId: msg.workspaceId, leadId: msg.leadId ?? undefined });
  return { result: 'OK' };
}

/** Sends (or re-sends) one outbound message row. Failures are stored, never dropped (I1.7). */
async function deliver(message: Message, actor: AuditActor): Promise<Message> {
  try {
    const uuid = await sendWhatsApp(message.recipient, message.body);
    const sent = await prisma.message.update({
      where: { id: message.id },
      data: { status: 'SENT', externalMessageId: uuid, sentAt: new Date(), errorMessage: null },
    });
    await logEvent({ workspaceId: message.workspaceId, direction: 'OUTBOUND', eventType: 'message.send', externalId: `out:${uuid}`, result: 'OK' });
    await prisma.$transaction((tx) =>
      recordAudit(tx, { workspaceId: message.workspaceId, actor, action: 'MESSAGE_SENT', entityType: 'Message', entityId: message.id, after: { to: message.recipient, providerId: uuid } })
    );
    return sent;
  } catch (err) {
    const reason = err instanceof SendError ? err.message : err instanceof AppError ? err.message : 'Unexpected error while sending';
    await logEvent({ workspaceId: message.workspaceId, direction: 'OUTBOUND', eventType: 'message.send', result: 'FAILED', detail: reason });
    return prisma.message.update({ where: { id: message.id }, data: { status: 'FAILED', errorMessage: reason } });
  }
}

export async function sendToContact(input: { workspaceId: string; contactId: string; leadId?: string | null; text: string; actor: AuditActor & { id: string } }) {
  const contact = await prisma.contact.findFirst({ where: { id: input.contactId, workspaceId: input.workspaceId } });
  if (!contact) throw new AppError('Contact not found', 404, 'NOT_FOUND');
  if (contact.optedOut) {
    throw new AppError('This customer has opted out of WhatsApp messages (they replied STOP or asked not to be contacted), so they cannot be messaged.', 409, 'CONTACT_OPTED_OUT');
  }
  if (!contact.phone) throw new AppError('This contact has no phone number', 400, 'VALIDATION_FAILED');
  const cfg = vonageConfig();

  const queued = await prisma.message.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      leadId: input.leadId ?? null,
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      sender: toE164(cfg.number),
      recipient: contact.phone,
      body: input.text,
      status: 'QUEUED',
      sentById: input.actor.id,
    },
  });
  const result = await deliver(queued, input.actor);
  // Replying to the customer is a recorded action: for the lead's owner it acknowledges the lead.
  if (result.status !== 'FAILED' && input.leadId) {
    await recordLeadAction({ workspaceId: input.workspaceId, leadId: input.leadId, actor: input.actor, kind: 'MESSAGE', body: `WhatsApp reply: ${input.text.slice(0, 200)}` });
  }
  return result;
}

export async function retryMessage(workspaceId: string, messageId: string, actor: AuditActor) {
  const message = await prisma.message.findFirst({ where: { id: messageId, workspaceId, direction: 'OUTBOUND' } });
  if (!message) throw new AppError('Message not found', 404, 'NOT_FOUND');
  if (message.status !== 'FAILED') throw new AppError('Only failed messages can be retried', 409, 'NOT_FAILED');
  const contact = message.contactId ? await prisma.contact.findUnique({ where: { id: message.contactId } }) : null;
  if (contact?.optedOut) throw new AppError('This customer has opted out, so the message cannot be retried.', 409, 'CONTACT_OPTED_OUT');
  return deliver(message, actor);
}

export { PROVIDER };
