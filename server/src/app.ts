import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler } from './middleware/errorHandler';
import { requireWorkspaceContext } from './middleware/workspaceContext';
import { HealthCheckResponse } from '../../shared/contracts/api';

// Backend Developer Modules
import { authRouter } from './modules/auth';
import { crmRouter } from './modules/crm';
import { leadsRouter } from './modules/leads';
import { permissionsRouter } from './modules/permissions';
import { auditRouter } from './modules/audit';
import { dashboardRouter } from './modules/dashboard';

// Integration Entry Point (Handled by Integrations Developer)
import { registerIntegrationRoutes } from './integrations';

dotenv.config();

export function createApp(): Application {
  const app = express();

  // Basic security and request parsing
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Workspace-Id', 'X-Request-Id'],
  }));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Global request logging
  app.use(requestLogger);

  // ----------------------------------------------------
  // PUBLIC HEALTH CHECK ENDPOINT
  // ----------------------------------------------------
  app.get('/api/health', (req: Request, res: Response) => {
    const healthPayload: HealthCheckResponse = {
      status: 'ok',
      service: 'nescon-leadguard-api',
      version: '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        database: process.env.DATABASE_URL ? 'unconfigured' : 'unconfigured',
        integrations: {
          twilio: process.env.TWILIO_ACCOUNT_SID ? 'configured' : 'mock_mode',
          stripe: 'configured_test_mode',
          googleCalendar: process.env.GOOGLE_CLIENT_ID ? 'configured' : 'unconfigured',
          telegram: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'unconfigured',
        },
      },
    };

    res.status(200).json(healthPayload);
  });

  // ----------------------------------------------------
  // MULTI-TENANT WORKSPACE ROUTE SCOPING
  // ----------------------------------------------------
  app.use('/api', requireWorkspaceContext);

  // ----------------------------------------------------
  // BACKEND DEVELOPER MODULES
  // ----------------------------------------------------
  app.use('/api/auth', authRouter);
  app.use('/api/crm', crmRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/permissions', permissionsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/dashboard', dashboardRouter);

  // ----------------------------------------------------
  // INTEGRATIONS ENTRY POINT (INTEGRATION DEVELOPER)
  // Stable interface: registers third-party routers without
  // requiring modifications to app.ts.
  // ----------------------------------------------------
  registerIntegrationRoutes(app);

  // Global Centralized Error Handling
  app.use(errorHandler);

  return app;
}
