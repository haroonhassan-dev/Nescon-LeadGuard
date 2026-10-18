/**
 * Message Domain Contract
 * Omnichannel messaging covering Twilio SMS, Telegram bot, and customer comms.
 * Built for idempotent webhook ingestion and deduplication.
 */

export type MessageChannel = 'TWILIO_SMS' | 'TELEGRAM' | 'EMAIL' | 'INTERNAL_NOTE';

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type MessageDeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'UNDELIVERED'
  | 'FAILED'
  | 'RECEIVED';

export interface Message {
  id: string;
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  channel: MessageChannel;
  direction: MessageDirection;
  
  sender: string;    // E.164 phone number, Telegram username/id, or email
  recipient: string; // E.164 phone number, Telegram chat ID, or email
  body: string;
  
  status: MessageDeliveryStatus;
  
  /**
   * CRITICAL FOR WEBHOOK DEDUPLICATION:
   * Twilio MessageSid or Telegram Update ID / Message ID.
   * Inbound webhooks must check uniqueness of externalMessageId within workspace.
   */
  externalMessageId?: string;
  idempotencyKey?: string;
  
  rawPayload?: Record<string, unknown>;
  errorMessage?: string;
  
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface SendMessageDTO {
  workspaceId: string;
  leadId?: string;
  contactId?: string;
  channel: MessageChannel;
  recipient: string;
  body: string;
  idempotencyKey?: string;
}

export interface InboundMessageWebhookDTO {
  channel: MessageChannel;
  externalMessageId: string;
  sender: string;
  recipient: string;
  body: string;
  rawPayload: Record<string, unknown>;
}
