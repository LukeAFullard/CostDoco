import React, { useEffect, useRef } from 'react';

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  isDirty?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ onClose, children, className = '', isDirty = false }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDirty) {
          if (window.confirm('You have unsaved changes. Are you sure you want to close?')) onClose();
        } else {
          onClose();
        }
      } else if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusableElements = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        if (e.shiftKey) {
          if (document.activeElement === firstElement || document.activeElement === modalRef.current) {
            e.preventDefault();
            lastElement.focus();
          }
        } else if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isDirty]);

  useEffect(() => {
    if (modalRef.current) modalRef.current.focus();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (isDirty) {
        if (window.confirm('You have unsaved changes. Are you sure you want to close?')) onClose();
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      className={`fixed inset-0 bg-ink/50 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto ${className}`}
      role="dialog"
      aria-modal="true"
      onClick={handleBackdropClick}
    >
      <div ref={modalRef} tabIndex={-1} className="outline-none w-full flex justify-center">
        {children}
      </div>
    </div>
  );
};
