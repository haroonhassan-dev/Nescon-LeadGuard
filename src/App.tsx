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
import { onSyncRequested } from './services/sync';
import { ApiClientError } from './services/apiClient';
import { Shield, LogIn, AlertCircle } from 'lucide-react';

function AppContent() {
  const { isAuthenticated, login, logout } = useAuth();
  const { showToast } = useToast();

  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [leadsInitialFilter, setLeadsInitialFilter] = useState<'all' | 'overdue' | 'today' | 'unassigned'>('all');

  // Real Login Screen State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Live Backend Health Telemetry
  const [isBackendHealthy, setIsBackendHealthy] = useState<boolean | null>(null);

  // App Store Reactive State
  const [leads, setLeads] = useState(appStore.getLeads());
  const [availabilities, setAvailabilities] = useState(appStore.getAvailabilities());
  const [users, setUsers] = useState(appStore.getUsers());

  // Sync with store
  const syncFromStore = useCallback(() => {
    setLeads([...appStore.getLeads()]);
    setAvailabilities([...appStore.getAvailabilities()]);
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

  // Leads and team come from the backend; the server's escalation worker does all escalating.
  const syncFromBackend = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [leadsRes, teamRes] = await Promise.all([backendService.getLeads(), backendService.getTeam()]);
      appStore.mergeBackendTeam(teamRes.items || []);
      appStore.mergeBackendLeads(leadsRes.items || []);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        showToast('warning', 'Session ended', 'Please log in again.');
        await logout();
        return;
      }
      // Network hiccup: keep showing the last data, next poll retries.
    }
    syncFromStore();
  }, [isAuthenticated, logout, showToast, syncFromStore]);

  // Any page that changes data asks for an immediate refresh.
  useEffect(() => onSyncRequested(() => void syncFromBackend()), [syncFromBackend]);

  // Poll every 5 s so new leads, escalations and countdowns stay current without a refresh.
  const pollRecords = useCallback(async () => {
    await syncFromBackend();
  }, [syncFromBackend]);

  const { isRefreshing: isPollingRefreshing, triggerRefresh: manualSync } = usePolling(
    pollRecords,
    5000,
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
              Demo accounts (fills the email; type the demo password):
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail('owner@sunco-demo.test');
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
        <DashboardPage leads={leads} availabilities={availabilities} users={users} onDrillDown={handleDrillDown} />
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
        <CrmPage users={users} />
      )}

      {currentTab === 'integrations' && (
        <IntegrationsPage users={users} isBackendHealthy={isBackendHealthy} />
      )}

      {currentTab === 'team' && (
        <TeamPage />
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
