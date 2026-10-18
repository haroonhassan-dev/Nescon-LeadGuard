import { Router } from 'express';
import { Appointment } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse } from '../../lib/http';
import { recordAudit } from '../../lib/audit';
import { sign, verify } from '../../lib/secrets';
import { AppError } from '../../middleware/errorHandler';
import { authenticate, requirePermission, hasPermission } from '../../middleware/authMiddleware';
import { requireWorkspaceContext, ScopedRequest } from '../../middleware/workspaceContext';
import { recordLeadAction } from '../../modules/leads/service';
import { authUrl, completeConnection, getConnection, disconnect, busyTimes, calendarApi } from './google';

/**
 * Google Calendar (I3 / rubric criterion 7).
 * Times: clients send ISO-8601 with an offset ("2026-10-20T15:00:00+05:00") plus an IANA zone
 * ("Asia/Karachi"). We store UTC and the zone, and give Google both, so the event shows at the
 * right local time for everyone (I3.5).
 */
export const googleCalendarRouter = Router();

const tenant = [authenticate, requireWorkspaceContext];
const actorOf = (req: ScopedRequest) => ({ type: 'USER' as const, id: req.auth.userId, name: req.auth.name });

const isZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const zone = z.string().refine(isZone, 'Unknown time zone (use an IANA name like Asia/Karachi)');
const instant = z.string().datetime({ offset: true, message: 'Use ISO-8601 with a time zone offset, e.g. 2026-10-20T15:00:00+05:00' });

// ----------------------------------------------------
// Connect / disconnect (I3.1)
// ----------------------------------------------------

/** GET /connect: returns Google's consent URL for the signed-in employee. */
googleCalendarRouter.get(
  '/connect',
  ...tenant,
  asyncHandler<ScopedRequest>(async (req, res) => {
    const state = sign({ userId: req.auth.userId, workspaceId: req.ctx.workspaceId }, 600);
    ok(req, res, { url: authUrl(state) });
  })
);

function page(title: string, message: string, success: boolean): string {
  const color = success ? '#1f7a3a' : '#a12a2a';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;text-align:center">
<h1 style="color:${color};font-size:1.4rem">${esc(title)}</h1><p>${esc(message)}</p><p>You can close this tab.</p>
<script>try{window.opener&&window.opener.postMessage({type:'google-calendar',success:${success}},'*')}catch(e){}</script></body></html>`;
}

/** GET /oauth2callback: Google sends the browser back here with a one-time code. Public route. */
googleCalendarRouter.get(
  '/oauth2callback',
  asyncHandler(async (req, res) => {
    const state = typeof req.query.state === 'string' ? verify<{ userId: string; workspaceId: string }>(req.query.state) : null;
    if (!state) {
      res.status(400).send(page('Connection failed', 'The sign-in link was invalid or expired. Start again from the app.', false));
      return;
    }
    if (typeof req.query.error === 'string') {
      res.status(400).send(page('Connection cancelled', `Google said: ${req.query.error}. Nothing was connected.`, false));
      return;
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    try {
      const { email } = await completeConnection(code, state.workspaceId, state.userId);
      await prisma.$transaction(async (tx) => {
        await recordAudit(tx, {
          workspaceId: state.workspaceId,
          actor: { type: 'USER', id: state.userId },
          action: 'INTEGRATION_CONNECTED',
          entityType: 'IntegrationConnection',
          entityId: `google_calendar:${state.userId}`,
          after: { provider: 'google_calendar', email },
        });
      });
      res.send(page('Google Calendar connected', `Appointments will now be added to ${email ?? 'your calendar'}.`, true));
    } catch (err) {
      res.status(400).send(page('Connection failed', err instanceof Error ? err.message : 'Unknown error', false));
    }
  })
);

googleCalendarRouter.delete(
  '/connection',
  ...tenant,
  asyncHandler<ScopedRequest>(async (req, res) => {
    await disconnect(req.ctx.workspaceId, req.auth.userId);
    await prisma.$transaction((tx) =>
      recordAudit(tx, {
        workspaceId: req.ctx.workspaceId,
        actor: actorOf(req),
        action: 'INTEGRATION_DISCONNECTED',
        entityType: 'IntegrationConnection',
        entityId: `google_calendar:${req.auth.userId}`,
        before: { provider: 'google_calendar' },
      })
    );
    ok(req, res, { disconnected: true });
  })
);

/**
 * GET /status: the caller's own connection; with integration:manage, every member's (I3.7).
 * Status values: CONNECTED | ERROR (needs reconnection) | NOT_CONNECTED.
 */
googleCalendarRouter.get(
  '/status',
  ...tenant,
  asyncHandler<ScopedRequest>(async (req, res) => {
    const describe = (c: Awaited<ReturnType<typeof getConnection>>) => ({
      status: c?.status ?? 'NOT_CONNECTED',
      email: (c?.publicConfig as { email?: string } | null)?.email ?? null,
      lastWorkedAt: c?.lastSuccessAt?.toISOString() ?? null,
      problem: c?.status === 'ERROR' ? c.lastError : c?.status === 'CONNECTED' ? null : 'Not connected: this employee cannot be booked',
    });
    const me = describe(await getConnection(req.ctx.workspaceId, req.auth.userId));
    let team: unknown[] | undefined;
    if (hasPermission(req, 'integration:manage')) {
      const [members, conns] = await Promise.all([
        prisma.membership.findMany({ where: { workspaceId: req.ctx.workspaceId, status: 'ACTIVE' }, include: { user: true } }),
        prisma.integrationConnection.findMany({ where: { workspaceId: req.ctx.workspaceId, provider: 'google_calendar' } }),
      ]);
      const byUser = new Map(conns.map((c) => [c.userId, c]));
      team = members.map((m) => ({ userId: m.userId, name: `${m.user.firstName} ${m.user.lastName}`.trim(), ...describe(byUser.get(m.userId) ?? null) }));
    }
    ok(req, res, {
      me,
      team,
      limits: [
        'Each employee connects their own Google account; only connected employees can be booked.',
        'While the Google app is in testing, only listed test users can connect, and access may expire after 7 days (reconnect when asked).',
        'Changes made directly in Google Calendar are not synced back to the platform.',
      ],
    });
  })
);

// ----------------------------------------------------
// Availability (I3.4)
// ----------------------------------------------------
const busyQuery = z.object({ userId: z.string().uuid().optional(), from: instant, to: instant });

googleCalendarRouter.get(
  '/busy',
  ...tenant,
  requirePermission('appointment:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(busyQuery, req.query);
    const userId = q.userId ?? req.auth.userId;
    await assertMember(req.ctx.workspaceId, userId);
    const busy = await busyTimes(req.ctx.workspaceId, userId, new Date(q.from), new Date(q.to));
    ok(req, res, { userId, busy });
  })
);

async function assertMember(workspaceId: string, userId: string) {
  const member = await prisma.membership.findFirst({ where: { workspaceId, userId, status: 'ACTIVE' } });
  if (!member) throw new AppError('Employee not found in this workspace', 404, 'NOT_FOUND');
}

/** Overlaps from Google busy times AND our own bookings (catches events created seconds ago). */
async function findClashes(workspaceId: string, userId: string, start: Date, end: Date, ignore?: Appointment) {
  const google = await busyTimes(workspaceId, userId, start, end);
  const own = await prisma.appointment.findMany({
    where: {
      workspaceId,
      assignedUserId: userId,
      status: { in: ['CONFIRMED', 'RESCHEDULED'] },
      startTime: { lt: end },
      endTime: { gt: start },
      ...(ignore ? { id: { not: ignore.id } } : {}),
    },
  });
  const clashes: Array<{ start: string; end: string; source: 'google' | 'platform' }> = google
    .filter((b) => !(ignore && new Date(b.start).getTime() === ignore.startTime.getTime() && new Date(b.end).getTime() === ignore.endTime.getTime()))
    .map((b) => ({ start: b.start, end: b.end, source: 'google' }));
  for (const a of own) {
    clashes.push({ start: a.startTime.toISOString(), end: a.endTime.toISOString(), source: 'platform' });
  }
  return clashes;
}

// ----------------------------------------------------
// Appointments (I3.3, I3.5, I3.6)
// ----------------------------------------------------
const bookSchema = z
  .object({
    userId: z.string().uuid().optional(), // employee to book; default = me
    leadId: z.string().uuid().optional(),
    contactId: z.string().uuid().optional(),
    title: z.string().trim().min(2).max(200),
    startTime: instant,
    endTime: instant,
    timezone: zone,
    allowOverlap: z.boolean().default(false),
  })
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), { message: 'End must be after start', path: ['endTime'] })
  .refine((v) => new Date(v.startTime).getTime() > Date.now() - 60_000, { message: 'Start is in the past', path: ['startTime'] });

function present(a: Appointment) {
  return {
    id: a.id,
    title: a.title,
    status: a.status,
    startTime: a.startTime.toISOString(), // UTC
    endTime: a.endTime.toISOString(),
    timezone: a.timezone,
    localStart: a.startTime.toLocaleString('en-GB', { timeZone: a.timezone, dateStyle: 'medium', timeStyle: 'short' }),
    assignedUserId: a.assignedUserId,
    leadId: a.leadId,
    contactId: a.contactId,
    googleCalendarEventId: a.googleCalendarEventId,
  };
}

googleCalendarRouter.post(
  '/appointments',
  ...tenant,
  requirePermission('appointment:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(bookSchema, req.body);
    const workspaceId = req.ctx.workspaceId;
    const userId = input.userId ?? req.auth.userId;
    await assertMember(workspaceId, userId);

    let contactId = input.contactId ?? null;
    if (input.leadId) {
      const lead = await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } });
      if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
      contactId = contactId ?? lead.contactId;
    }
    if (contactId && !(await prisma.contact.findFirst({ where: { id: contactId, workspaceId } }))) {
      throw new AppError('Contact not found', 404, 'NOT_FOUND');
    }

    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    const clashes = await findClashes(workspaceId, userId, start, end); // also fails clearly if not connected
    if (clashes.length > 0 && !input.allowOverlap) {
      throw new AppError('That time clashes with something already in the calendar', 409, 'CALENDAR_CONFLICT',
        clashes.map((c) => ({ field: 'startTime', message: `Busy ${c.start} → ${c.end}`, code: 'BUSY' })));
    }

    const event = await calendarApi<{ id: string; htmlLink: string }>(workspaceId, userId, 'POST', '/calendars/primary/events', {
      summary: input.title,
      description: 'Booked from Nescon-LeadGuard',
      start: { dateTime: start.toISOString(), timeZone: input.timezone },
      end: { dateTime: end.toISOString(), timeZone: input.timezone },
    });

    const appointment = await prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          workspaceId,
          leadId: input.leadId ?? null,
          contactId,
          assignedUserId: userId,
          title: input.title,
          startTime: start,
          endTime: end,
          timezone: input.timezone,
          status: 'CONFIRMED',
          googleCalendarEventId: event.id,
        },
      });
      await recordAudit(tx, {
        workspaceId,
        actor: actorOf(req),
        action: 'APPOINTMENT_SCHEDULED',
        entityType: 'Appointment',
        entityId: created.id,
        after: { title: created.title, start: start.toISOString(), timezone: input.timezone, assignedUserId: userId, googleEventId: event.id },
      });
      return created;
    });

    if (appointment.leadId) {
      await recordLeadAction({
        workspaceId,
        leadId: appointment.leadId,
        actor: actorOf(req),
        kind: 'APPOINTMENT',
        body: `Appointment booked: ${present(appointment).localStart} (${appointment.timezone})`,
      });
    }
    ok(req, res, { ...present(appointment), googleLink: event.htmlLink, warnings: clashes.length ? ['Booked despite a clash'] : [] }, 201);
  })
);

const listQuery = z.object({
  leadId: z.string().uuid().optional(),
  contactId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  upcoming: z.coerce.boolean().optional(),
});

googleCalendarRouter.get(
  '/appointments',
  ...tenant,
  requirePermission('appointment:read'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const q = parse(listQuery, req.query);
    const items = await prisma.appointment.findMany({
      where: {
        workspaceId: req.ctx.workspaceId,
        ...(q.leadId ? { leadId: q.leadId } : {}),
        ...(q.contactId ? { contactId: q.contactId } : {}),
        ...(q.userId ? { assignedUserId: q.userId } : {}),
        ...(q.upcoming ? { startTime: { gte: new Date() }, status: { not: 'CANCELLED' } } : {}),
      },
      orderBy: { startTime: 'asc' },
      take: 100,
    });
    ok(req, res, { items: items.map(present) });
  })
);

async function findAppointment(req: ScopedRequest, id: string) {
  const a = await prisma.appointment.findFirst({ where: { id, workspaceId: req.ctx.workspaceId } });
  if (!a) throw new AppError('Appointment not found', 404, 'NOT_FOUND');
  return a;
}

const rescheduleSchema = z
  .object({ startTime: instant, endTime: instant, timezone: zone.optional(), allowOverlap: z.boolean().default(false) })
  .refine((v) => new Date(v.endTime) > new Date(v.startTime), { message: 'End must be after start', path: ['endTime'] });

/** PATCH /appointments/:id: reschedule; updates the Google event and the history (I3.6). */
googleCalendarRouter.patch(
  '/appointments/:id',
  ...tenant,
  requirePermission('appointment:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const input = parse(rescheduleSchema, req.body);
    const before = await findAppointment(req, req.params.id);
    if (before.status === 'CANCELLED') throw new AppError('Cancelled appointments cannot be rescheduled', 409, 'APPOINTMENT_CANCELLED');
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);
    const timezone = input.timezone ?? before.timezone;
    const clashes = await findClashes(req.ctx.workspaceId, before.assignedUserId, start, end, before);
    if (clashes.length > 0 && !input.allowOverlap) {
      throw new AppError('The new time clashes with something already in the calendar', 409, 'CALENDAR_CONFLICT',
        clashes.map((c) => ({ field: 'startTime', message: `Busy ${c.start} → ${c.end}`, code: 'BUSY' })));
    }
    if (before.googleCalendarEventId) {
      await calendarApi(req.ctx.workspaceId, before.assignedUserId, 'PATCH', `/calendars/primary/events/${before.googleCalendarEventId}`, {
        start: { dateTime: start.toISOString(), timeZone: timezone },
        end: { dateTime: end.toISOString(), timeZone: timezone },
      });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.appointment.update({ where: { id: before.id }, data: { startTime: start, endTime: end, timezone, status: 'RESCHEDULED' } });
      await recordAudit(tx, {
        workspaceId: req.ctx.workspaceId,
        actor: actorOf(req),
        action: 'APPOINTMENT_RESCHEDULED',
        entityType: 'Appointment',
        entityId: a.id,
        before: { start: before.startTime.toISOString(), timezone: before.timezone },
        after: { start: start.toISOString(), timezone },
      });
      return a;
    });
    if (updated.leadId) {
      await recordLeadAction({
        workspaceId: req.ctx.workspaceId,
        leadId: updated.leadId,
        actor: actorOf(req),
        kind: 'APPOINTMENT',
        body: `Appointment moved to ${present(updated).localStart} (${updated.timezone})`,
      });
    }
    ok(req, res, present(updated));
  })
);

/** DELETE /appointments/:id: cancel; removes the Google event (I3.6). */
googleCalendarRouter.delete(
  '/appointments/:id',
  ...tenant,
  requirePermission('appointment:create'),
  asyncHandler<ScopedRequest>(async (req, res) => {
    const before = await findAppointment(req, req.params.id);
    if (before.status === 'CANCELLED') {
      ok(req, res, present(before));
      return;
    }
    if (before.googleCalendarEventId) {
      try {
        await calendarApi(req.ctx.workspaceId, before.assignedUserId, 'DELETE', `/calendars/primary/events/${before.googleCalendarEventId}`);
      } catch (err) {
        // Already deleted in Google: still cancel here.
        if (!(err instanceof AppError && err.statusCode === 404)) throw err;
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const a = await tx.appointment.update({ where: { id: before.id }, data: { status: 'CANCELLED' } });
      await recordAudit(tx, {
        workspaceId: req.ctx.workspaceId,
        actor: actorOf(req),
        action: 'APPOINTMENT_CANCELLED',
        entityType: 'Appointment',
        entityId: a.id,
        before: { status: before.status, start: before.startTime.toISOString() },
        after: { status: 'CANCELLED' },
      });
      return a;
    });
    if (updated.leadId) {
      await recordLeadAction({
        workspaceId: req.ctx.workspaceId,
        leadId: updated.leadId,
        actor: actorOf(req),
        kind: 'APPOINTMENT',
        body: `Appointment cancelled (was ${present(before).localStart})`,
      });
    }
    ok(req, res, present(updated));
  })
);
