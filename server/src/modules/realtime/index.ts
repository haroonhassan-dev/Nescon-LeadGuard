import { Router, Response } from 'express';
import { asyncHandler, ok } from '../../lib/http';
import { randomToken } from '../../lib/crypto';
import { subscribe } from '../../lib/events';
import { AppError } from '../../middleware/errorHandler';
import { ScopedRequest } from '../../middleware/workspaceContext';

/**
 * Real-time updates over Server-Sent Events (Q11).
 *
 * Browsers' EventSource cannot send an Authorization header, so the client first asks for a
 * one-time ticket (authenticated), then opens the stream with it:
 *   POST /api/realtime/ticket            → { ticket }
 *   GET  /api/realtime/stream?ticket=... → text/event-stream
 * Tickets are single-use and expire after 60 s, so the session token never appears in a URL.
 */
interface Ticket {
  userId: string;
  workspaceId: string;
  expiresAt: number;
}

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, Ticket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, t] of tickets) if (t.expiresAt <= now) tickets.delete(key);
}, TICKET_TTL_MS).unref();

/** Mounted behind authenticate + requireWorkspaceContext. */
export const realtimeTicketRouter = Router();

realtimeTicketRouter.post(
  '/ticket',
  asyncHandler<ScopedRequest>(async (req, res) => {
    const ticket = randomToken(24);
    tickets.set(ticket, { userId: req.auth.userId, workspaceId: req.ctx.workspaceId, expiresAt: Date.now() + TICKET_TTL_MS });
    ok(req, res, { ticket, expiresInSeconds: TICKET_TTL_MS / 1000 });
  })
);

/** Public route: authenticated by the ticket itself. */
export const realtimeStreamRouter = Router();

realtimeStreamRouter.get('/stream', (req, res: Response, next) => {
  const key = typeof req.query.ticket === 'string' ? req.query.ticket : '';
  const ticket = tickets.get(key);
  tickets.delete(key);
  if (!ticket || ticket.expiresAt <= Date.now()) {
    return next(new AppError('Stream ticket is invalid or expired', 401, 'UNAUTHORIZED'));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ workspaceId: ticket.workspaceId })}\n\n`);

  const unsubscribe = subscribe(ticket.workspaceId, (event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
