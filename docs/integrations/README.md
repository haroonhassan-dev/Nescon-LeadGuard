# Third-Party Integrations Specification

**Exclusive Ownership**: INTEGRATIONS AND TESTING DEVELOPER

This document specifies the integration architecture, adapters, and webhook lifecycles for Nescon-LeadGuard.

---

## 1. Integration Routing & Isolation Architecture

To prevent merge conflicts with backend business logic developers, all integration routes are mounted exclusively through:
```typescript
// server/src/integrations/index.ts
export function registerIntegrationRoutes(app: express.Application | express.Router): void
```
The Backend Developer calls this single entry point during startup. The Integration Developer implements all routes, adapters, and handlers within `server/src/integrations/**`.

---

## 2. Supported Integrations

### A. Twilio (Inbound SMS & Outbound Alerts)
- **Base Route**: `/api/integrations/twilio`
- **Inbound Webhook**: `POST /api/integrations/twilio/webhook`
- **Security**: Must verify `X-Twilio-Signature` using `TWILIO_AUTH_TOKEN` and full URL.
- **Deduplication**: Ingest `MessageSid` through `IdempotencyStore`. Drop duplicate dispatches.
- **Outbound Dispatch**: Internal method `sendSms(to, body)` using Twilio SDK or REST API.

### B. Stripe (Payments & Invoices - Strictly Test Mode)
- **Base Route**: `/api/integrations/stripe`
- **Inbound Webhook**: `POST /api/integrations/stripe/webhook`
- **Security**: Must verify `stripe-signature` header using `STRIPE_WEBHOOK_SECRET`.
- **Mode Invariant**: `event.livemode === false`. Reject any live credentials or live payloads.
- **Handled Events**:
  - `payment_intent.succeeded`: Mark payment `SUCCEEDED`, link to lead/opportunity.
  - `payment_intent.payment_failed`: Mark payment `FAILED`.
  - `charge.refunded`: Record `refundedAmount`.

### C. Google Calendar (Consultations & Meetings)
- **Base Route**: `/api/integrations/google-calendar`
- **Sync Method**: Bi-directional event synchronization via Google Calendar REST API v3.
- **Push Notifications**: `POST /api/integrations/google-calendar/webhook` verifying `X-Goog-Channel-Token`.
- **Free/Busy Slots**: `GET /api/integrations/google-calendar/slots` to query employee availability windows.

### D. Telegram (Operator Escalation & Chat Bot)
- **Base Route**: `/api/integrations/telegram`
- **Inbound Webhook**: `POST /api/integrations/telegram/webhook`
- **Security**: Must verify `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`.
- **Capabilities**:
  - Broadcast escalation alerts to manager group channels when leads exceed SLA.
  - Support inline bot commands (e.g., `/claim <leadId>`).

---

## 3. Webhook Deduplication Pattern

Every webhook handler must execute the following sequence:
```typescript
import { checkAndRecordWebhookIdempotency } from '../webhookVerifier';

const isNew = await checkAndRecordWebhookIdempotency(eventId);
if (!isNew) {
  return res.status(200).json({ status: 'duplicate_ignored' });
}
```
This guarantees zero double-charging, zero ghost leads, and zero duplicate SMS messages.
