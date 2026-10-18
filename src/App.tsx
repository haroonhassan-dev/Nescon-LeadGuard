import { useState, useEffect } from 'react';
import {
  Server,
  Code2,
  Workflow,
  Cpu,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Terminal,
  ShieldCheck,
  FileCode,
  Layers,
  Database,
  PhoneCall,
  CreditCard,
  Calendar,
  Send
} from 'lucide-react';
import { Shell } from './components/layout/Shell';
import { StatusBadge } from './components/common/StatusBadge';
import { fetchHealthStatus } from './services/healthService';
import { HealthCheckResponse } from '@shared/api';

export function App() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'architecture' | 'ownership' | 'contracts' | 'health'>('architecture');

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHealthStatus();
      setHealth(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reach API server';
      setError(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <Shell isBackendHealthy={health !== null && health.status === 'ok'}>
      {/* Top Banner / Hero */}
      <div className="mb-8 border border-[#242E30] bg-[#171E1F] rounded-xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-medium bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30">
                <ShieldCheck className="h-3.5 w-3.5" />
                SHARED SCAFFOLD READY
              </span>
              <span className="text-xs font-mono text-[#8E9B9A]">
                Multi-Tenant CRM &bull; LeadGuard v0.1.0
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#F5F7F2]">
              Autonomous Service CRM with SLA Recovery
            </h1>
            <p className="text-sm sm:text-base text-[#8E9B9A] leading-relaxed">
              Shared architectural scaffold establishing non-overlapping boundaries for three parallel development branches.
              Core contracts, Express backend, Prisma PostgreSQL schema, and NVIDIA-inspired design system initialized.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={checkHealth}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs tracking-wide uppercase transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Test API Health
            </button>
          </div>
        </div>

        {/* Live Health Strip */}
        <div className="mt-6 pt-6 border-t border-[#242E30] grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div className="space-y-1">
            <span className="text-[#8E9B9A]">Express API Endpoint:</span>
            <div className="text-[#F5F7F2] font-semibold flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${health ? 'bg-[#B7F45B]' : 'bg-[#FF5C5C]'}`} />
              {health ? 'GET /api/health (200 OK)' : 'Offline / Connecting'}
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[#8E9B9A]">Database Schema:</span>
            <div className="text-[#F5F7F2] font-semibold flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-[#B7F45B]" />
              Prisma (17 Models Ready)
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[#8E9B9A]">Shared Contracts:</span>
            <div className="text-[#F5F7F2] font-semibold flex items-center gap-1.5">
              <FileCode className="h-3.5 w-3.5 text-[#B7F45B]" />
              15 Domain Types Defined
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[#8E9B9A]">Third-Party Ingress:</span>
            <div className="text-[#F5F7F2] font-semibold flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-[#B7F45B]" />
              Registry Isolated
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#242E30] mb-6 space-x-1 sm:space-x-4">
        {[
          { id: 'architecture', label: 'Architectural Invariants', icon: ShieldCheck },
          { id: 'ownership', label: 'Developer Branch Ownership', icon: Workflow },
          { id: 'contracts', label: 'Domain Contracts (15)', icon: Layers },
          { id: 'health', label: 'Live API Diagnostics', icon: Cpu },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-[#B7F45B] text-[#B7F45B]'
                  : 'border-transparent text-[#8E9B9A] hover:text-[#F5F7F2]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Architectural Invariants */}
      {activeTab === 'architecture' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#B7F45B] tracking-wider uppercase font-semibold">Invariant #1</span>
                <StatusBadge label="ENFORCED" variant="lime" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Single-Owner Lead Integrity</h3>
              <p className="text-xs text-[#8E9B9A] leading-relaxed">
                A lead may have at most ONE current owner (<code className="text-[#B7F45B] font-mono">currentOwnerId</code>).
                Claiming and assignment enforce strict server-side concurrency locks to eliminate double-claim race conditions.
              </p>
            </div>

            <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#B7F45B] tracking-wider uppercase font-semibold">Invariant #2</span>
                <StatusBadge label="IDEMPOTENT" variant="lime" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Crash-Resilient SLA Escalation</h3>
              <p className="text-xs text-[#8E9B9A] leading-relaxed">
                Escalation events generate deterministic <code className="text-[#B7F45B] font-mono">idempotencyKey</code> values.
                If the server crashes and reboots, in-flight timers resume cleanly without duplicate notifications or reassignments.
              </p>
            </div>

            <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#B7F45B] tracking-wider uppercase font-semibold">Invariant #3</span>
                <StatusBadge label="SCOPED" variant="lime" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Multi-Tenant Isolation</h3>
              <p className="text-xs text-[#8E9B9A] leading-relaxed">
                Every business record must reference <code className="text-[#B7F45B] font-mono">workspaceId</code>.
                The <code className="text-[#B7F45B] font-mono">requireWorkspaceContext</code> middleware rejects un-scoped tenant queries.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#B7F45B] tracking-wider uppercase font-semibold">Security Requirement</span>
                <StatusBadge label="VERIFIED" variant="lime" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Webhook Verification & Deduplication</h3>
              <p className="text-xs text-[#8E9B9A] leading-relaxed">
                External webhooks (Twilio, Stripe, Telegram, Google Calendar) enforce HMAC cryptographic signature verification
                and record deduplication keys to prevent replay attacks and ghost leads.
              </p>
            </div>

            <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#B7F45B] tracking-wider uppercase font-semibold">Compliance</span>
                <StatusBadge label="SANDBOXED" variant="lime" />
              </div>
              <h3 className="text-base font-bold text-[#F5F7F2]">Stripe Test-Mode & Secret Isolation</h3>
              <p className="text-xs text-[#8E9B9A] leading-relaxed">
                Stripe integration operates strictly under <code className="text-[#B7F45B] font-mono">stripeMode: 'test'</code>.
                No secret keys, database credentials, or auth tokens are ever exposed to client bundles.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Developer Branch Ownership */}
      {activeTab === 'ownership' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Frontend Card */}
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B]">
                  <Code2 className="h-5 w-5" />
                </div>
                <StatusBadge label="BRANCH 1" variant="lime" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F5F7F2]">Frontend Developer</h3>
                <p className="text-xs text-[#8E9B9A]">UI Styles, Interactive Views, Presentational Logic</p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[#B7F45B] font-semibold">Exclusive File Boundaries:</span>
                <ul className="text-xs font-mono text-[#8E9B9A] space-y-1.5 bg-[#0D1112] p-3 rounded-lg border border-[#242E30]">
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> src/components/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> src/pages/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> src/features/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> src/services/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> src/index.css & UI styling</li>
                </ul>
              </div>
            </div>
            <p className="text-[11px] text-[#8E9B9A] border-t border-[#242E30] pt-3">
              Imports types from <code className="text-[#B7F45B]">@shared/*</code>. Communicates with backend using <code className="text-[#B7F45B]">apiClient.ts</code>.
            </p>
          </div>

          {/* Backend Card */}
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B]">
                  <Server className="h-5 w-5" />
                </div>
                <StatusBadge label="BRANCH 2" variant="lime" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F5F7F2]">Backend Developer</h3>
                <p className="text-xs text-[#8E9B9A]">Business Logic, DB Operations, RBAC, Escalation Engine</p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[#B7F45B] font-semibold">Exclusive File Boundaries:</span>
                <ul className="text-xs font-mono text-[#8E9B9A] space-y-1.5 bg-[#0D1112] p-3 rounded-lg border border-[#242E30]">
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> server/src/modules/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> server/src/middleware/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> server/src/app.ts & server.ts</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> server/prisma/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> Core DB, RBAC, Lead Business Logic</li>
                </ul>
              </div>
            </div>
            <p className="text-[11px] text-[#8E9B9A] border-t border-[#242E30] pt-3">
              Does not edit integration files directly. Boots integrations via <code className="text-[#B7F45B]">registerIntegrationRoutes()</code>.
            </p>
          </div>

          {/* Integrations Card */}
          <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="h-10 w-10 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B]">
                  <Workflow className="h-5 w-5" />
                </div>
                <StatusBadge label="BRANCH 3" variant="lime" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F5F7F2]">Integrations & Testing</h3>
                <p className="text-xs text-[#8E9B9A]">Adapters, Inbound Webhooks, E2E Testing</p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-mono text-[#B7F45B] font-semibold">Exclusive File Boundaries:</span>
                <ul className="text-xs font-mono text-[#8E9B9A] space-y-1.5 bg-[#0D1112] p-3 rounded-lg border border-[#242E30]">
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> server/src/integrations/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> tests/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> docs/integrations/**</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> Webhook HMAC & Deduplication</li>
                  <li className="flex items-center gap-1.5 text-[#F5F7F2]"><CheckCircle2 className="h-3.5 w-3.5 text-[#B7F45B]" /> Twilio, Stripe, GCal, Telegram</li>
                </ul>
              </div>
            </div>
            <p className="text-[11px] text-[#8E9B9A] border-t border-[#242E30] pt-3">
              Never touches backend application files. Exports routers via <code className="text-[#B7F45B]">server/src/integrations/index.ts</code>.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Domain Contracts */}
      {activeTab === 'contracts' && (
        <div className="space-y-4">
          <p className="text-xs text-[#8E9B9A]">
            The following 15 domain contracts are located in <code className="text-[#B7F45B] font-mono">shared/contracts/</code> and serve as the single source of truth across all branches.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { name: 'workspace.ts', desc: 'Multi-tenant root entity, settings, business hours', icon: Layers },
              { name: 'user.ts', desc: 'Workspace members, profiles, authentication states', icon: ShieldCheck },
              { name: 'roles.ts', desc: 'RBAC role hierarchies (OWNER, ADMIN, MANAGER, AGENT)', icon: ShieldCheck },
              { name: 'permissions.ts', desc: 'Fine-grained resource-action keys for server-side auth', icon: ShieldCheck },
              { name: 'availability.ts', desc: 'Employee shifts, active lead caps, routing eligibility', icon: Calendar },
              { name: 'contact.ts', desc: 'Customer & prospect records, preferred communication', icon: PhoneCall },
              { name: 'company.ts', desc: 'Organizations, industry classification, firmographics', icon: Layers },
              { name: 'opportunity.ts', desc: 'Deals, stage progression, probability, win/loss tracking', icon: Workflow },
              { name: 'lead.ts', desc: 'Single-owner leads, SLA timers, auto-assignment, score', icon: ShieldCheck },
              { name: 'pipeline.ts', desc: 'Customizable deal pipelines, stage limits, SLA minutes', icon: Workflow },
              { name: 'escalation.ts', desc: 'Idempotent crash-resilient escalation policies & rules', icon: AlertTriangle },
              { name: 'audit.ts', desc: 'Immutable security and state-change delta log records', icon: FileCode },
              { name: 'payment.ts', desc: 'Stripe test-mode charges, payment intents, and refunds', icon: CreditCard },
              { name: 'message.ts', desc: 'Twilio SMS, Telegram bot, and email communications', icon: Send },
              { name: 'appointment.ts', desc: 'Google Calendar synchronized consultations & meetings', icon: Calendar },
            ].map((contract) => {
              const Icon = contract.icon;
              return (
                <div
                  key={contract.name}
                  className="border border-[#242E30] bg-[#171E1F] p-4 rounded-lg flex items-start gap-3 hover:border-[#B7F45B]/40 transition-colors"
                >
                  <div className="p-2 rounded bg-[#0D1112] text-[#B7F45B] border border-[#242E30]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#F5F7F2]">{contract.name}</span>
                      <StatusBadge label="READY" variant="lime" />
                    </div>
                    <p className="text-[11px] text-[#8E9B9A] leading-snug">{contract.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: Live API Diagnostics */}
      {activeTab === 'health' && (
        <div className="border border-[#242E30] bg-[#171E1F] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-[#B7F45B]" />
              <h3 className="font-bold text-base text-[#F5F7F2]">Live API Health Response</h3>
            </div>
            <button
              onClick={checkHealth}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-mono font-medium rounded bg-[#0D1112] border border-[#242E30] text-[#B7F45B] hover:border-[#B7F45B] transition-colors"
            >
              Ping /api/health
            </button>
          </div>

          {error && (
            <div className="p-4 rounded-lg bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 text-xs font-mono text-[#FF5C5C] space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                Backend Connection Notice:
              </div>
              <div>{error}</div>
              <div className="text-[#8E9B9A] mt-2">
                Make sure the Express server is running in Windows PowerShell using: <code className="text-[#B7F45B]">npm run server:dev</code> (Port 4000).
              </div>
            </div>
          )}

          {health ? (
            <pre className="p-4 rounded-lg bg-[#0D1112] border border-[#242E30] text-xs font-mono text-[#B7F45B] overflow-x-auto">
              {JSON.stringify(health, null, 2)}
            </pre>
          ) : (
            !error && (
              <div className="text-xs text-[#8E9B9A] font-mono py-4 text-center">
                Querying API server...
              </div>
            )
          )}
        </div>
      )}
    </Shell>
  );
}
export default App;
