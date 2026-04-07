/**
 * Modal Component
 * 
 * Accessible modal dialog with:
 * - Focus trap
 * - ESC to close
 * - Click outside to close
 * - Smooth animations
 * - Dark mode support
 */

import { useEffect, useRef, useCallback, ReactNode, MouseEvent, KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/utils/utils';

interface ModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal title */
  title?: string;
  /** Modal content */
  children: ReactNode;
  /** Size of the modal */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Whether clicking outside closes the modal */
  closeOnOverlayClick?: boolean;
  /** Whether pressing ESC closes the modal */
  closeOnEsc?: boolean;
  /** Whether to show the close button */
  showCloseButton?: boolean;
  /** Additional CSS classes for the modal content */
  className?: string;
  /** Footer content */
  footer?: ReactNode;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEsc = true,
  showCloseButton = true,
  className,
  footer,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Handle ESC key
  const handleKeyDown = useCallback(
    (event: globalThis.KeyboardEvent) => {
      if (closeOnEsc && event.key === 'Escape') {
        onClose();
      }
    },
    [closeOnEsc, onClose]
  );

  // Focus trap
  const handleFocusTrap = useCallback((event: globalThis.KeyboardEvent) => {
    if (event.key !== 'Tab' || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement?.focus();
    }
  }, []);

  // Setup event listeners and focus management
  useEffect(() => {
    if (isOpen) {
      // Store current active element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Add event listeners
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('keydown', handleFocusTrap);
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Focus first focusable element
      setTimeout(() => {
        const focusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }, 0);

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keydown', handleFocusTrap);
        document.body.style.overflow = '';
        
        // Restore focus
        previousActiveElement.current?.focus();
      };
    }
  }, [isOpen, handleKeyDown, handleFocusTrap]);

  // Handle overlay click
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 dark:bg-black/70 transition-opacity"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      
      {/* Modal content */}
      <div
        ref={modalRef}
        className={cn(
          'relative w-full bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl',
          'transform transition-all',
          'max-h-[90vh] flex flex-col',
          sizeClasses[size],
          className
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border shrink-0">
            {title && (
              <h2
                id="modal-title"
                className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary"
              >
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-gray-600 dark:text-dark-text-muted dark:hover:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                aria-label="Sluiten"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        
        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
        
        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary rounded-b-lg shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
