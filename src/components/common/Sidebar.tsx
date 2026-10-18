import React from 'react';
import {
  Activity,
  ShieldAlert,
  Layers,
  Workflow,
  Users,
  ShieldCheck,
  Clock,
  Zap,
  Lock
} from 'lucide-react';
import { NavigationTab } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  overdueCount: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  overdueCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { workspace, hasPermission } = useAuth();

  const canManageTeam = hasPermission('user:read') || hasPermission('role:manage');

  const navItems: Array<{
    id: NavigationTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeVariant?: 'danger' | 'lime';
    locked?: boolean;
  }> = [
    {
      id: 'dashboard',
      label: 'Operations Dashboard',
      description: 'KPI metrics, revenue & SLAs',
      icon: Activity,
    },
    {
      id: 'leads',
      label: 'Lead Command Center',
      description: 'Inbox, SLA countdown & recovery',
      icon: ShieldAlert,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeVariant: 'danger',
    },
    {
      id: 'crm',
      label: 'CRM & Pipelines',
      description: 'Contacts, companies & deals',
      icon: Layers,
    },
    {
      id: 'integrations',
      label: 'Integrations Hub',
      description: 'Twilio, Stripe, GCal, Telegram',
      icon: Workflow,
    },
    {
      id: 'team',
      label: 'Team & Governance',
      description: 'RBAC, shifts & audit logs',
      icon: Users,
      locked: !canManageTeam,
    },
  ];

  const content = (
    <aside className="w-64 bg-white/70 backdrop-blur-md border-r border-[#E8E1D6] flex flex-col justify-between h-[calc(100vh-4rem)] p-4 select-none">
      {/* Navigation list */}
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="px-3 py-1 text-[10px] font-mono tracking-wider uppercase text-[#78716A]">
            Core Management
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors relative group ${
                  isActive
                    ? 'bg-[#4F7F6D] text-white font-semibold shadow-sm'
                    : 'text-[#2B2A27] hover:bg-[#FAF8F4]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-[#4F7F6D]'
                    }`}
                  />
                  <div className="truncate">
                    <div className="text-xs tracking-tight">{item.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? 'text-white/75' : 'text-[#78716A]'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </div>

                {item.locked && (
                  <Lock className="h-3.5 w-3.5 text-[#78716A] shrink-0" />
                )}

                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                      isActive
                        ? 'bg-[#FAF8F4] text-[#B9524C]'
                        : 'bg-[#B9524C]/20 text-[#B9524C] border border-[#B9524C]/40'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* SLA Telemetry Card */}
        <div className="border border-[#E8E1D6] bg-[#FAF8F4] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#78716A]">
            <span className="flex items-center gap-1.5 text-[#2B2A27] font-medium">
              <Zap className="h-3 w-3 text-[#4F7F6D]" />
              SLA Engine
            </span>
            <span className="text-[#4F7F6D]">ACTIVE</span>
          </div>
          <div className="text-xs text-[#78716A] leading-relaxed">
            Acknowledgement window:{' '}
            <span className="text-[#2B2A27] font-semibold font-mono">
              {workspace.settings.defaultAcknowledgementTimeoutMinutes}m
            </span>
          </div>
          <div className="text-[10px] text-[#78716A] flex items-center gap-1 border-t border-[#E8E1D6] pt-2">
            <Clock className="h-3 w-3 text-[#4F7F6D]" />
            Crash-resilient recovery enabled
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-[#E8E1D6] pt-3 text-[11px] text-[#78716A] flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#4F7F6D]" />
          Zero Secret Leakage
        </span>
        <span className="font-mono text-[10px]">v0.1.0</span>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <div className="hidden md:block shrink-0">{content}</div>

      {/* Mobile drawer backdrop & drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-[#FAF8F4]/80 transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-xs">{content}</div>
        </div>
      )}
    </>
  );
};
