import { PrismaClient, Prisma } from '@prisma/client';

/**
 * Shared Prisma client. Integrations import this instead of creating their own,
 * so the whole server uses one connection pool.
 */
export const prisma = new PrismaClient();

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
