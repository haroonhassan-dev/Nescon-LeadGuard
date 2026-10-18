/**
 * Integration Adapter Contracts
 * Implemented by the Integration Developer (server/src/integrations/**).
 */

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
}

export interface IdempotencyStore {
  hasProcessed(key: string): Promise<boolean>;
  markProcessed(key: string, ttlSeconds?: number): Promise<void>;
}

export interface TwilioAdapter {
  verifySignature(url: string, params: Record<string, string>, signatureHeader: string): boolean;
  sendSms(to: string, message: string): Promise<{ messageSid: string; status: string }>;
}

export interface StripeAdapter {
  verifyWebhookSignature(payload: string | Buffer, signatureHeader: string): boolean;
  createPaymentIntent(amountCents: number, currency: string, metadata: Record<string, string>): Promise<{ id: string; clientSecret: string }>;
}

export interface GoogleCalendarAdapter {
  createEvent(calendarId: string, event: { title: string; startTime: string; endTime: string; description?: string }): Promise<{ eventId: string; htmlLink: string }>;
  syncFreeBusySlots(timeMin: string, timeMax: string): Promise<Array<{ start: string; end: string }>>;
}

export interface TelegramAdapter {
  verifyWebhookSecret(secretToken: string): boolean;
  sendMessage(chatId: string, text: string): Promise<{ messageId: number; ok: boolean }>;
}
