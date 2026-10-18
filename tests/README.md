# Nescon-LeadGuard Testing Suite

**Exclusive Ownership**: INTEGRATIONS AND TESTING DEVELOPER

## Directory Structure
- `tests/unit/`: Unit tests for adapters, utilities, signature verification, and deduplication.
- `tests/integration/`: Integration tests against Express endpoints and database models.
- `tests/fixtures/`: Mock webhook payloads for Twilio, Stripe, Google Calendar, and Telegram.

## Guidelines
1. **Webhook Testing**: Test signature verification with valid and invalid signatures.
2. **Deduplication Testing**: Verify that replay attacks sending the same webhook event ID / MessageSid return 200 without creating duplicate database records.
3. **Escalation SLA Testing**: Validate that lead acknowledgment cancels in-flight escalation timers.
4. **Isolated Mocks**: Never make real calls to external third-party APIs during automated test runs.
