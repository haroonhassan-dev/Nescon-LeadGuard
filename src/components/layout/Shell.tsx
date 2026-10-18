import React from 'react';
import { Header } from '../common/Header';

interface ShellProps {
  children: React.ReactNode;
  isBackendHealthy: boolean | null;
}

export const Shell: React.FC<ShellProps> = ({ children, isBackendHealthy }) => {
  return (
    <div className="min-h-screen bg-[#0D1112] text-[#F5F7F2] flex flex-col">
      <Header isBackendHealthy={isBackendHealthy} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-[#242E30] bg-[#171E1F] py-6 text-center text-xs text-[#8E9B9A]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Nescon-LeadGuard Multi-Tenant Architecture &bull; Hackathon Shared Scaffold</span>
          <span className="font-mono text-[11px] text-[#8E9B9A]">PostgreSQL &bull; Prisma &bull; Express &bull; React &bull; Tailwind</span>
        </div>
      </footer>
    </div>
  );
};
