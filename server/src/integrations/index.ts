/**
 * Integration Routes Master Registration Entry Point
 * 
 * OWNERSHIP: INTEGRATIONS AND TESTING DEVELOPER
 * The backend server calls `registerIntegrationRoutes(app)` during startup.
 * The integration developer works strictly in `server/src/integrations/**` and does NOT
 * need to edit `server/src/app.ts` or backend developer module files.
 */

import { Router } from 'express';
import { twilioRouter } from './twilio';
import { stripeRouter } from './stripe';
import { googleCalendarRouter } from './google-calendar';
import { telegramRouter } from './telegram';

export * from './types';
export * from './webhookVerifier';

export function registerIntegrationRoutes(app: { use: (path: string, router: Router) => void }): void {
  const integrationRouter = Router();

  // Mount integration service routers
  integrationRouter.use('/twilio', twilioRouter);
  integrationRouter.use('/stripe', stripeRouter);
  integrationRouter.use('/google-calendar', googleCalendarRouter);
  integrationRouter.use('/telegram', telegramRouter);

  // Mount on master API path
  app.use('/api/integrations', integrationRouter);
}
