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
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#4F7F6D]/10 text-[#4F7F6D] border border-[#4F7F6D]/30">
        <span className="h-1.5 w-1.5 rounded-full bg-[#4F7F6D]" />
        ACKNOWLEDGED
      </span>
    );
  }

  if (!deadlineIso) {
    return <span className="text-xs font-mono text-[#78716A]">--:--</span>;
  }

  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#B9524C]/15 text-[#B9524C] border border-[#B9524C]/40 animate-pulse">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {formatted}
      </span>
    );
  }

  let colorClasses = 'bg-[#4F7F6D]/10 text-[#4F7F6D] border-[#4F7F6D]/30';
  if (isUrgent) {
    colorClasses = 'bg-[#B9524C]/15 text-[#B9524C] border-[#B9524C]/40 animate-pulse';
  } else if (isWarning) {
    colorClasses = 'bg-[#B97F2E]/15 text-[#B97F2E] border-[#B97F2E]/40';
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-mono font-medium border ${colorClasses}`}>
      <Clock className="h-3 w-3 shrink-0" />
      <span>{formatted}</span>
    </span>
  );
};
