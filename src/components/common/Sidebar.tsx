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
    <aside className="w-64 bg-[#171E1F] border-r border-[#242E30] flex flex-col justify-between h-[calc(100vh-4rem)] p-4 select-none">
      {/* Navigation list */}
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="px-3 py-1 text-[10px] font-mono tracking-wider uppercase text-[#8E9B9A]">
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
                    ? 'bg-[#B7F45B] text-[#0D1112] font-semibold shadow-sm'
                    : 'text-[#F5F7F2] hover:bg-[#0D1112]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? 'text-[#0D1112]' : 'text-[#B7F45B]'
                    }`}
                  />
                  <div className="truncate">
                    <div className="text-xs tracking-tight">{item.label}</div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? 'text-[#0D1112]/75' : 'text-[#8E9B9A]'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </div>

                {item.locked && (
                  <Lock className="h-3.5 w-3.5 text-[#8E9B9A] shrink-0" />
                )}

                {item.badge !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                      isActive
                        ? 'bg-[#0D1112] text-[#FF5C5C]'
                        : 'bg-[#FF5C5C]/20 text-[#FF5C5C] border border-[#FF5C5C]/40'
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
        <div className="border border-[#242E30] bg-[#0D1112] rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-mono text-[#8E9B9A]">
            <span className="flex items-center gap-1.5 text-[#F5F7F2] font-medium">
              <Zap className="h-3 w-3 text-[#B7F45B]" />
              SLA Engine
            </span>
            <span className="text-[#B7F45B]">ACTIVE</span>
          </div>
          <div className="text-xs text-[#8E9B9A] leading-relaxed">
            Acknowledgement window:{' '}
            <span className="text-[#F5F7F2] font-semibold font-mono">
              {workspace.settings.defaultAcknowledgementTimeoutMinutes}m
            </span>
          </div>
          <div className="text-[10px] text-[#8E9B9A] flex items-center gap-1 border-t border-[#242E30] pt-2">
            <Clock className="h-3 w-3 text-[#B7F45B]" />
            Crash-resilient recovery enabled
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-t border-[#242E30] pt-3 text-[11px] text-[#8E9B9A] flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[10px]">
          <ShieldCheck className="h-3.5 w-3.5 text-[#B7F45B]" />
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
            className="fixed inset-0 bg-[#0D1112]/80 transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-64 max-w-xs">{content}</div>
        </div>
      )}
    </>
  );
};
