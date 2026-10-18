import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const googleCalendarRouter = Router();

/**
 * Google Calendar Webhook / Push Notification Endpoint
 * Route: POST /api/integrations/google-calendar/webhook
 */
googleCalendarRouter.post('/webhook', async (req: Request, res: Response) => {
  // To be implemented by Integration Developer:
  // 1. Verify X-Goog-Channel-Token
  // 2. Sync updated event with Appointment model
  res.status(200).json({ received: true });
});

/**
 * Sync Free/Busy Slots
 * Route: GET /api/integrations/google-calendar/slots
 */
googleCalendarRouter.get('/slots', async (req: Request, res: Response) => {
  const response: ApiResponse<{ slots: Array<{ start: string; end: string }> }> = {
    success: true,
    data: {
      slots: [],
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  res.status(200).json(response);
});
