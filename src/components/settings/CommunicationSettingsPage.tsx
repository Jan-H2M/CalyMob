import React from 'react';
import { useNavigate } from 'react-router-dom';
import CommunicationSettings from './CommunicationSettings';
import { Mail, ChevronLeft } from 'lucide-react';

/**
 * Standalone Communication Settings Page
 * Accessible via /parametres/communication/automatisee
 *
 * Note: No Layout wrapper needed - parent route already provides it
 */
export function CommunicationSettingsPage() {
  const navigate = useNavigate();

  return (
    <div className="p-6">
      <div className="mb-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
          <button
            onClick={() => navigate('/parametres')}
            className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
          >
            Paramètres
          </button>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <button
            onClick={() => navigate('/parametres/communication')}
            className="hover:text-calypso-blue dark:hover:text-calypso-aqua transition-colors"
          >
            Communication
          </button>
          <ChevronLeft className="h-4 w-4 rotate-180" />
          <span className="text-gray-900 dark:text-dark-text-primary font-medium">
            Communications Automatisées
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            ⚙️ Communication automatisée
          </h1>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Configurez des jobs planifiés pour envoyer des emails automatiques aux membres.
          </p>
        </div>
      </div>
      <CommunicationSettings />
    </div>
  );
}
