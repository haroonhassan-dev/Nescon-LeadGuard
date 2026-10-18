import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (type: ToastType, title: string, message?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 5000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const icons = {
            success: <CheckCircle2 className="h-5 w-5 text-[#4F7F6D] shrink-0" />,
            error: <AlertCircle className="h-5 w-5 text-[#B9524C] shrink-0" />,
            warning: <AlertTriangle className="h-5 w-5 text-[#B97F2E] shrink-0" />,
            info: <Info className="h-5 w-5 text-[#4A86A8] shrink-0" />,
          };

          const borderColors = {
            success: 'border-[#4F7F6D]/40',
            error: 'border-[#B9524C]/40',
            warning: 'border-[#B97F2E]/40',
            info: 'border-[#4A86A8]/40',
          };

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-4 rounded-xl bg-[#FFFFFF] border ${borderColors[toast.type]} shadow-xl shadow-black/50 flex items-start gap-3 transition-all duration-300 animate-slide-up`}
            >
              {icons[toast.type]}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-[#2B2A27] tracking-tight">{toast.title}</h4>
                {toast.message && (
                  <p className="text-xs text-[#78716A] mt-0.5 leading-snug">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-[#78716A] hover:text-[#2B2A27] p-1 rounded transition-colors"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
