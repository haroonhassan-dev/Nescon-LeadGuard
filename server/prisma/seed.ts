/**
 * DEMO seed: creates "SunCo Solar (DEMO)" with an Owner, an Admin, a Manager and three
 * employees, and short timers (seconds) so escalation can be shown live.
 *
 *   npm run db:seed
 *
 * - Refuses to run when NODE_ENV=production.
 * - Password: SEED_DEMO_PASSWORD from server/.env, or a random one printed once below.
 * - Emails use the reserved .test domain, so they can never reach a real inbox.
 * - Safe to re-run: does nothing if the demo workspace already exists.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import { hashPassword, randomToken } from '../src/lib/crypto';
import { bootstrapWorkspace } from '../src/modules/auth/service';

const prisma = new PrismaClient();

const PEOPLE = [
  { key: 'owner', firstName: 'Ali', lastName: 'Khan', email: 'owner@sunco-demo.test' },
  { key: 'admin', firstName: 'Sara', lastName: 'Ahmed', email: 'admin@sunco-demo.test' },
  { key: 'manager', firstName: 'Usman', lastName: 'Raza', email: 'manager@sunco-demo.test' },
  { key: 'bilal', firstName: 'Bilal', lastName: 'Hassan', email: 'bilal@sunco-demo.test' },
  { key: 'ayesha', firstName: 'Ayesha', lastName: 'Malik', email: 'ayesha@sunco-demo.test' },
  { key: 'omar', firstName: 'Omar', lastName: 'Farooq', email: 'omar@sunco-demo.test' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo accounts with NODE_ENV=production');
  }
  if (await prisma.user.findUnique({ where: { email: PEOPLE[0].email } })) {
    console.log('Demo workspace already exists. Nothing to do.');
    return;
  }

  const password = process.env.SEED_DEMO_PASSWORD || randomToken(12);
  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(
    async (tx) => {
      const users: Record<string, string> = {};
      for (const p of PEOPLE) {
        const user = await tx.user.create({
          data: { email: p.email, passwordHash, firstName: p.firstName, lastName: p.lastName },
        });
        users[p.key] = user.id;
      }

      const { workspace, roles } = await bootstrapWorkspace(tx, {
        name: 'SunCo Solar (DEMO)',
        ownerUserId: users.owner,
        ownerName: 'Ali Khan',
      });

      const members: Array<[string, 'ADMIN' | 'USER', string, 'AVAILABLE' | 'BUSY' | 'OFFLINE']> = [
        ['admin', 'ADMIN', roles.Admin, 'OFFLINE'],
        ['manager', 'USER', roles.Manager, 'BUSY'],
        ['bilal', 'USER', roles.User, 'AVAILABLE'],
        ['ayesha', 'USER', roles.User, 'AVAILABLE'],
        ['omar', 'USER', roles.User, 'AVAILABLE'],
      ];
      for (const [key, baseLevel, roleId, availability] of members) {
        await tx.membership.create({
          data: { workspaceId: workspace.id, userId: users[key], baseLevel, roleId, availability, autoAssignEnabled: key !== 'manager' },
        });
      }

      // Demo timers: 30 s to acknowledge, then next employee (30 s) → backup Omar (30 s) → manager Usman (60 s).
      await tx.assignmentSettings.update({
        where: { workspaceId: workspace.id },
        data: {
          ackTimeoutSeconds: 30,
          maxOpenLeadsPerUser: 5,
          backupUserId: users.omar,
          managerUserId: users.manager,
          idleThresholdSeconds: 300,
          escalationLevels: [
            { target: 'NEXT_ELIGIBLE', timeoutSeconds: 30 },
            { target: 'BACKUP', timeoutSeconds: 30 },
            { target: 'MANAGER', timeoutSeconds: 60 },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
      return workspace;
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  console.log('\n=== DEMO workspace created (non-production data) ===');
  console.log(`Workspace:        ${result.name}  (id ${result.id})`);
  console.log(`Public form key:  ${result.publicFormKey}`);
  console.log(`  POST /api/public/forms/${result.publicFormKey}/leads`);
  console.log('Accounts (all share one password):');
  for (const p of PEOPLE) console.log(`  ${p.key.padEnd(8)} ${p.email}`);
  console.log(
    process.env.SEED_DEMO_PASSWORD
      ? 'Password:         the SEED_DEMO_PASSWORD value from server/.env'
      : `Password:         ${password}   (generated now and not stored anywhere; set SEED_DEMO_PASSWORD to choose your own)`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
