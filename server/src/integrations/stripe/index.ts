import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const stripeRouter = Router();

/**
 * Stripe Test Mode Webhook Endpoint
 * Route: POST /api/integrations/stripe/webhook
 * Handled by Integrations Developer.
 */
stripeRouter.post('/webhook', async (req: Request, res: Response) => {
  // To be implemented by Integration Developer:
  // 1. Verify stripe-signature header
  // 2. Validate livemode === false (Test mode requirement)
  // 3. Deduplicate event id via IdempotencyStore
  // 4. Update Payment record status
  res.status(200).json({ received: true });
});

/**
 * Create Test Mode Payment Intent
 * Route: POST /api/integrations/stripe/create-payment-intent
 */
stripeRouter.post('/create-payment-intent', async (req: Request, res: Response) => {
  const response: ApiResponse<{ mockClientSecret: string; mode: string }> = {
    success: true,
    data: {
      mockClientSecret: 'pi_test_scaffold_secret',
      mode: 'test',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  res.status(200).json(response);
});
