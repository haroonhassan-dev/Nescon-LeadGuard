# Nescon-LeadGuard API Contract Specification

**Version**: 0.1.0  
**Base Protocol**: REST JSON over HTTPS  
**Default Port**: 4000 (Backend), 5173 (Frontend Dev Proxy)  
**Standard Prefix**: `/api`

---

## 1. Global Conventions & Standards

### 1.1 Multi-Tenant Workspace Scoping
Every non-public API request MUST specify the target workspace via the HTTP header:
```http
X-Workspace-Id: <workspace-uuid-or-slug>
```
If this header is omitted on a tenant-scoped route, the server returns HTTP `400 Bad Request` with code `MISSING_WORKSPACE_HEADER`.

### 1.2 Authentication & Authorization
- **Bearer Token**: Protected endpoints require `Authorization: Bearer <jwt-token>`.
- **Server-Side RBAC**: Permissions are verified server-side on every mutation and sensitive read. Client-side permission checks are strictly UI helpers.
- **Request Identification**: Every request receives or generates a unique `X-Request-Id` (returned in response headers and error envelopes for observability).

### 1.3 Standard Success Response Envelope
All successful responses return HTTP 200 or 201 with the standardized envelope:
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_1729238400000_abcde",
    "timestamp": "2026-10-18T10:00:00.000Z",
    "version": "0.1.0"
  }
}
```

### 1.4 Standard Error Response Envelope
All errors return an appropriate HTTP status code (4xx, 5xx) with the standardized error envelope:
```json
{
  "success": false,
  "error": {
    "code": "LEAD_ALREADY_CLAIMED",
    "message": "The lead has already been claimed by another active agent.",
    "details": [
      {
        "field": "leadId",
        "message": "Claimed by user usr_4829 at 2026-10-18T09:58:12Z",
        "code": "CONCURRENT_CLAIM_CONFLICT"
      }
    ],
    "requestId": "req_1729238400000_abcde",
    "timestamp": "2026-10-18T10:00:00.000Z"
  }
}
```

### 1.5 Standard Error Codes Catalog

| HTTP Status | Error Code | Description |
|---|---|---|
| `400` | `MISSING_WORKSPACE_HEADER` | Request omitted the mandatory `X-Workspace-Id` header |
| `400` | `VALIDATION_FAILED` | Payload schema validation failed |
| `401` | `UNAUTHORIZED` | Bearer token missing, expired, or invalid |
| `403` | `FORBIDDEN_INSUFFICIENT_PERMISSIONS` | User role lacks the required resource-action permission |
| `404` | `NOT_FOUND` | Requested entity not found within the specified workspace |
| `409` | `LEAD_ALREADY_CLAIMED` | Single-owner conflict: Lead was claimed by another employee |
| `409` | `IDEMPOTENCY_CONFLICT` | A request or webhook with this idempotency key was already processed |
| `422` | `ESCALATION_DEADLINE_EXPIRED` | Cannot acknowledge lead after hard SLA deadline breach |
| `500` | `INTERNAL_SERVER_ERROR` | Unhandled server exception (logged with stack trace) |

---

## 2. Endpoint Ownership Matrix

| Endpoint Route | HTTP Method | Module Owner | Description | Required Permission |
|---|---|---|---|---|
| `/api/health` | `GET` | Shared Scaffold | System health, uptime & service status | None (Public) |
| `/api/auth/login` | `POST` | Backend Developer | Authenticate user credentials and return JWT | None (Public) |
| `/api/auth/me` | `GET` | Backend Developer | Get current authenticated user profile & permissions | Authenticated |
| `/api/crm/contacts` | `GET`, `POST` | Backend Developer | List and create workspace contacts | `contact:read`, `contact:create` |
| `/api/crm/contacts/:id` | `GET`, `PUT`, `DELETE` | Backend Developer | Manage individual contact | `contact:read`, `contact:update` |
| `/api/crm/companies` | `GET`, `POST` | Backend Developer | List and create client companies | `company:read`, `company:create` |
| `/api/crm/pipelines` | `GET`, `POST` | Backend Developer | Pipeline configuration & stages | `pipeline:manage` |
| `/api/crm/opportunities` | `GET`, `POST` | Backend Developer | Deal tracking across pipeline stages | `opportunity:read`, `opportunity:create` |
| `/api/leads` | `GET`, `POST` | Backend Developer | List leads with filters, create inbound lead | `lead:read`, `lead:create` |
| `/api/leads/:id/claim` | `POST` | Backend Developer | Claim lead (enforces single-owner invariant) | `lead:claim` |
| `/api/leads/:id/acknowledge`| `POST` | Backend Developer | Acknowledge assigned lead, stops escalation | `lead:acknowledge` |
| `/api/leads/:id/reassign` | `POST` | Backend Developer | Reassign lead to new employee | `lead:reassign` |
| `/api/permissions` | `GET` | Backend Developer | List roles and system permission matrix | `role:manage` |
| `/api/audit` | `GET` | Backend Developer | Paginated query of immutable audit log trail | `audit:read` |
| `/api/dashboard/summary` | `GET` | Backend Developer | SLA recovery metrics, lead counts, revenues | `dashboard:read` |
| `/api/integrations/twilio/webhook` | `POST` | Integrations Dev | Inbound SMS and call webhook handler | Webhook Signature |
| `/api/integrations/twilio/send` | `POST` | Integrations Dev | Internal endpoint to dispatch outbound SMS | `message:send` |
| `/api/integrations/stripe/webhook` | `POST` | Integrations Dev | Inbound Stripe test-mode event webhook | Stripe Signature |
| `/api/integrations/stripe/create-payment-intent` | `POST` | Integrations Dev | Create test mode Stripe payment intent | `payment:create` |
| `/api/integrations/google-calendar/webhook` | `POST` | Integrations Dev | Push notification webhook for calendar sync | Google Channel Token |
| `/api/integrations/google-calendar/slots` | `GET` | Integrations Dev | Query free/busy availability slots | `appointment:read` |
| `/api/integrations/telegram/webhook` | `POST` | Integrations Dev | Telegram bot updates and agent commands | Telegram Secret |
| `/api/integrations/telegram/alert` | `POST` | Integrations Dev | Internal endpoint to dispatch manager alerts | `message:send` |

---

## 3. Lead Lifecycle & Concurrency Invariants

### 3.1 Single-Owner Concurrency Control (`POST /api/leads/:id/claim`)
When an agent attempts to claim a lead:
1. The database checks `currentOwnerId IS NULL` (or status === 'UNASSIGNED') within an atomic transaction.
2. If already claimed, returns HTTP `409 Conflict` with `LEAD_ALREADY_CLAIMED`.
3. If successful, sets `currentOwnerId = req.userId`, `status = 'ASSIGNED'`, `assignedAt = NOW()`, and calculates `acknowledgementDeadline = NOW() + policy.timeoutMinutes`.

### 3.2 Acknowledgment Deadline (`POST /api/leads/:id/acknowledge`)
1. Only the current owner (or a Manager/Admin) can acknowledge.
2. Sets `acknowledgedAt = NOW()` and `status = 'ACKNOWLEDGED'`.
3. Cancels any pending `EscalationEvent` associated with this lead.

### 3.3 Idempotent Escalation Ingestion
The escalation engine queries for leads where:
```sql
status = 'ASSIGNED' AND acknowledgementDeadline < NOW() AND acknowledgedAt IS NULL
```
Each escalation step creates an `EscalationEvent` using the unique key:
`${leadId}-escalation-level-${level}-${scheduledTriggerAt}`.
Even if the server restarts or fails over mid-cycle, re-running the check will not trigger duplicate SMS or Telegram dispatches.
