import { useEffect, useRef, useState, useCallback } from 'react';

export function usePolling(callback: () => void | Promise<void>, intervalMs = 10000, enabled = true) {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const triggerRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await savedCallback.current();
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      // Don't poll if document is hidden to save resources
      if (document.hidden) return;
      await triggerRefresh();
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled, triggerRefresh]);

  return { lastUpdated, isRefreshing, triggerRefresh };
}
