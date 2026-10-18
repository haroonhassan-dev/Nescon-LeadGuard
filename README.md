# Nescon-LeadGuard

> **Autonomous Multi-Tenant SaaS CRM for Service Businesses**  
> Featuring automatic lead assignment, acknowledgment deadlines, crash-resilient escalation and recovery, customizable pipelines, server-enforced RBAC, and integrations with Twilio, Stripe (Test Mode), Google Calendar, and Telegram.

---

## 1. Team & Branch Separation

To allow three developers to work concurrently during the hackathon without merge conflicts, strict file ownership boundaries are established:

| Developer Role | Branch | Exclusive File Boundaries | Responsibilities |
|---|---|---|---|
| **Frontend Developer** | `feat/frontend` | `src/components/**`<br>`src/pages/**`<br>`src/features/**`<br>`src/services/**`<br>`src/index.css` | UI components, design system, client routing, SLA timers, frontend state |
| **Backend Developer** | `feat/backend` | `server/src/modules/**`<br>`server/src/middleware/**`<br>`server/src/app.ts`<br>`server/src/server.ts`<br>`server/prisma/**` | PostgreSQL database, Prisma schemas, JWT auth, RBAC permissions, lead business logic, escalation engine |
| **Integrations & Testing** | `feat/integrations` | `server/src/integrations/**`<br>`tests/**`<br>`docs/integrations/**` | Twilio SMS, Stripe test payments, Google Calendar, Telegram bot, webhook verification, deduplication, E2E tests |

*All developers share and import the domain contracts in `shared/contracts/`.*

---

## 2. Prerequisites
- **Node.js**: v20+ (Tested on v24.21.0)
- **npm**: v10+ (Tested on v11.19.0)
- **PostgreSQL**: PostgreSQL 14+ instance (local or hosted, e.g. Neon, Supabase, Railway)
- **PowerShell**: Windows PowerShell 5.1 or PowerShell 7+

---

## 3. Quick Start (Windows PowerShell)

Open **Windows PowerShell** in the project root directory:

### Step 1: Install Dependencies
```powershell
# 1. Install root & frontend dependencies
npm install

# 2. Install backend dependencies
npm run server:install
```

### Step 2: Configure Environment Variables
```powershell
# Copy frontend environment template
Copy-Item .env.example .env

# Copy backend environment template
Copy-Item server\.env.example server\.env
```

### Step 3: Run the Development Servers

You can run both Frontend and Backend concurrently with a single command:
```powershell
npm run dev:all
```

Or run them in separate PowerShell terminals:

**Terminal 1 (Backend API - Port 4000):**
```powershell
npm run server:dev
```
*Health Check: http://localhost:4000/api/health*

**Terminal 2 (Frontend App - Port 5173):**
```powershell
npm run dev
```
*Frontend UI: http://localhost:5173*

---

## 4. Build, Type-Check, and Validation Scripts

Run the following commands in Windows PowerShell:

```powershell
# Type-check frontend and shared contracts
npm run type-check

# Type-check backend Express server
npm run server:type-check

# Build frontend production bundle (dist/)
npm run build

# Build backend server (server/dist/)
npm run server:build

# Generate Prisma Client (after configuring DATABASE_URL)
npm --prefix server run prisma:generate
```

---

## 5. Architectural Invariants
1. **Multi-Tenancy**: Every database record is scoped to a `workspaceId`. Requisitions must include `X-Workspace-Id` header.
2. **Single Lead Owner**: Concurrency-safe ownership guarantee. Only one agent can own a lead.
3. **Idempotent Escalation**: Checkpointed escalation events prevent duplicate SMS/alerts on crash restart.
4. **Webhook Security**: All ingress webhooks must verify HMAC signatures and check event deduplication.
5. **No Secret Leakage**: API secrets and tokens reside exclusively on the server.

---

## 6. Architecture Documentation
- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md): Comprehensive REST API contract, error catalog, and ownership matrix.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): System boundaries, multi-tenancy model, and data ownership.
- [`DESIGN.md`](DESIGN.md): NVIDIA-inspired aesthetic guidelines, typography, and color tokens.
- [`docs/integrations/README.md`](docs/integrations/README.md): Twilio, Stripe, Calendar, and Telegram adapter specs.
- [`shared/contracts/`](shared/contracts/): 15 Shared TypeScript domain contracts.
