import { useState, useEffect } from 'react';

export interface CountdownResult {
  formatted: string;
  totalSecondsRemaining: number;
  isExpired: boolean;
  isUrgent: boolean; // under 3 minutes
  isWarning: boolean; // under 7 minutes
}

export function useCountdown(targetIsoDate?: string): CountdownResult {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIsoDate) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [targetIsoDate]);

  if (!targetIsoDate) {
    return {
      formatted: '--:--',
      totalSecondsRemaining: 0,
      isExpired: false,
      isUrgent: false,
      isWarning: false,
    };
  }

  const targetMs = new Date(targetIsoDate).getTime();
  const diffMs = targetMs - now;
  const totalSecondsRemaining = Math.floor(diffMs / 1000);

  if (totalSecondsRemaining <= 0) {
    const overdueSeconds = Math.abs(totalSecondsRemaining);
    const m = Math.floor(overdueSeconds / 60);
    const s = overdueSeconds % 60;
    const formattedOverdue = `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')} BREACHED`;
    return {
      formatted: formattedOverdue,
      totalSecondsRemaining,
      isExpired: true,
      isUrgent: true,
      isWarning: true,
    };
  }

  const minutes = Math.floor(totalSecondsRemaining / 60);
  const seconds = totalSecondsRemaining % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return {
    formatted,
    totalSecondsRemaining,
    isExpired: false,
    isUrgent: totalSecondsRemaining < 180, // Under 3 mins
    isWarning: totalSecondsRemaining < 420, // Under 7 mins
  };
}
