/**
 * Button Component
 * 
 * Reusable button with multiple variants and sizes.
 * Supports loading state, icons, and full dark mode.
 */

import { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/utils';
import { LoadingSpinner } from './LoadingSpinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style variant */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Show loading spinner and disable button */
  isLoading?: boolean;
  /** Icon to display before text */
  leftIcon?: ReactNode;
  /** Icon to display after text */
  rightIcon?: ReactNode;
}

const variantClasses = {
  primary: 
    'bg-calypso-blue hover:bg-calypso-blue-dark text-white ' +
    'dark:bg-calypso-aqua dark:hover:bg-calypso-aqua-dark dark:text-dark-bg-primary ' +
    'focus:ring-calypso-blue/30 dark:focus:ring-calypso-aqua/30',
  secondary:
    'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 ' +
    'dark:bg-dark-bg-secondary dark:hover:bg-dark-bg-tertiary dark:text-dark-text-primary dark:border-dark-border ' +
    'focus:ring-gray-300/30 dark:focus:ring-dark-border/30',
  danger:
    'bg-red-600 hover:bg-red-700 text-white ' +
    'dark:bg-red-700 dark:hover:bg-red-800 ' +
    'focus:ring-red-600/30',
  ghost:
    'bg-transparent hover:bg-gray-100 text-gray-700 ' +
    'dark:hover:bg-dark-bg-tertiary dark:text-dark-text-primary ' +
    'focus:ring-gray-300/30 dark:focus:ring-dark-border/30',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

const spinnerSizes: Record<'sm' | 'md' | 'lg', 'sm' | 'md' | 'lg'> = {
  sm: 'sm',
  md: 'sm',
  lg: 'md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className,
      children,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-dark-bg-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <LoadingSpinner size={spinnerSizes[size]} className="text-current" />
        ) : leftIcon ? (
          <span className="shrink-0">{leftIcon}</span>
        ) : null}
        
        {children && <span>{children}</span>}
        
        {!isLoading && rightIcon && (
          <span className="shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
