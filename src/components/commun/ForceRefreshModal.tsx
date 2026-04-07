import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface ForceRefreshModalProps {
  isOpen: boolean;
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
  onRefresh: () => void;
}

/**
 * Modal that forces users to refresh when a new version is available
 * Cannot be dismissed - user must click refresh
 */
export function ForceRefreshModal({
  isOpen,
  currentVersion,
  latestVersion,
  message,
  onRefresh,
}: ForceRefreshModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop - no onClick to prevent dismissal */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-calypso-blue/10 dark:bg-calypso-aqua/10 rounded-full flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-calypso-blue dark:text-calypso-aqua" />
          </div>
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center text-gray-900 dark:text-dark-text-primary mb-2">
          Mise à jour disponible
        </h2>

        {/* Message */}
        <p className="text-center text-gray-600 dark:text-dark-text-secondary mb-4">
          {message || 'Une nouvelle version de l\'application est disponible. Veuillez rafraîchir pour continuer.'}
        </p>

        {/* Version info */}
        <div className="bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg p-3 mb-6">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-dark-text-muted">Version actuelle:</span>
            <span className="font-mono text-gray-700 dark:text-dark-text-primary">{currentVersion}</span>
          </div>
          {latestVersion && (
            <div className="flex justify-between text-sm mt-1">
              <span className="text-gray-500 dark:text-dark-text-muted">Nouvelle version:</span>
              <span className="font-mono text-calypso-blue dark:text-calypso-aqua font-medium">{latestVersion}</span>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 mb-6">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>
            Cette action va recharger la page. Assurez-vous d'avoir sauvegardé votre travail en cours.
          </span>
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefresh}
          className="w-full flex items-center justify-center gap-2 bg-calypso-blue dark:bg-calypso-aqua hover:bg-calypso-blue/90 dark:hover:bg-calypso-aqua/90 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5" />
          Rafraîchir maintenant
        </button>
      </div>
    </div>
  );
}
