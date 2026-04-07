/**
 * EmptyState Component
 * 
 * Beautiful empty state display for lists and tables.
 * Supports custom icons, descriptions, and action buttons.
 */

import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/utils/utils';

interface EmptyStateProps {
  /** Icon to display (defaults to Inbox) */
  icon?: ReactNode;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action element (e.g., a Button) */
  action?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      <div className="mb-4 text-gray-400 dark:text-dark-text-muted">
        {icon || <Inbox className="h-12 w-12" strokeWidth={1.5} />}
      </div>
      
      <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-1">
        {title}
      </h3>
      
      {description && (
        <p className="text-sm text-gray-500 dark:text-dark-text-secondary max-w-sm mb-4">
          {description}
        </p>
      )}
      
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
