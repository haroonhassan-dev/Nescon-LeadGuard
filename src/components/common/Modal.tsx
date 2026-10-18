import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#FAF8F4]/85 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={`relative transform overflow-hidden rounded-xl bg-[#FFFFFF] border border-[#E8E1D6] text-left shadow-2xl transition-all w-full ${maxWidthClasses[maxWidth]} my-8`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E1D6]">
            <div>
              <h3 id="modal-title" className="text-base font-bold text-[#2B2A27] tracking-tight">
                {title}
              </h3>
              {subtitle && <p className="text-xs text-[#78716A] mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-[#78716A] hover:text-[#2B2A27] hover:bg-[#FAF8F4] p-1.5 rounded-lg border border-transparent hover:border-[#E8E1D6] transition-colors"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
};
