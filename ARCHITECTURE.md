# Nescon-LeadGuard Architectural Design & Boundaries

**Project**: Nescon-LeadGuard  
**Domain**: Multi-Tenant Autonomous SaaS CRM & Lead Recovery Platform  
**Target Architecture**: Decoupled Monorepo with Strict Branch Boundaries

---

## 1. System Overview & Core Invariants

Nescon-LeadGuard is architected to guarantee reliable lead routing, immediate SLA breach escalation, and multi-channel synchronization for service businesses.

```
                           +------------------------+
                           |  Browser / Client App  |
                           | (React + Vite + TW v3) |
                           +-----------+------------+
                                       |
                   HTTP /api (Bearer, X-Workspace-Id)
                                       |
                                       v
                     +----------------------------------+
                     |    Express API Server (:4000)    |
                     |  - Helmet, CORS, RequestLogger   |
                     |  - Workspace Scoping Middleware  |
                     |  - Server-Side RBAC Guard        |
                     +-----------------+----------------+
                                       |
       +-------------------------------+-------------------------------+
       |                               |                               |
       v                               v                               v
+--------------+               +---------------+               +---------------+
| Core Modules |               | Escalation    |               | Integration   |
| (Auth, CRM,  |               | State Engine  |               | Registry      |
| Leads, RBAC, |               | (Idempotent   |               | (Twilio, GCal |
| Audit Trail) |               | SLA Recovery) |               | Stripe, Tele) |
+-------+------+               +-------+-------+               +-------+-------+
        |                              |                               |
        +------------------------------+-------------------------------+
                                       |
                                       v
                        +------------------------------+
                        | Prisma ORM (PostgreSQL DB)   |
                        | All tables: workspaceId FK   |
                        +------------------------------+
```

### The 5 Architectural Invariants
1. **Multi-Tenant Workspace Scoping**:
   Every database model (Users, Contacts, Leads, Opportunities, Payments, Appointments, Audit Events) contains a mandatory `workspaceId` foreign key. The `requireWorkspaceContext` middleware rejects any tenant operation that lacks `X-Workspace-Id`.
2. **Single-Owner Lead Guarantee**:
   A lead may have at most ONE current owner (`currentOwnerId`). Concurrent reassignment or claim attempts use atomic database transactions to eliminate double-claim race conditions.
3. **Crash-Resilient Idempotent Escalation**:
   Escalations execute through persistent scheduled checkpoints in `EscalationEvent` records. If the server crashes mid-flight, a restarting worker resumes evaluation using unique keys (`${leadId}-${policyId}-level-${level}-${scheduledTriggerAt}`). No duplicate notifications are triggered.
4. **External Webhook Integrity & Deduplication**:
   All incoming webhooks (Twilio SMS, Stripe payments, Google Calendar sync, Telegram updates) verify provider cryptographic signatures before processing, and check their unique external event ID against the `IdempotencyStore`.
5. **Zero Client Secret Leakage**:
   Secrets (`JWT_SECRET`, `TWILIO_AUTH_TOKEN`, `STRIPE_SECRET_KEY`, `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`) are isolated to backend environment variables. Frontend bundles access only public configuration prefixed with `VITE_`.

---

## 2. Developer File Ownership & Branch Separation

Three development branches operate concurrently without touching each other's core files:

```
                       NESCON-LEADGUARD REPOSITORY
                                    |
   +--------------------------------+--------------------------------+
   |                                |                                |
   v                                v                                v
[BRANCH: feat/frontend]    [BRANCH: feat/backend]       [BRANCH: feat/integrations]
- src/components/**        - server/src/modules/**      - server/src/integrations/**
- src/pages/**             - server/src/middleware/**   - tests/**
- src/features/**          - server/src/app.ts          - docs/integrations/**
- src/services/**          - server/src/server.ts       - Webhook adapters
- UI styling & presentation- server/prisma/**           - Integration tests & mocks
```

### 2.1 Frontend Developer Scope
- **Files**: `src/components/**`, `src/pages/**`, `src/features/**`, `src/services/**`, `src/index.css`
- **Responsibilities**: Design system implementation, responsive layouts, client route views, optimistic UI states, SLA timers.
- **Contract Boundary**: Must consume TypeScript interfaces solely from `@shared/*`. Must invoke the backend via `src/services/apiClient.ts`.

### 2.2 Backend Developer Scope
- **Files**: `server/src/modules/**`, `server/src/middleware/**`, `server/src/app.ts`, `server/src/server.ts`, `server/prisma/**`
- **Responsibilities**: Database migrations, authentication, RBAC authorization enforcement, lead assignment algorithms, escalation timeout worker, audit trail recording.
- **Contract Boundary**: Must expose endpoints strictly matching `docs/API_CONTRACT.md` and return types from `shared/contracts/`.

### 2.3 Integrations and Testing Developer Scope
- **Files**: `server/src/integrations/**`, `tests/**`, `docs/integrations/**`
- **Responsibilities**: Third-party API adapters (Twilio, Stripe test mode, Google Calendar, Telegram), webhook cryptographic verification, deduplication stores, end-to-end integration tests.
- **Integration Entry Point**: Must expose all routes via `server/src/integrations/index.ts` through the stable interface:
  ```typescript
  export function registerIntegrationRoutes(app: express.Application | express.Router): void
  ```
  The Backend Developer calls this once in `server/src/app.ts`. The Integrations Developer can modify routes and adapters without ever modifying `server/src/app.ts`.

---

## 3. Shared Contracts (`shared/contracts/`)
The shared contracts are the immutable single source of truth across all three branches:
1. `workspace.ts`: Tenant configuration, SLA defaults, business hours.
2. `user.ts`: User entity, profile, and status definitions.
3. `roles.ts`: System role hierarchies (`OWNER`, `ADMIN`, `MANAGER`, `AGENT`, `READ_ONLY`).
4. `permissions.ts`: Fine-grained permission keys (`lead:claim`, `lead:escalate`, etc.).
5. `availability.ts`: Employee active shift tracking and routing eligibility.
6. `contact.ts`: Customer and prospect directory.
7. `company.ts`: B2B organizational accounts.
8. `opportunity.ts`: Deal flow and financial pipeline tracking.
9. `lead.ts`: Inbound lead model with single-owner and SLA deadline timestamps.
10. `pipeline.ts`: Sales and service stage configurations.
11. `escalation.ts`: Idempotent escalation policies and event checkpoints.
12. `audit.ts`: Immutable audit event trail with delta capture.
13. `payment.ts`: Stripe test-mode charges and checkout intents.
14. `message.ts`: Twilio SMS and Telegram communication history.
15. `appointment.ts`: Google Calendar synchronized scheduling records.
16. `api.ts`: Standard API envelopes (`ApiResponse<T>`, `ApiErrorResponse`).

---

## 4. Deployment Architecture
- **Frontend**: Built via `npm run build` (`dist/`). Configured with `base: './'` for standalone static hosting (e.g., GitHub Pages).
- **Backend**: Containerized or Node runtime hosting running on port 4000 (e.g., Railway, Render, Fly.io, or VPS).
- **Database**: Managed PostgreSQL instance with Prisma connection pooling.
