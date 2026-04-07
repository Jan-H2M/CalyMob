/**
 * FormField Component
 * 
 * Wrapper for form inputs with label, error display, and required indicator.
 * Provides consistent styling across all form fields.
 */

import { ReactNode } from 'react';
import { cn } from '@/utils/utils';

interface FormFieldProps {
  /** Label text */
  label: string;
  /** ID of the associated form element */
  htmlFor: string;
  /** Error message to display */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  /** The form input element(s) */
  children: ReactNode;
  /** Additional CSS classes for the wrapper */
  className?: string;
  /** Optional helper text below the input */
  helperText?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  required = false,
  children,
  className,
  helperText,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary"
      >
        {label}
        {required && (
          <span className="text-red-500 ml-1" aria-label="obligatoire">
            *
          </span>
        )}
      </label>
      
      {children}
      
      {helperText && !error && (
        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
          {helperText}
        </p>
      )}
      
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
