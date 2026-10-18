/**
 * Escalation alert contract between the lead engine and the notification integration (I4).
 *
 * The lead engine writes a Notification row inside the escalation transaction (outbox).
 * The worker then calls the registered sender. The Integrations Developer registers the
 * Telegram sender once at startup:
 *
 *   import { registerNotificationSender } from '../lib/notifications';
 *   registerNotificationSender(async (alert) => { ...send...; return { channel: 'telegram', externalId }; });
 *
 * A thrown error is recorded and retried (bounded); it never undoes or repeats the assignment.
 * Throw PermanentNotificationError for errors that retrying cannot fix (e.g. no chat id).
 */
export interface EscalationAlert {
  notificationId: string;
  workspaceId: string;
  leadId: string;
  leadTitle: string;
  source: string;
  reason: string;
  leadUrl: string;
  recipient: {
    userId: string;
    name: string;
    email: string;
    telegramChatId: string | null;
    notificationEmail: string | null;
  };
}

export interface SendResult {
  channel: string;
  externalId?: string;
}

export type NotificationSender = (alert: EscalationAlert) => Promise<SendResult>;

export class PermanentNotificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentNotificationError';
  }
}

let sender: NotificationSender | null = null;

export function registerNotificationSender(fn: NotificationSender): void {
  sender = fn;
}

export function getNotificationSender(): NotificationSender | null {
  return sender;
}
