/**
 * Vonage Messages API (WhatsApp sandbox) client and webhook signature verification.
 *
 * Sending:   POST {VONAGE_API_URL}/v1/messages with HTTP Basic auth (API key + secret).
 * Webhooks:  Vonage sends `Authorization: Bearer <JWT>` signed with HMAC-SHA256 using the
 *            account's signature secret. The JWT carries `payload_hash` = SHA-256 of the body,
 *            so a valid token cannot be reused with a different payload (I1.2).
 */
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '../../middleware/errorHandler';

export function vonageConfig() {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const number = (process.env.VONAGE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  if (!apiKey || !apiSecret || !number) {
    throw new AppError('WhatsApp messaging is not set up on the server (VONAGE_API_KEY / SECRET / WHATSAPP_NUMBER)', 503, 'INTEGRATION_NOT_CONFIGURED');
  }
  return {
    apiKey,
    apiSecret,
    number,
    apiUrl: (process.env.VONAGE_API_URL || 'https://messages-sandbox.nexmo.com').replace(/\/$/, ''),
  };
}

export function isVonageConfigured(): boolean {
  try {
    vonageConfig();
    return true;
  } catch {
    return false;
  }
}

/** Vonage uses digits only ("923001234567"); contacts are stored in E.164 ("+923001234567"). */
export const toE164 = (digits: string) => `+${digits.replace(/\D/g, '')}`;
export const toVonage = (phone: string) => phone.replace(/\D/g, '');

export class SendError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
  }
}

/** Sends a WhatsApp text. Returns Vonage's message_uuid, or throws SendError with a readable reason. */
export async function sendWhatsApp(to: string, text: string): Promise<string> {
  const cfg = vonageConfig();
  let res: Response;
  try {
    res = await fetch(`${cfg.apiUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ channel: 'whatsapp', message_type: 'text', from: cfg.number, to: toVonage(to), text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SendError('Could not reach Vonage (network problem). You can retry.', true);
  }
  const data = (await res.json().catch(() => ({}))) as { message_uuid?: string; title?: string; detail?: string };
  if (res.ok && data.message_uuid) return data.message_uuid;
  const reason = [data.title, data.detail].filter(Boolean).join(': ') || `HTTP ${res.status}`;
  if (res.status === 401) throw new SendError(`Vonage rejected the API credentials (${reason})`, false);
  // 429 and 5xx are temporary; 4xx (bad number, not joined to sandbox...) need a change first.
  throw new SendError(`Vonage refused the message: ${reason}`, res.status === 429 || res.status >= 500);
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/**
 * Verifies a Vonage signed webhook. Returns null when valid, or the reason it was rejected.
 */
export function verifyVonageSignature(authorization: string | undefined, rawBody: Buffer | undefined): string | null {
  const secret = process.env.VONAGE_SIGNATURE_SECRET;
  if (!secret) return 'VONAGE_SIGNATURE_SECRET is not configured on the server';
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const parts = token.split('.');
  if (parts.length !== 3) return 'missing or malformed signed token';
  const [header, payload, signature] = parts;

  let alg: string | undefined;
  let claims: { payload_hash?: string; iat?: number; api_key?: string };
  try {
    alg = (JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: string }).alg;
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return 'token is not valid JSON';
  }
  if (alg !== 'HS256') return `unexpected token algorithm ${alg}`;

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'signature does not match';

  if (claims.api_key && process.env.VONAGE_API_KEY && claims.api_key !== process.env.VONAGE_API_KEY) {
    return 'token was issued for a different Vonage account';
  }
  if (claims.payload_hash) {
    const bodyHash = createHash('sha256').update(rawBody ?? Buffer.alloc(0)).digest('hex');
    if (bodyHash !== claims.payload_hash) return 'body was altered (payload hash mismatch)';
  }
  if (claims.iat && Math.abs(Date.now() / 1000 - claims.iat) > 15 * 60) return 'token is too old (possible replay)';
  return null;
}

/** Test helper: builds a token exactly like Vonage does. */
export function signLikeVonage(rawBody: string, secret: string, apiKey?: string): string {
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        iat: Math.floor(Date.now() / 1000),
        jti: `${Date.now()}-${Math.random()}`,
        iss: 'Vonage',
        payload_hash: createHash('sha256').update(rawBody).digest('hex'),
        api_key: apiKey,
      })
    )
  );
  const sig = b64url(createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}
