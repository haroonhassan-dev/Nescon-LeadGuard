/**
 * Telegram escalation alerts (I4 / rubric criterion 8).
 *
 * The lead engine writes an outbox row when a lead escalates; the worker calls the sender
 * registered here. Each employee links their own chat (I4.3): they press Start in the bot,
 * then POST /api/integrations/telegram/link finds their chat and saves it.
 */
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok } from '../../lib/http';
import { registerNotificationSender, PermanentNotificationError } from '../../lib/notifications';
import { AppError } from '../../middleware/errorHandler';
import { authenticate } from '../../middleware/authMiddleware';
import { requireWorkspaceContext, ScopedRequest } from '../../middleware/workspaceContext';

export const telegramRouter = Router();

function token(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && /^\d+:[\w-]{20,}$/.test(t) ? t : null;
}

async function telegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const t = token();
  if (!t) throw new PermanentNotificationError('TELEGRAM_BOT_TOKEN is not configured on the server');
  let res: Response;
  try {
    res = await fetch(`https://api.telegram.org/bot${t}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('Could not reach Telegram (network error); will retry');
  }
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) {
    // 400/403 (bad chat, bot blocked) will not fix themselves; 429/5xx are worth retrying.
    const message = `Telegram ${data.error_code}: ${data.description}`;
    if (data.error_code === 400 || data.error_code === 403 || data.error_code === 401) throw new PermanentNotificationError(message);
    throw new Error(message);
  }
  return data.result as T;
}

registerNotificationSender(async (alert) => {
  if (!alert.recipient.telegramChatId) {
    throw new PermanentNotificationError(`${alert.recipient.name} has not linked Telegram yet`);
  }
  const text = [
    '🚨 Lead escalated to you',
    '',
    `Lead: ${alert.leadTitle}`,
    `Source: ${alert.source.replace('_', ' ')}`,
    `Why: ${alert.reason}`,
    '',
    `Open it: ${alert.leadUrl}`,
  ].join('\n');
  const message = await telegram<{ message_id: number }>('sendMessage', {
    chat_id: alert.recipient.telegramChatId,
    text,
    disable_web_page_preview: true,
  });
  return { channel: 'telegram', externalId: String(message.message_id) };
});

/**
 * POST /api/integrations/telegram/link
 * The employee presses Start in the bot first; this finds the newest private chat that
 * messaged the bot and saves it as their alert destination, then sends a confirmation.
 */
telegramRouter.post(
  '/link',
  authenticate,
  requireWorkspaceContext,
  asyncHandler<ScopedRequest>(async (req, res) => {
    if (!token()) throw new AppError('Telegram is not set up on the server (TELEGRAM_BOT_TOKEN missing)', 503, 'INTEGRATION_NOT_CONFIGURED');
    const updates = await telegram<Array<{ message?: { chat: { id: number; type: string; first_name?: string } } }>>('getUpdates', {
      allowed_updates: ['message'],
    });
    const chats = updates.map((u) => u.message?.chat).filter((c) => c && c.type === 'private');
    const chat = chats[chats.length - 1];
    if (!chat) {
      throw new AppError('Open the bot in Telegram, press Start (or send any message), then try again.', 409, 'TELEGRAM_CHAT_NOT_FOUND');
    }
    await prisma.membership.update({ where: { id: req.ctx.membershipId }, data: { telegramChatId: String(chat.id) } });
    await telegram('sendMessage', { chat_id: chat.id, text: '✅ Linked. You will get Nescon-LeadGuard escalation alerts here.' });
    ok(req, res, { linked: true, chatName: chat.first_name ?? null });
  })
);

/** POST /api/integrations/telegram/test: sends a test alert to the caller's linked chat. */
telegramRouter.post(
  '/test',
  authenticate,
  requireWorkspaceContext,
  asyncHandler<ScopedRequest>(async (req, res) => {
    const member = await prisma.membership.findUniqueOrThrow({ where: { id: req.ctx.membershipId } });
    if (!member.telegramChatId) throw new AppError('Link your Telegram first', 409, 'TELEGRAM_NOT_LINKED');
    await telegram('sendMessage', { chat_id: member.telegramChatId, text: '🔔 Test alert from Nescon-LeadGuard' });
    ok(req, res, { sent: true });
  })
);
