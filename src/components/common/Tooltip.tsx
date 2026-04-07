import React, { useState } from 'react';
import { Info } from 'lucide-react';

interface TooltipProps {
  /** Text to display (for icon-based tooltip) */
  text?: string;
  /** Content to display (for wrapper tooltip with children) - can be string or JSX */
  content?: React.ReactNode;
  /** Children to wrap (makes the tooltip wrap children instead of showing an icon) */
  children?: React.ReactNode;
  className?: string;
  position?: 'top' | 'right' | 'bottom' | 'left';
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  content,
  children,
  className = "",
  position = 'top'
}) => {
  const [isVisible, setIsVisible] = useState(false);

  // Use content prop if provided, otherwise fall back to text
  const tooltipContent = content || text;

  const getPositionClasses = () => {
    switch (position) {
      case 'right':
        return 'left-full ml-2 top-1/2 -translate-y-1/2';
      case 'bottom':
        return 'top-full mt-2 left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-full mr-2 top-1/2 -translate-y-1/2';
      case 'top':
      default:
        return 'bottom-full mb-2 left-1/2 -translate-x-1/2';
    }
  };

  const getArrowClasses = () => {
    switch (position) {
      case 'right':
        return 'absolute top-1/2 -left-1 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-gray-800 dark:border-r-gray-900';
      case 'bottom':
        return 'absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-gray-800 dark:border-b-gray-900';
      case 'left':
        return 'absolute top-1/2 -right-1 -translate-y-1/2 w-0 h-0 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-gray-800 dark:border-l-gray-900';
      case 'top':
      default:
        return 'absolute -bottom-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-800 dark:border-t-gray-900';
    }
  };

  // If children are provided, wrap them with tooltip behavior
  if (children) {
    return (
      <div
        className={`relative inline-flex items-center ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
        {isVisible && tooltipContent && (
          <div className={`absolute z-[10000] ${getPositionClasses()} px-3 py-2 text-xs text-white bg-gray-800 dark:bg-gray-900 rounded-lg shadow-lg whitespace-normal min-w-[120px] max-w-xs pointer-events-none`}>
            {tooltipContent}
            <div className={getArrowClasses()}></div>
          </div>
        )}
      </div>
    );
  }

  // Original behavior: show Info icon with tooltip
  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <button
        type="button"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onClick={(e) => {
          e.preventDefault();
          setIsVisible(!isVisible);
        }}
        className="ml-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted dark:hover:text-gray-300"
        aria-label="Information"
      >
        <Info className="w-3.5 h-3.5" />
      </button>

      {isVisible && tooltipContent && (
        <div className={`absolute z-[10000] ${getPositionClasses()} px-3 py-2 text-xs text-white bg-gray-800 dark:bg-gray-900 rounded-lg shadow-lg whitespace-normal min-w-[200px] max-w-xs`}>
          {tooltipContent}
          <div className={getArrowClasses()}></div>
        </div>
      )}
    </div>
  );
};

export default Tooltip;
