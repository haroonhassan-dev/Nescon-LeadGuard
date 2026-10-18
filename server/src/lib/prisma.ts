import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Keeps each server process to a small connection pool. Supabase's session pooler allows only
 * 15 clients in total, and Prisma's default pool scales with CPU count, so two processes (API on
 * Render + a local run) could exhaust it. Override with DB_POOL_SIZE or connection_limit in the URL.
 */
function withPoolLimit(url: string | undefined): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${Number(process.env.DB_POOL_SIZE) || 5}`;
}

const url = withPoolLimit(process.env.DATABASE_URL);

/**
 * Shared Prisma client. Integrations import this instead of creating their own,
 * so the whole server uses one connection pool.
 */
export const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

export type Tx = Prisma.TransactionClient;

/** True when a Prisma error is a unique-constraint violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** Real connectivity probe for the health endpoint. */
export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
