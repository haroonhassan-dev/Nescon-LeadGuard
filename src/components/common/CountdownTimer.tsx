import React from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useCountdown } from '../../hooks/useCountdown';

interface CountdownTimerProps {
  deadlineIso?: string;
  isAcknowledged?: boolean;
}

export const CountdownTimer: React.FC<CountdownTimerProps> = ({ deadlineIso, isAcknowledged }) => {
  const { formatted, isExpired, isUrgent, isWarning } = useCountdown(deadlineIso);

  if (isAcknowledged) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#B7F45B]/10 text-[#B7F45B] border border-[#B7F45B]/30">
        <span className="h-1.5 w-1.5 rounded-full bg-[#B7F45B]" />
        ACKNOWLEDGED
      </span>
    );
  }

  if (!deadlineIso) {
    return <span className="text-xs font-mono text-[#8E9B9A]">--:--</span>;
  }

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#FF5C5C]/15 text-[#FF5C5C] border border-[#FF5C5C]/40 animate-pulse">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {formatted}
      </span>
    );
  }

  let colorClasses = 'bg-[#B7F45B]/10 text-[#B7F45B] border-[#B7F45B]/30';
  if (isUrgent) {
    colorClasses = 'bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/40 animate-pulse';
  } else if (isWarning) {
    colorClasses = 'bg-[#F5A623]/15 text-[#F5A623] border-[#F5A623]/40';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${colorClasses}`}>
      <Clock className="h-3 w-3 shrink-0" />
      <span>{formatted}</span>
    </span>
  );
};
