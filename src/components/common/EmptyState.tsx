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
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-[#E8E1D6] bg-[#FFFFFF]/50">
      <div className="h-12 w-12 rounded-xl bg-[#FAF8F4] border border-[#E8E1D6] flex items-center justify-center text-[#78716A] mb-4">
        <Icon className="h-6 w-6 stroke-[1.8]" />
      </div>
      <h3 className="text-base font-bold text-[#2B2A27]">{title}</h3>
      <p className="text-xs text-[#78716A] max-w-sm mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#4F7F6D] hover:bg-[#3F6A5A] text-white font-semibold text-xs tracking-wide uppercase transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
