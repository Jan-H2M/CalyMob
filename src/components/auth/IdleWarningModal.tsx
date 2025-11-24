import React from 'react';
import { Clock, AlertTriangle, X } from 'lucide-react';

interface IdleWarningModalProps {
  /**
   * Temps restant avant déconnexion (en secondes)
   */
  remainingSeconds: number;

  /**
   * Callback appelé quand l'utilisateur clique "Rester connecté"
   */
  onStayConnected: () => void;

  /**
   * Si true, affiche le modal
   */
  isOpen: boolean;

  /**
   * Durée totale du timeout d'inactivité configurée (en minutes)
   * Optionnel - pour afficher le message personnalisé
   */
  timeoutMinutes?: number;
}

/**
 * Modal d'avertissement de déconnexion pour inactivité
 * Affiche un compte à rebours et permet à l'utilisateur de rester connecté
 */
export function IdleWarningModal({
  remainingSeconds,
  onStayConnected,
  isOpen,
  timeoutMinutes = 30
}: IdleWarningModalProps) {
  if (!isOpen) return null;

  // Formater le temps restant en MM:SS
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Calculer le pourcentage pour la barre de progression
  // Supposons 2 minutes = 120 secondes = 100%
  const totalSeconds = 120; // 2 minutes
  const percentage = Math.max(0, Math.min(100, (remainingSeconds / totalSeconds) * 100));

  return (
    <>
      {/* Overlay semi-transparent */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity"
        onClick={onStayConnected}
      />

      {/* Modal centré */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header avec icône */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                Session inactive
              </h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Vous serez déconnecté pour des raisons de sécurité
              </p>
            </div>
          </div>

          {/* Compte à rebours visuel */}
          <div className="space-y-3">
            {/* Temps restant */}
            <div className="flex items-center justify-center gap-2">
              <Clock className="w-5 h-5 text-gray-400 dark:text-dark-text-muted" />
              <div className="text-4xl font-bold text-gray-900 dark:text-dark-text-primary tabular-nums">
                {timeDisplay}
              </div>
            </div>

            {/* Barre de progression */}
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${
                  percentage > 50
                    ? 'bg-blue-500'
                    : percentage > 25
                    ? 'bg-orange-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Message d'explication */}
            <p className="text-center text-sm text-gray-600 dark:text-dark-text-secondary">
              Aucune activité détectée depuis un moment.<br />
              Cliquez sur le bouton ci-dessous pour rester connecté.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={onStayConnected}
              className="flex-1 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Rester connecté
            </button>
          </div>

          {/* Note de sécurité */}
          <div className="flex items-start gap-2 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <div className="flex-shrink-0 w-5 h-5 text-gray-400 dark:text-dark-text-muted mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-gray-600 dark:text-dark-text-secondary">
              Cette fonctionnalité protège vos données en vous déconnectant automatiquement après{' '}
              <strong>{timeoutMinutes} minute{timeoutMinutes > 1 ? 's' : ''}</strong> d'inactivité.
              Vous pouvez configurer ce délai dans les paramètres.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
