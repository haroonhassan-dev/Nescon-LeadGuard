import { Lead, Prisma } from '@prisma/client';
import { ResolvedSettings } from './settings';

/**
 * Recovery queue item (glossary): unacknowledged beyond its window, escalated two or more
 * times (configurable), or no recorded action for the idle period. Unassigned leads and
 * leads whose escalation chain ran out are included too, because nobody is acting on them.
 */
export function buildRecoveryWhere(workspaceId: string, settings: ResolvedSettings, now: Date): Prisma.LeadWhereInput {
  const idleSince = new Date(now.getTime() - settings.idleThresholdSeconds * 1000);
  return {
    workspaceId,
    status: { not: 'CLOSED' },
    OR: [
      { status: 'ASSIGNED', ackDeadline: { lt: now } },
      { escalationExhausted: true },
      { status: 'UNASSIGNED' },
      { escalationCount: { gte: settings.recoveryEscalationThreshold } },
      { lastActivityAt: { lt: idleSince } },
    ],
  };
}

export function recoveryReasons(lead: Lead, settings: ResolvedSettings, now: Date): string[] {
  const reasons: string[] = [];
  if (lead.status === 'ASSIGNED' && lead.ackDeadline && lead.ackDeadline < now) {
    const overdue = Math.round((now.getTime() - lead.ackDeadline.getTime()) / 1000);
    reasons.push(`Not acknowledged, ${overdue}s past its window`);
  }
  if (lead.escalationExhausted) reasons.push('Escalation chain exhausted: no one further is eligible');
  if (lead.status === 'UNASSIGNED') reasons.push('No eligible employee available to take it');
  if (lead.escalationCount >= settings.recoveryEscalationThreshold) {
    reasons.push(`Escalated ${lead.escalationCount} times`);
  }
  const idleSeconds = Math.round((now.getTime() - lead.lastActivityAt.getTime()) / 1000);
  if (idleSeconds > settings.idleThresholdSeconds) reasons.push(`No recorded action for ${formatDuration(idleSeconds)}`);
  return reasons;
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}
