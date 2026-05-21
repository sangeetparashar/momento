'use client';

import { useEffect, useCallback, useRef, useState } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate in after mount, animate out before unmount
  useEffect(() => {
    if (isOpen) {
      // Small delay for CSS transition to trigger
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape key handler
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Focus trap: keep focus inside the modal
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6
                  transition-all duration-300 ease-out
                  ${visible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Backdrop — solid black + heavy blur, fully hides the page behind */}
      <div
        className="absolute inset-0 bg-black backdrop-blur-3xl"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative w-full max-w-3xl max-h-[85vh] flex flex-col
                    bg-momento-bg-secondary border border-momento-border rounded-2xl
                    shadow-[0_0_60px_rgba(0,0,0,0.5),0_0_20px_rgba(0,255,136,0.05)]
                    transition-all duration-300 ease-out outline-none
                    ${visible ? 'translate-y-0 scale-100' : 'translate-y-8 scale-[0.97]'}`}
      >
        {/* Sticky header */}
        <div className="flex items-center justify-between px-6 sm:px-8 py-5 border-b border-momento-border shrink-0">
          <h2 className="text-white font-bold text-xl tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full
                       text-momento-text-tertiary hover:text-white hover:bg-momento-bg-tertiary
                       transition-all duration-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-6 sm:px-8 py-6 flex-1 custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
}
