import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { logger } from '@/utils/logger';

// ============================================
// ERROR FALLBACK COMPONENT
// ============================================
interface ErrorFallbackProps {
  error?: Error;
  onRetry: () => void;
}

function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = '/accueil';
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
          Une erreur est survenue
        </h2>

        {/* Description */}
        <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
          Une erreur inattendue s'est produite. Reessayez ou revenez au tableau de bord.
        </p>

        {/* Error details (collapsible in production) */}
        {error && import.meta.env.DEV && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-dark-text-tertiary hover:text-gray-700 dark:hover:text-dark-text-secondary">
              Details techniques
            </summary>
            <pre className="mt-2 p-3 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-xs text-red-600 dark:text-red-400 overflow-auto max-h-32">
              {error.message}
              {error.stack && '\n\n' + error.stack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-calypso-blue hover:bg-calypso-blue/90 text-white font-medium rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reessayer
          </button>
          <button
            onClick={handleGoHome}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary font-medium rounded-lg transition-colors"
          >
            <Home className="w-4 h-4" />
            Retour au tableau de bord
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// GLOBAL ERROR FALLBACK (Full page version)
// ============================================
interface GlobalErrorFallbackProps {
  error?: Error;
  onRetry: () => void;
}

export function GlobalErrorFallback({ error, onRetry }: GlobalErrorFallbackProps) {
  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-primary p-6">
      <div className="max-w-lg w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-8">
          <AlertTriangle className="w-10 h-10 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-3">
          Oups, une erreur est survenue
        </h1>

        {/* Description */}
        <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
          L'application a rencontre une erreur inattendue.
          Nous nous excusons pour la gene occasionnee. Veuillez recharger la page.
        </p>

        {/* Error details (dev only) */}
        {error && import.meta.env.DEV && (
          <details className="mb-8 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 dark:text-dark-text-tertiary hover:text-gray-700 dark:hover:text-dark-text-secondary">
              Details techniques (visibles uniquement en developpement)
            </summary>
            <pre className="mt-2 p-4 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg text-xs text-red-600 dark:text-red-400 overflow-auto max-h-40">
              {error.message}
              {error.stack && '\n\n' + error.stack}
            </pre>
          </details>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-calypso-blue hover:bg-calypso-blue/90 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            <RefreshCw className="w-5 h-5" />
            Recharger la page
          </button>
          <button
            onClick={handleGoHome}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white dark:bg-dark-bg-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary font-medium rounded-lg border border-gray-300 dark:border-dark-border transition-colors"
          >
            <Home className="w-5 h-5" />
            Aller a l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ERROR BOUNDARY CLASS COMPONENT
// ============================================
interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Use full-page fallback styling (for top-level boundaries) */
  global?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development
    logger.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // TODO: In production, you could send this to an error tracking service like Sentry
    // if (import.meta.env.PROD) {
    //   errorTrackingService.captureException(error, { extra: errorInfo });
    // }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Use global (full-page) or local fallback
      if (this.props.global) {
        return (
          <GlobalErrorFallback 
            error={this.state.error} 
            onRetry={this.handleRetry} 
          />
        );
      }

      return (
        <ErrorFallback 
          error={this.state.error} 
          onRetry={this.handleRetry} 
        />
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
