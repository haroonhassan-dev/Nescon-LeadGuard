import Stripe from 'stripe';
import { AppError } from '../../middleware/errorHandler';

/**
 * Lazily created Stripe client. If Stripe is not configured, only Stripe features fail,
 * with a plain message; the rest of the platform keeps working (I5.8).
 */
let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new AppError('Payments are not set up: STRIPE_SECRET_KEY is missing on the server', 503, 'INTEGRATION_NOT_CONFIGURED');
  // This project runs Stripe in TEST MODE only.
  if (!key.startsWith('sk_test_')) {
    throw new AppError('Only Stripe test-mode keys (sk_test_...) are allowed', 503, 'INTEGRATION_NOT_CONFIGURED');
  }
  if (!client) client = new Stripe(key, { maxNetworkRetries: 2, timeout: 15_000 });
  return client;
}

/** Turns a Stripe SDK error into a message a salesperson can act on (I5.5). */
export function explainStripeError(err: unknown): AppError {
  if (err instanceof Stripe.errors.StripeError) {
    switch (err.type) {
      case 'StripeAuthenticationError':
        return new AppError('Stripe rejected the API key. An Admin needs to check the Stripe settings.', 502, 'PROVIDER_AUTH_FAILED');
      case 'StripeInvalidRequestError':
        return new AppError(`Stripe refused the request: ${err.message}`, 400, 'PROVIDER_REJECTED');
      case 'StripeRateLimitError':
        return new AppError('Stripe is busy right now. Wait a few seconds and try again.', 503, 'PROVIDER_RATE_LIMITED');
      case 'StripeConnectionError':
      case 'StripeAPIError':
        return new AppError('Could not reach Stripe. Try again in a moment.', 503, 'PROVIDER_UNAVAILABLE');
      default:
        return new AppError(`Stripe error: ${err.message}`, 502, 'PROVIDER_ERROR');
    }
  }
  return err instanceof AppError ? err : new AppError('Unexpected error while talking to Stripe', 502, 'PROVIDER_ERROR');
}
