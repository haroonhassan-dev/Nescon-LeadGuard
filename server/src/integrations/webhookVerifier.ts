/**
 * Webhook Verification & Deduplication Utilities
 * Ensures external payloads are authentic and processed strictly once.
 */

import { IdempotencyStore, WebhookVerificationResult } from './types';

// In-memory LRU/TTL idempotency tracker for local development and testing
class InMemoryIdempotencyStore implements IdempotencyStore {
  private processedKeys = new Map<string, number>();

  async hasProcessed(key: string): Promise<boolean> {
    const expiresAt = this.processedKeys.get(key);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.processedKeys.delete(key);
      return false;
    }
    return true;
  }

  async markProcessed(key: string, ttlSeconds = 86400): Promise<void> {
    this.processedKeys.set(key, Date.now() + ttlSeconds * 1000);
  }
}

export const defaultIdempotencyStore: IdempotencyStore = new InMemoryIdempotencyStore();

/**
 * Validates webhook idempotency key. Returns true if first time seen, false if replay/duplicate.
 */
export async function checkAndRecordWebhookIdempotency(
  idempotencyKey: string,
  store: IdempotencyStore = defaultIdempotencyStore
): Promise<boolean> {
  const isDuplicate = await store.hasProcessed(idempotencyKey);
  if (isDuplicate) {
    return false;
  }
  await store.markProcessed(idempotencyKey);
  return true;
}

/**
 * Placeholder verification guard for Integration Developer to connect actual crypto HMAC logic.
 */
export function verifySignatureHeader(
  expectedSecret: string | undefined,
  receivedHeader: string | undefined
): WebhookVerificationResult {
  if (!expectedSecret) {
    return {
      isValid: false,
      reason: 'Webhook signing secret is unconfigured in server environment',
    };
  }
  if (!receivedHeader) {
    return {
      isValid: false,
      reason: 'Missing webhook signature header',
    };
  }
  return { isValid: true };
}
