import { MessageSquare, AlertTriangle } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { Link } from 'react-router-dom';

export default function WhatsAppSettings() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-4xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Communication', 'WhatsApp']}
          title="WhatsApp Configuration"
          description="Configurez l'envoi de messages WhatsApp via Twilio"
        />

        <div className="space-y-6">
          {/* Header Card */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded-lg">
                <MessageSquare className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold text-gray-500 dark:text-dark-text-muted">
                    WhatsApp via Twilio
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-dark-text-secondary dark:text-gray-300 rounded">
                    Non disponible
                  </span>
                </div>
                <p className="text-sm text-gray-400 dark:text-dark-text-muted">
                  Envoyez des messages WhatsApp en plus des SMS
                </p>
              </div>
            </div>
          </div>

          {/* Unavailable Notice */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-medium text-amber-800 dark:text-amber-200 mb-2">
                  Fonctionnalité temporairement indisponible
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-300 mb-4">
                  La configuration WhatsApp via Twilio n'est pas disponible pour le moment.
                  La configuration requise n'a pas pu être mise en place.
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  En attendant, vous pouvez utiliser les autres canaux de communication :
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    to="/parametres/communication/sms"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    📱 Configuration SMS
                  </Link>
                  <Link
                    to="/parametres/communication/envoyer"
                    className="inline-flex items-center px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm font-medium"
                  >
                    ✉️ Envoyer un Email
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Back link */}
          <div className="text-center">
            <Link
              to="/parametres/communication"
              className="text-sm text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-gray-200 hover:underline"
            >
              ← Retour au hub Communication
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
