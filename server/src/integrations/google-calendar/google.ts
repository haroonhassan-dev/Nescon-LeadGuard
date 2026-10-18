/**
 * Google OAuth 2.0 + Calendar REST calls (I3.1–I3.3), using plain HTTPS.
 * Tokens live only on the server, encrypted in integration_connections (one row per employee).
 */
import { prisma } from '../../lib/prisma';
import { encrypt, decrypt } from '../../lib/secrets';
import { AppError } from '../../middleware/errorHandler';

export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

const PROVIDER = 'google_calendar';

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || /mock|placeholder/i.test(clientId)) {
    throw new AppError('Google Calendar is not set up on the server (GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI)', 503, 'INTEGRATION_NOT_CONFIGURED');
  }
  return { clientId, clientSecret, redirectUri };
}

export function authUrl(state: string): string {
  const { clientId, redirectUri } = googleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // gives a refresh token
    prompt: 'consent', // always return a refresh token, even on reconnect
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  return { ok: res.ok, data };
}

/** Exchanges the one-time code from the consent screen for tokens and stores them encrypted. */
export async function completeConnection(code: string, workspaceId: string, userId: string) {
  const { clientId, clientSecret, redirectUri } = googleConfig();
  const { ok, data } = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  if (!ok || !data.access_token || !data.refresh_token) {
    throw new AppError(`Google sign-in failed: ${data.error_description || data.error || 'no refresh token returned'}`, 400, 'PROVIDER_REJECTED');
  }
  // The id_token is a JWT from Google over TLS; we only read the email from it for display.
  const email = data.id_token
    ? (JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString()) as { email?: string }).email ?? null
    : null;
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  const existing = await prisma.integrationConnection.findFirst({ where: { workspaceId, provider: PROVIDER, userId } });
  const values = {
    status: 'CONNECTED',
    encryptedConfig: encrypt(JSON.stringify(tokens)),
    publicConfig: { email },
    lastSuccessAt: new Date(),
    lastError: null,
  };
  if (existing) await prisma.integrationConnection.update({ where: { id: existing.id }, data: values });
  else await prisma.integrationConnection.create({ data: { workspaceId, provider: PROVIDER, userId, ...values } });
  return { email };
}

export async function getConnection(workspaceId: string, userId: string) {
  return prisma.integrationConnection.findFirst({ where: { workspaceId, provider: PROVIDER, userId } });
}

/** Returns a valid access token, refreshing it automatically; marks the connection broken if revoked (I3.2). */
export async function accessTokenFor(workspaceId: string, userId: string): Promise<string> {
  const conn = await getConnection(workspaceId, userId);
  if (!conn || conn.status === 'NOT_CONNECTED' || !conn.encryptedConfig) {
    throw new AppError('This employee has not connected Google Calendar, so they cannot be booked yet.', 409, 'CALENDAR_NOT_CONNECTED');
  }
  let tokens: StoredTokens;
  try {
    tokens = JSON.parse(decrypt(conn.encryptedConfig)) as StoredTokens;
  } catch {
    await markBroken(conn.id, 'Stored tokens could not be read; reconnect Google Calendar');
    throw new AppError('Google Calendar needs to be reconnected', 409, 'CALENDAR_NEEDS_RECONNECT');
  }
  if (tokens.expiresAt - Date.now() > 60_000) return tokens.accessToken;

  const { clientId, clientSecret } = googleConfig();
  const { ok, data } = await tokenRequest({
    refresh_token: tokens.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
  if (!ok || !data.access_token) {
    // invalid_grant = revoked by the user, or expired (testing-mode apps get short-lived refresh tokens).
    await markBroken(conn.id, `Google refused the refresh: ${data.error_description || data.error}`);
    throw new AppError('Google Calendar access was revoked or expired. Reconnect it in settings.', 409, 'CALENDAR_NEEDS_RECONNECT');
  }
  const next: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await prisma.integrationConnection.update({
    where: { id: conn.id },
    data: { encryptedConfig: encrypt(JSON.stringify(next)), lastSuccessAt: new Date(), lastError: null, status: 'CONNECTED' },
  });
  return next.accessToken;
}

async function markBroken(id: string, reason: string) {
  await prisma.integrationConnection.update({ where: { id }, data: { status: 'ERROR', lastError: reason } });
}

export async function disconnect(workspaceId: string, userId: string) {
  const conn = await getConnection(workspaceId, userId);
  if (!conn) return;
  if (conn.encryptedConfig) {
    try {
      const tokens = JSON.parse(decrypt(conn.encryptedConfig)) as StoredTokens;
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refreshToken)}`, { method: 'POST' });
    } catch {
      // Revocation is best-effort; we forget the tokens either way.
    }
  }
  await prisma.integrationConnection.update({
    where: { id: conn.id },
    data: { status: 'NOT_CONNECTED', encryptedConfig: null, lastError: null },
  });
}

/** Authenticated Calendar API call with plain-language errors. */
export async function calendarApi<T>(workspaceId: string, userId: string, method: string, path: string, body?: unknown): Promise<T> {
  const token = await accessTokenFor(workspaceId, userId);
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError('Could not reach Google Calendar. Try again in a moment.', 503, 'PROVIDER_UNAVAILABLE');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (res.status === 401) throw new AppError('Google Calendar needs to be reconnected', 409, 'CALENDAR_NEEDS_RECONNECT');
  if (res.status === 410 || res.status === 404) throw new AppError('The Google event no longer exists', 404, 'NOT_FOUND');
  if (!res.ok) throw new AppError(`Google Calendar error: ${data.error?.message ?? res.statusText}`, 502, 'PROVIDER_ERROR');
  return data;
}

export async function busyTimes(workspaceId: string, userId: string, timeMin: Date, timeMax: Date) {
  const data = await calendarApi<{ calendars: Record<string, { busy: Array<{ start: string; end: string }> }> }>(
    workspaceId,
    userId,
    'POST',
    '/freeBusy',
    { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString(), items: [{ id: 'primary' }] }
  );
  return data.calendars?.primary?.busy ?? [];
}
