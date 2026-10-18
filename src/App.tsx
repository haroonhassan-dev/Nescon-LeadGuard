import React, { useState, useEffect, useCallback } from 'react';
import { NavigationTab } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { Shell } from './components/layout/Shell';
import { DashboardPage } from './pages/DashboardPage';
import { LeadsPage } from './pages/LeadsPage';
import { CrmPage } from './pages/CrmPage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { TeamPage } from './pages/TeamPage';
import { appStore } from './services/store';
import { backendService } from './services/backendService';
import { fetchHealthStatus } from './services/healthService';
import { usePolling } from './hooks/usePolling';
import { Shield, LogIn, Lock, AlertCircle } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, login, user, hasPermission } = useAuth();
  const { showToast } = useToast();

  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [leadsInitialFilter, setLeadsInitialFilter] = useState<'all' | 'overdue' | 'today' | 'unassigned'>('all');

  // Real Login Screen State
  const [loginEmail, setLoginEmail] = useState('admin@sunco-demo.test');
  const [loginPassword, setLoginPassword] = useState('Password123!');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Live Backend Health Telemetry
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  // App Store Reactive State
  const [leads, setLeads] = useState(appStore.getLeads());
  const [opportunities, setOpportunities] = useState(appStore.getOpportunities());
  const [pipelines, setPipelines] = useState(appStore.getPipelines());
  const [contacts, setContacts] = useState(appStore.getContacts());
  const [companies, setCompanies] = useState(appStore.getCompanies());
  const [customFields, setCustomFields] = useState(appStore.getCustomFields());
  const [payments, setPayments] = useState(appStore.getPayments());
  const [messages, setMessages] = useState(appStore.getMessages());
  const [appointments, setAppointments] = useState(appStore.getAppointments());
  const [availabilities, setAvailabilities] = useState(appStore.getAvailabilities());
  const [auditEvents, setAuditEvents] = useState(appStore.getAuditEvents());
  const [users, setUsers] = useState(appStore.getUsers());

  // Sync with store
  const syncFromStore = useCallback(() => {
    setLeads([...appStore.getLeads()]);
    setOpportunities([...appStore.getOpportunities()]);
    setPipelines([...appStore.getPipelines()]);
    setContacts([...appStore.getContacts()]);
    setCompanies([...appStore.getCompanies()]);
    setCustomFields([...appStore.getCustomFields()]);
    setPayments([...appStore.getPayments()]);
    setMessages([...appStore.getMessages()]);
    setAppointments([...appStore.getAppointments()]);
    setAvailabilities([...appStore.getAvailabilities()]);
    setAuditEvents([...appStore.getAuditEvents()]);
    setUsers([...appStore.getUsers()]);
  }, []);

  useEffect(() => {
    return appStore.subscribe(syncFromStore);
  }, [syncFromStore]);

  // Check health
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetchHealthStatus();
      setIsBackendHealthy(res.status === 'ok');
    } catch {
      setIsBackendHealthy(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Sync leads & team directly from backend if available
  const syncFromBackend = useCallback(async () => {
    try {
      const leadsRes = await backendService.getLeads();
      if (leadsRes?.items && leadsRes.items.length > 0) {
        appStore.mergeBackendLeads(leadsRes.items);
      }
    } catch {
      // Backend offline
    }

    try {
      const teamRes = await backendService.getTeam();
      if (teamRes?.items && teamRes.items.length > 0) {
        appStore.mergeBackendTeam(teamRes.items);
      }
    } catch {
      // Backend offline
    }

    syncFromStore();
  }, [syncFromStore]);

  // Polling: Every 10s checks SLA countdowns and polls latest records
  const pollRecords = useCallback(async () => {
    const now = Date.now();
    appStore.getLeads().forEach((lead) => {
      if (
        lead.status === 'ASSIGNED' &&
        !lead.acknowledgedAt &&
        lead.acknowledgementDeadline &&
        new Date(lead.acknowledgementDeadline).getTime() < now
      ) {
        appStore.triggerEscalation(lead.id, 'Automatic 10s poll check: SLA timeout breached');
      }
    });

    if (isBackendHealthy) {
      await syncFromBackend();
    } else {
      syncFromStore();
    }
  }, [isBackendHealthy, syncFromBackend, syncFromStore]);

  const { isRefreshing: isPollingRefreshing, triggerRefresh: manualSync } = usePolling(
    pollRecords,
    10000,
    true
  );

  // Overdue count for sidebar alert badge
  const overdueCount = leads.filter(
    (l) =>
      l.status === 'ESCALATED' ||
      (!l.acknowledgedAt &&
        l.acknowledgementDeadline &&
        new Date(l.acknowledgementDeadline).getTime() < Date.now())
  ).length;

  // Drilldown handler from Dashboard
  const handleDrillDown = (target: 'leads_overdue' | 'leads_today' | 'crm_pipeline' | 'appointments') => {
    if (target === 'leads_overdue') {
      setLeadsInitialFilter('overdue');
      setCurrentTab('leads');
    } else if (target === 'leads_today') {
      setLeadsInitialFilter('today');
      setCurrentTab('leads');
    } else if (target === 'crm_pipeline') {
      setCurrentTab('crm');
    } else if (target === 'appointments') {
      setCurrentTab('integrations');
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await login(loginEmail, loginPassword);
      showToast('success', 'Authenticated', `Session token established.`);
      await syncFromBackend();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setLoginError(msg);
      showToast('error', 'Login Issue', msg);
    } finally {
      setIsLoggingIn(false);
    }
  };

  // If not authenticated, render authentic login prompt
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0D1112] flex items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-xl bg-[#171E1F] border border-[#242E30] space-y-6 shadow-2xl">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B] mx-auto shadow-sm">
              <Shield className="h-6 w-6 stroke-[2.2]" />
            </div>
            <h2 className="text-xl font-extrabold text-[#F5F7F2]">Nescon-LeadGuard</h2>
            <p className="text-xs text-[#8E9B9A]">Autonomous Multi-Tenant Lead Escalation Platform</p>
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 flex items-center gap-2 text-xs text-[#FF5C5C]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Account Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>

            <div>
              <label className="block text-xs font-mono text-[#8E9B9A] uppercase mb-1">
                Password
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#F5F7F2] text-xs focus:outline-none focus:border-[#B7F45B]"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] disabled:opacity-50 text-[#0D1112] font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <LogIn className="h-4 w-4" />
              {isLoggingIn ? 'Authenticating with Backend...' : 'Authenticate & Enter Console'}
            </button>
          </form>

          {/* Quick Preset Buttons for Seed Demo Accounts */}
          <div className="border-t border-[#242E30] pt-4 space-y-2">
            <span className="block text-[10px] font-mono text-[#8E9B9A] uppercase text-center tracking-wider">
              Quick-Select Backend Seed Accounts:
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('owner@sunco-demo.test');
                  setLoginPassword('Password123!');
                }}
                className="p-2 rounded bg-[#0D1112] border border-[#242E30] hover:border-[#B7F45B] text-left transition-colors"
              >
                <div className="font-bold text-[#F5F7F2]">Ali Khan</div>
                <div className="text-[10px] text-[#B7F45B]">[OWNER Level]</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('admin@sunco-demo.test');
                  setLoginPassword('Password123!');
                }}
                className="p-2 rounded bg-[#0D1112] border border-[#242E30] hover:border-[#B7F45B] text-left transition-colors"
              >
                <div className="font-bold text-[#F5F7F2]">Sara Ahmed</div>
                <div className="text-[10px] text-[#B7F45B]">[ADMIN Level]</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('manager@sunco-demo.test');
                  setLoginPassword('Password123!');
                }}
                className="p-2 rounded bg-[#0D1112] border border-[#242E30] hover:border-[#B7F45B] text-left transition-colors"
              >
                <div className="font-bold text-[#F5F7F2]">Usman Raza</div>
                <div className="text-[10px] text-[#8E9B9A]">[USER (Manager Role)]</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setLoginEmail('bilal@sunco-demo.test');
                  setLoginPassword('Password123!');
                }}
                className="p-2 rounded bg-[#0D1112] border border-[#242E30] hover:border-[#B7F45B] text-left transition-colors"
              >
                <div className="font-bold text-[#F5F7F2]">Bilal Hassan</div>
                <div className="text-[10px] text-[#8E9B9A]">[USER (Agent Role)]</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Check tab permissions
  if (currentTab === 'team' && !hasPermission('user:manage') && !hasPermission('role:manage') && user.baseLevel !== 'OWNER' && user.baseLevel !== 'ADMIN') {
    return (
      <Shell
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isBackendHealthy={isBackendHealthy}
        onRefreshHealth={checkHealth}
        isPollingRefreshing={isPollingRefreshing}
        onManualSync={manualSync}
        overdueCount={overdueCount}
      >
        <div className="p-8 text-center rounded-xl bg-[#171E1F] border border-[#FF5C5C]/30 max-w-lg mx-auto my-12 space-y-3">
          <Lock className="h-8 w-8 text-[#FF5C5C] mx-auto" />
          <h2 className="text-lg font-bold text-[#F5F7F2]">Permission Denied</h2>
          <p className="text-xs text-[#8E9B9A] leading-relaxed">
            Your active role <strong className="text-[#FF5C5C] font-mono">[{user.baseLevel}]</strong> lacks administrative authority to access Team Governance & RBAC.
          </p>
          <button
            onClick={() => setCurrentTab('dashboard')}
            className="mt-4 px-4 py-2 rounded-lg bg-[#0D1112] text-[#B7F45B] border border-[#242E30] text-xs font-mono"
          >
            Return to Operations Dashboard
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      currentTab={currentTab}
      onSelectTab={setCurrentTab}
      isBackendHealthy={isBackendHealthy}
      onRefreshHealth={checkHealth}
      isPollingRefreshing={isPollingRefreshing}
      onManualSync={manualSync}
      overdueCount={overdueCount}
    >
      {currentTab === 'dashboard' && (
        <DashboardPage
          leads={leads}
          opportunities={opportunities}
          payments={payments}
          availabilities={availabilities}
          appointments={appointments}
          auditEvents={auditEvents}
          onDrillDown={handleDrillDown}
        />
      )}

      {currentTab === 'leads' && (
        <LeadsPage
          leads={leads}
          users={users}
          availabilities={availabilities}
          initialFilter={leadsInitialFilter}
        />
      )}

      {currentTab === 'crm' && (
        <CrmPage
          contacts={contacts}
          companies={companies}
          opportunities={opportunities}
          pipelines={pipelines}
          customFields={customFields}
          payments={payments}
          messages={messages}
          appointments={appointments}
        />
      )}

      {currentTab === 'integrations' && (
        <IntegrationsPage
          payments={payments}
          messages={messages}
          appointments={appointments}
          users={users}
          isBackendHealthy={isBackendHealthy}
        />
      )}

      {currentTab === 'team' && (
        <TeamPage
          users={users}
          availabilities={availabilities}
          auditEvents={auditEvents}
        />
      )}
    </Shell>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
