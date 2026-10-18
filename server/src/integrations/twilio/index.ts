import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const twilioRouter = Router();

/**
 * Inbound Twilio SMS Webhook
 * Route: POST /api/integrations/twilio/webhook
 * Handled by Integrations Developer.
 */
twilioRouter.post('/webhook', async (req: Request, res: Response) => {
  // To be implemented by Integration Developer:
  // 1. Verify X-Twilio-Signature
  // 2. Extract MessageSid (idempotency key)
  // 3. Ingest SMS as message / lead
  res.status(200).type('text/xml').send('<Response></Response>');
});

/**
 * Outbound SMS Dispatch endpoint (internal API)
 * Route: POST /api/integrations/twilio/send
 */
twilioRouter.post('/send', async (req: Request, res: Response) => {
  const response: ApiResponse<{ queued: boolean; message: string }> = {
    success: true,
    data: {
      queued: false,
      message: 'Twilio integration scaffold active. Configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  res.status(200).json(response);
});
