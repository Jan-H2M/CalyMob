/**
 * Accordion Component
 *
 * Collapsible section with smooth animation.
 * Supports defaultOpen state and remembers state via optional localStorage key.
 */

import { useState, useEffect, useRef, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/utils';

interface AccordionProps {
  /** Title displayed in the header */
  title: string;
  /** Optional icon to display before the title */
  icon?: ReactNode;
  /** Whether the accordion is open by default */
  defaultOpen?: boolean;
  /** Optional localStorage key to persist open/closed state */
  storageKey?: string;
  /** Content to display when expanded */
  children: ReactNode;
  /** Additional CSS classes for the container */
  className?: string;
  /** Additional CSS classes for the header */
  headerClassName?: string;
  /** Additional CSS classes for the content wrapper */
  contentClassName?: string;
}

export function Accordion({
  title,
  icon,
  defaultOpen = false,
  storageKey,
  children,
  className,
  headerClassName,
  contentClassName
}: AccordionProps) {
  // Initialize state from localStorage if available
  const [isOpen, setIsOpen] = useState(() => {
    if (storageKey && typeof window !== 'undefined') {
      const stored = localStorage.getItem(`accordion_${storageKey}`);
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return defaultOpen;
  });

  // Ref for measuring content height for smooth animation
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  // Update localStorage when state changes
  useEffect(() => {
    if (storageKey && typeof window !== 'undefined') {
      localStorage.setItem(`accordion_${storageKey}`, String(isOpen));
    }
  }, [isOpen, storageKey]);

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [children]);

  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className={cn('border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden', className)}>
      {/* Header - clickable */}
      <button
        type="button"
        onClick={toggleOpen}
        className={cn(
          'w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors text-left',
          headerClassName
        )}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{title}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-gray-500 dark:text-dark-text-muted transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Content - collapsible with animation */}
      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: isOpen ? contentHeight : 0,
          opacity: isOpen ? 1 : 0
        }}
      >
        <div
          ref={contentRef}
          className={cn('p-4 pt-0 bg-white', contentClassName)}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
