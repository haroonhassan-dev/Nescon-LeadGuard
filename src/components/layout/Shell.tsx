import React, { useState } from 'react';
import { Header } from '../common/Header';
import { Sidebar } from '../common/Sidebar';
import { NavigationTab } from '../../types';
import { Modal } from '../common/Modal';
import { BackgroundDecor } from '../common/BackgroundDecor';
import { errorMessage } from '../../services/sync';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AlertTriangle, Building2, Clock, Check, LogIn } from 'lucide-react';

interface ShellProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  children: React.ReactNode;
  isBackendHealthy: boolean | null;
  onRefreshHealth: () => void;
  isPollingRefreshing?: boolean;
  onManualSync?: () => void;
  overdueCount: number;
}

export const Shell: React.FC<ShellProps> = ({
  currentTab,
  onSelectTab,
  children,
  isBackendHealthy,
  onRefreshHealth,
  isPollingRefreshing,
  onManualSync,
  overdueCount,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(false);
  const { isSessionExpired, dismissSessionExpired, signupWorkspace } = useAuth();
  const { showToast } = useToast();

  // Signup form state
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [slaTimeout, setSlaTimeout] = useState(15);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      showToast('error', 'Company name required');
      return;
    }
    const nameParts = (adminName.trim() || 'Admin User').split(' ');
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    try {
      const ws = await signupWorkspace(companyName.trim(), firstName, lastName, adminEmail.trim(), adminPassword);
      showToast('success', 'Workspace Created', `Company workspace "${ws.name}" initialized successfully.`);
      setIsSignupModalOpen(false);
      setCompanyName('');
      setAdminName('');
      setAdminEmail('');
      setAdminPassword('');
    } catch (err) {
      showToast('error', 'Signup failed', errorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#2B2A27] flex flex-col font-sans">
      <BackgroundDecor />
      <div className="app-layer flex flex-col flex-1 min-h-screen">
      <Header
        isBackendHealthy={isBackendHealthy}
        onRefreshHealth={onRefreshHealth}
        isPollingRefreshing={isPollingRefreshing}
        onManualSync={onManualSync}
        isMobileMenuOpen={isMobileMenuOpen}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        onOpenSignupModal={() => setIsSignupModalOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={onSelectTab}
          overdueCount={overdueCount}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto w-full">
          <div key={currentTab} className="page-enter">{children}</div>
        </main>
      </div>
      </div>

      {/* Session Expired Modal */}
      <Modal
        isOpen={isSessionExpired}
        onClose={dismissSessionExpired}
        title="Session Authentication Expired"
        subtitle="Security timeout after inactivity or token invalidation"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#B97F2E]/10 border border-[#B97F2E]/30 text-xs text-[#B97F2E] flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-bold text-sm">Authentication Renewal Required</div>
              <p className="mt-1 text-[#78716A]">
                Your token session has expired. To protect tenant workspace records, please re-authenticate or restore session.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={dismissSessionExpired}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <LogIn className="h-4 w-4" />
              Restore Session & Continue
            </button>
          </div>
        </div>
      </Modal>

      {/* Signup Company Workspace Modal */}
      <Modal
        isOpen={isSignupModalOpen}
        onClose={() => setIsSignupModalOpen(false)}
        title="Create New Company Workspace"
        subtitle="Provision an isolated multi-tenant organization with autonomous lead escalation"
      >
        <form onSubmit={handleSignupSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-[#78716A] uppercase mb-1">Company / Organization Name *</label>
            <div className="relative">
              <input
                type="text"
                required
                placeholder="e.g. Acme Commercial Roofing Ltd"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[#2B2A27] text-sm focus:outline-none focus:border-[#4F7F6D]"
              />
              <Building2 className="absolute right-3 top-3 h-4 w-4 text-[#78716A]" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono text-[#78716A] uppercase mb-1">Admin Full Name</label>
              <input
                type="text"
                placeholder="e.g. Jordan Hayes"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[#2B2A27] text-sm focus:outline-none focus:border-[#4F7F6D]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#78716A] uppercase mb-1">Admin Work Email</label>
              <input
                type="email"
                required
                placeholder="e.g. jordan@acme.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[#2B2A27] text-sm focus:outline-none focus:border-[#4F7F6D]"
              />
            </div>
          </div>

          <div>
            <label htmlFor="signup-password" className="block text-xs font-mono text-[#78716A] uppercase mb-1">Password (at least 10 characters)</label>
            <input
              id="signup-password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#FAF8F4] border border-[#E8E1D6] text-[#2B2A27] text-sm focus:outline-none focus:border-[#4F7F6D]"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[#78716A] uppercase mb-1">
              Initial SLA Response Timeout: <span className="text-[#4F7F6D] font-bold">{slaTimeout} Minutes</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="60"
                step="5"
                value={slaTimeout}
                onChange={(e) => setSlaTimeout(parseInt(e.target.value, 10))}
                className="flex-1 accent-[#4F7F6D]"
              />
              <Clock className="h-4 w-4 text-[#78716A]" />
            </div>
            <p className="text-[11px] text-[#78716A] mt-1">
              Leads unacknowledged within this window trigger automatic escalation notifications.
            </p>
          </div>

          <div className="border-t border-[#E8E1D6] pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsSignupModalOpen(false)}
              className="px-4 py-2.5 rounded-lg bg-[#FAF8F4] hover:bg-[#F3EEE6] text-[#78716A] hover:text-[#2B2A27] text-xs font-medium border border-[#E8E1D6] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs uppercase tracking-wide transition-colors"
            >
              <Check className="h-4 w-4" />
              Provision Workspace
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
