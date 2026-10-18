/**
 * Payment Domain Contract
 * Stripe Test Mode integration models for transactions, payment links, and receipts.
 */

export type PaymentStatus =
  | 'REQUIRES_PAYMENT_METHOD'
  | 'REQUIRES_CONFIRMATION'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED';

export type StripeMode = 'test' | 'live';

export interface Payment {
  id: string;
  workspaceId: string;
  leadId?: string;
  opportunityId?: string;
  contactId?: string;
  
  amount: number; // In smallest currency unit, e.g. cents (1000 = $10.00)
  currency: string; // e.g. "usd"
  status: PaymentStatus;
  
  stripePaymentIntentId: string;
  stripeCustomerId?: string;
  stripeMode: StripeMode; // Strictly 'test' during hackathon development
  
  receiptEmail?: string;
  description?: string;
  refundedAmount?: number;
  
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentIntentDTO {
  workspaceId: string;
  amount: number;
  currency: string;
  leadId?: string;
  opportunityId?: string;
  customerEmail: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentWebhookPayload {
  id: string;
  type: string; // e.g. "payment_intent.succeeded"
  data: {
    object: {
      id: string;
      amount: number;
      currency: string;
      status: string;
      receipt_email?: string;
      metadata?: Record<string, string>;
    };
  };
  livemode: boolean; // Must be false for hackathon test mode
}
