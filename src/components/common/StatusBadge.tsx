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
    lime: 'bg-[#B7F45B]/10 text-[#B7F45B] border-[#B7F45B]/30',
    muted: 'bg-[#8E9B9A]/10 text-[#8E9B9A] border-[#8E9B9A]/20',
    warning: 'bg-[#F5A623]/10 text-[#F5A623] border-[#F5A623]/30',
    danger: 'bg-[#FF5C5C]/10 text-[#FF5C5C] border-[#FF5C5C]/30',
  };

  const dotColors: Record<StatusVariant, string> = {
    lime: 'bg-[#B7F45B]',
    muted: 'bg-[#8E9B9A]',
    warning: 'bg-[#F5A623]',
    danger: 'bg-[#FF5C5C]',
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
