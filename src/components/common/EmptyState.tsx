import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-[#242E30] bg-[#171E1F]/50">
      <div className="h-12 w-12 rounded-xl bg-[#0D1112] border border-[#242E30] flex items-center justify-center text-[#8E9B9A] mb-4">
        <Icon className="h-6 w-6 stroke-[1.8]" />
      </div>
      <h3 className="text-base font-bold text-[#F5F7F2]">{title}</h3>
      <p className="text-xs text-[#8E9B9A] max-w-sm mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#B7F45B] hover:bg-[#A4E045] text-[#0D1112] font-semibold text-xs tracking-wide uppercase transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
