import { createApp } from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[Nescon-LeadGuard API] Server listening on port ${PORT}`);
  console.log(`[Nescon-LeadGuard API] Health check endpoint: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n[Nescon-LeadGuard API] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Nescon-LeadGuard API] HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
