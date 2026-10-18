import React, { useState } from 'react';
import {
  Shield,
  Layers,
  RefreshCw,
  LogOut,
  Plus,
  Check,
  Menu,
  X,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge } from './StatusBadge';

interface HeaderProps {
  isBackendHealthy: boolean | null;
  onRefreshHealth: () => void;
  isPollingRefreshing?: boolean;
  onManualSync?: () => void;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
  onOpenSignupModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isBackendHealthy,
  onRefreshHealth,
  isPollingRefreshing,
  onManualSync,
  onToggleMobileMenu,
  isMobileMenuOpen,
  onOpenSignupModal,
}) => {
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);

  return (
    <header className="border-b border-[#242E30] bg-[#171E1F] sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Mobile Toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-[#8E9B9A] hover:text-[#F5F7F2] hover:bg-[#0D1112] border border-transparent hover:border-[#242E30]"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B] shadow-sm shrink-0">
              <Shield className="h-5 w-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-[#F5F7F2]">
                  Nescon<span className="text-[#B7F45B]">-LeadGuard</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] font-mono tracking-widest uppercase bg-[#0D1112] border border-[#242E30] text-[#B7F45B] px-1.5 py-0.5 rounded">
                  NESCON HACKATHON
                </span>
              </div>
              <p className="text-[11px] text-[#8E9B9A] hidden sm:block">Autonomous Lead Escalation & SLA Recovery</p>
            </div>
          </div>
        </div>

        {/* Right Section: Workspace, Persona, Health & Sync */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Workspace Switcher */}
          <div className="relative">
            <button
              onClick={() => {
                setShowWorkspaceDropdown(!showWorkspaceDropdown);
                setShowPersonaDropdown(false);
              }}
              className="flex items-center gap-2 bg-[#0D1112] hover:bg-[#1F282A] border border-[#242E30] px-2.5 py-1.5 rounded-lg text-xs font-mono text-[#F5F7F2] transition-colors"
              title="Switch Workspace Tenant"
            >
              <Layers className="h-3.5 w-3.5 text-[#B7F45B] shrink-0" />
              <span className="max-w-[130px] sm:max-w-[180px] truncate">{workspace.name}</span>
              <ChevronDown className="h-3 w-3 text-[#8E9B9A]" />
            </button>

            {showWorkspaceDropdown && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#171E1F] border border-[#242E30] shadow-2xl p-2 z-50 animate-fade-in">
                <div className="px-3 py-1.5 text-[11px] font-mono text-[#8E9B9A] uppercase tracking-wider border-b border-[#242E30] mb-1">
                  Active Tenant Workspaces
                </div>
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => {
                      switchWorkspace(ws.id);
                      setShowWorkspaceDropdown(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono text-left transition-colors ${
                      ws.id === workspace.id
                        ? 'bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30'
                        : 'text-[#F5F7F2] hover:bg-[#0D1112]'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.id === workspace.id && <Check className="h-3.5 w-3.5 text-[#B7F45B]" />}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setShowWorkspaceDropdown(false);
                    onOpenSignupModal();
                  }}
                  className="w-full mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-[#0D1112] bg-[#B7F45B] hover:bg-[#A4E045] transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create New Workspace
                </button>
              </div>
            )}
          </div>

          {/* Persona Switcher for Quick RBAC Inspection */}
          <div className="relative">
            <button
              onClick={() => {
                setShowPersonaDropdown(!showPersonaDropdown);
                setShowWorkspaceDropdown(false);
              }}
              className="flex items-center gap-2 bg-[#0D1112] hover:bg-[#1F282A] border border-[#242E30] px-2.5 py-1.5 rounded-lg text-xs text-[#F5F7F2] transition-colors"
              title="Signed-in user"
            >
              <div className="h-5 w-5 rounded-full overflow-hidden bg-[#242E30] shrink-0 border border-[#B7F45B]/40">
                <span className="h-full w-full flex items-center justify-center text-[10px] font-bold text-[#B7F45B]">{(user.firstName || '?').charAt(0)}</span>
              </div>
              <span className="font-semibold hidden lg:inline">{user.firstName}</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono uppercase bg-[#171E1F] border border-[#242E30] text-[#B7F45B]">
                {user.baseLevel || user.role.type}
              </span>
              <ChevronDown className="h-3 w-3 text-[#8E9B9A]" />
            </button>

            {showPersonaDropdown && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl bg-[#171E1F] border border-[#242E30] shadow-2xl p-3 z-50 animate-fade-in space-y-2">
                <div className="text-[11px] font-mono text-[#8E9B9A] uppercase tracking-wider">Signed in (server session)</div>
                <div>
                  <div className="text-sm font-semibold text-[#F5F7F2]">{user.fullName}</div>
                  <div className="text-[11px] font-mono text-[#8E9B9A]">{user.email}</div>
                  <div className="mt-1 text-[10px] font-mono">
                    <span className="text-[#B7F45B]">[{user.baseLevel}]</span>{' '}
                    <span className="text-[#8E9B9A]">Role: {user.role?.name || user.baseLevel}</span>
                  </div>
                </div>
                <div className="text-[10px] text-[#8E9B9A]">To test another role, log out and sign in as that user.</div>
                <div className="border-t border-[#242E30] pt-1">
                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#FF5C5C] hover:bg-[#0D1112] transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Real-time Polling & Health Indicator */}
          <div className="hidden sm:flex items-center gap-2">
            <button
              onClick={onManualSync}
              className={`p-1.5 rounded-lg bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] hover:text-[#B7F45B] transition-colors ${
                isPollingRefreshing ? 'text-[#B7F45B]' : ''
              }`}
              title="Manual Trigger: Poll Latest Operational Records"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isPollingRefreshing ? 'animate-spin text-[#B7F45B]' : ''}`} />
            </button>

            <button
              onClick={onRefreshHealth}
              className="flex items-center"
              title="Click to re-ping Express /api/health"
            >
              {isBackendHealthy === null ? (
                <StatusBadge label="CHECKING API" variant="muted" pulse />
              ) : isBackendHealthy ? (
                <StatusBadge label="API ONLINE" variant="lime" pulse />
              ) : (
                <StatusBadge label="API OFFLINE" variant="warning" />
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
