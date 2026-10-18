import React from 'react';

export type StatusVariant = 'lime' | 'muted' | 'warning' | 'danger';

interface StatusBadgeProps {
  label: string;
  variant?: StatusVariant;
  pulse?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  variant = 'lime',
  pulse = false,
}) => {
  const variantStyles: Record<StatusVariant, string> = {
    lime: 'bg-[#4F7F6D]/10 text-[#4F7F6D] border-[#4F7F6D]/30',
    muted: 'bg-[#78716A]/10 text-[#78716A] border-[#78716A]/20',
    warning: 'bg-[#B97F2E]/10 text-[#B97F2E] border-[#B97F2E]/30',
    danger: 'bg-[#B9524C]/10 text-[#B9524C] border-[#B9524C]/30',
  };

  const dotColors: Record<StatusVariant, string> = {
    lime: 'bg-[#4F7F6D]',
    muted: 'bg-[#78716A]',
    warning: 'bg-[#B97F2E]',
    danger: 'bg-[#B9524C]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${variantStyles[variant]}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse && (
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[variant]}`}
          />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[variant]}`} />
      </span>
      {label}
    </span>
  );
};
