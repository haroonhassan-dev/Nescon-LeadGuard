import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, AppError } from './middleware/errorHandler';
import { authenticate } from './middleware/authMiddleware';
import { requireWorkspaceContext, WorkspaceScopedRequest } from './middleware/workspaceContext';
import { checkDatabase } from './lib/prisma';
import { HealthCheckResponse } from '../../shared/contracts/api';

// Backend Developer Modules
import { authRouter } from './modules/auth';
import { publicRouter } from './modules/public';
import { crmRouter } from './modules/crm';
import { leadsRouter } from './modules/leads';
import { teamRouter } from './modules/team';
import { permissionsRouter } from './modules/permissions';
import { auditRouter } from './modules/audit';
import { dashboardRouter } from './modules/dashboard';
import { realtimeTicketRouter, realtimeStreamRouter } from './modules/realtime';

// Integration Entry Point (Handled by Integrations Developer)
import { registerIntegrationRoutes } from './integrations';

dotenv.config();

/** A value is "configured" only if it is present and not one of the .env.example placeholders. */
function configured(value: string | undefined): boolean {
  return Boolean(value) && !/mock|placeholder|replace|^0000/i.test(value as string);
}

/** Keeps the exact bytes of every request body for webhook signature verification. */
function keepRawBody(req: Request, _res: Response, buf: Buffer): void {
  (req as WorkspaceScopedRequest).rawBody = buf;
}

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1); // correct client IPs behind a tunnel / host proxy (rate limiting)
  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-Request-Id'],
    })
  );
  // Raw-body contract for the Integrations Developer: `req.rawBody` is a Buffer of the exact
  // payload (JSON for Stripe, form-encoded for Twilio), captured before parsing.
  app.use(express.json({ limit: '1mb', verify: keepRawBody }));
  app.use(express.urlencoded({ extended: false, limit: '1mb', verify: keepRawBody }));

  app.use(requestLogger);

  // ----------------------------------------------------
  // PUBLIC: health (truthful), auth, web form, real-time stream (ticket-authenticated)
  // ----------------------------------------------------
  app.get('/api/health', async (_req: Request, res: Response) => {
    const dbConnected = await checkDatabase();
    const healthPayload: HealthCheckResponse = {
      status: dbConnected ? 'ok' : 'degraded',
      service: 'nescon-leadguard-api',
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        database: !process.env.DATABASE_URL ? 'unconfigured' : dbConnected ? 'connected' : 'disconnected',
        // "configured" means credentials are present, not that the provider answered.
        // Live connection status belongs on the integrations page (I5.1).
        integrations: {
          twilio: configured(process.env.TWILIO_ACCOUNT_SID) ? 'configured' : 'unconfigured',
          stripe: configured(process.env.STRIPE_SECRET_KEY) ? 'configured_test_mode' : 'unconfigured',
          googleCalendar: configured(process.env.GOOGLE_CLIENT_ID) ? 'configured' : 'unconfigured',
          telegram: configured(process.env.TELEGRAM_BOT_TOKEN) ? 'configured' : 'unconfigured',
        },
      },
    };
    res.status(dbConnected ? 200 : 503).json(healthPayload);
  });

  app.use('/api/auth', authRouter); // signup / login / accept-invite public; logout / me authenticate inside
  app.use('/api/public', publicRouter);
  app.use('/api/realtime', realtimeStreamRouter);

  // ----------------------------------------------------
  // INTEGRATIONS ENTRY POINT (INTEGRATION DEVELOPER)
  // Webhooks under /api/integrations/* are reachable without a session or workspace header.
  // Protected integration routes should use `authenticate`, `requireWorkspaceContext` and
  // `requirePermission` from ./middleware, exactly as the routes below do.
  // ----------------------------------------------------
  registerIntegrationRoutes(app);

  // ----------------------------------------------------
  // PROTECTED: verified session + proven workspace membership on every route
  // ----------------------------------------------------
  const tenant = [authenticate, requireWorkspaceContext];
  app.use('/api/leads', ...tenant, leadsRouter);
  app.use('/api/team', ...tenant, teamRouter);
  app.use('/api/permissions', ...tenant, permissionsRouter);
  app.use('/api/audit', ...tenant, auditRouter);
  app.use('/api/dashboard', ...tenant, dashboardRouter);
  app.use('/api/realtime', ...tenant, realtimeTicketRouter);
  app.use('/api/crm', ...tenant, crmRouter);

  app.use('/api', (_req, _res, next) => next(new AppError('Endpoint not found', 404, 'NOT_FOUND')));

  // Global Centralized Error Handling
  app.use(errorHandler);

  return app;
}
