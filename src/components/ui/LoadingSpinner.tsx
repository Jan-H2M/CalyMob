/**
 * LoadingSpinner Component
 * 
 * Consistent loading spinner with multiple sizes.
 * Uses calypso brand colors with dark mode support.
 */

import { cn } from '@/utils/utils';

interface LoadingSpinnerProps {
  /** Size of the spinner */
  size?: 'sm' | 'md' | 'lg';
  /** Additional CSS classes */
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-3',
  lg: 'h-12 w-12 border-4',
};

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        'inline-block animate-spin rounded-full border-calypso-blue dark:border-calypso-aqua border-t-transparent',
        sizeClasses[size],
        className
      )}
      role="status"
      aria-label="Laden..."
    >
      <span className="sr-only">Laden...</span>
    </div>
  );
}
