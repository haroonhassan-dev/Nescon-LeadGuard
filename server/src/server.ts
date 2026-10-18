import { createApp } from './app';
import { prisma } from './lib/prisma';
import { startLeadWorker, stopLeadWorker } from './modules/leads/worker';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[Nescon-LeadGuard API] Server listening on port ${PORT}`);
  console.log(`[Nescon-LeadGuard API] Health check endpoint: http://localhost:${PORT}/api/health`);
  if (process.env.DISABLE_WORKER !== 'true') startLeadWorker();
});

// Graceful shutdown. Pending escalations live in the database, so nothing is lost here.
const shutdown = (signal: string) => {
  console.log(`\n[Nescon-LeadGuard API] Received ${signal}. Shutting down gracefully...`);
  stopLeadWorker();
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[Nescon-LeadGuard API] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
