import React from 'react';
import { Shield, Layers, Activity } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface HeaderProps {
  workspaceName?: string;
  isBackendHealthy: boolean | null;
}

export const Header: React.FC<HeaderProps> = ({
  workspaceName = 'Nescon Operations (Demo Tenant)',
  isBackendHealthy,
}) => {
  return (
    <header className="border-b border-[#242E30] bg-[#171E1F] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#B7F45B] shadow-sm">
            <Shield className="h-5 w-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base tracking-tight text-[#F5F7F2]">
                Nescon<span className="text-[#B7F45B]">-LeadGuard</span>
              </span>
              <span className="text-[10px] font-mono tracking-widest uppercase bg-[#0D1112] border border-[#242E30] text-[#8E9B9A] px-1.5 py-0.5 rounded">
                Scaffold v0.1.0
              </span>
            </div>
            <p className="text-xs text-[#8E9B9A]">Autonomous SLA Recovery & Lead Escalation</p>
          </div>
        </div>

        {/* Workspace & Health status */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-[#0D1112] border border-[#242E30] px-3 py-1.5 rounded-lg text-xs font-mono text-[#F5F7F2]">
            <Layers className="h-3.5 w-3.5 text-[#B7F45B]" />
            <span className="text-[#8E9B9A]">Workspace:</span>
            <span className="font-semibold">{workspaceName}</span>
          </div>

          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#8E9B9A]" />
            {isBackendHealthy === null ? (
              <StatusBadge label="CHECKING API" variant="muted" pulse />
            ) : isBackendHealthy ? (
              <StatusBadge label="API ONLINE" variant="lime" pulse />
            ) : (
              <StatusBadge label="API DISCONNECTED" variant="warning" />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
