-- Stripe payment tracking: payment intent id (refund lookups), failure reason, link expiry.
ALTER TABLE "payments" ADD COLUMN "stripePaymentIntentId" TEXT;
ALTER TABLE "payments" ADD COLUMN "failureReason" TEXT;
ALTER TABLE "payments" ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");
