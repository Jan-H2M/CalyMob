import React from 'react';
import { Settings, Download, Building2 } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';

export function GeneralSettings() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Paramètres Généraux']}
          title="Paramètres Généraux"
          description="Informations du club et préférences"
        />

        <div className="space-y-6">
          {/* Section 1: Club Settings */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-gray-100 dark:bg-gray-900/30 rounded-lg">
                <Building2 className="h-6 w-6 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Informations du Club
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Configuration générale du club
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-dark-text-secondary mb-4">
              ⚠️ Cette fonctionnalité est actuellement intégrée dans la page Paramètres principale.
              Naviguez vers <strong>Paramètres → Onglet "Général"</strong> pour modifier les informations du club.
            </p>

            <div className="bg-gray-50 dark:bg-gray-900/20 rounded-lg p-4 border border-gray-200 dark:border-gray-800">
              <p className="text-sm text-gray-800 dark:text-gray-300">
                <strong>Fonctionnalités disponibles :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-400 mt-2">
                <li>Nom du club</li>
                <li>Devise (EUR, USD, etc.)</li>
                <li>Fuseau horaire</li>
                <li>Format de date</li>
                <li>Double approbation (activer/désactiver + seuil)</li>
              </ul>
            </div>
          </div>

          {/* Section 2: Download Settings */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Download className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Téléchargements des Justificatifs
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Configuration du renommage automatique des fichiers
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-dark-text-secondary mb-4">
              ⚠️ Cette fonctionnalité est actuellement intégrée dans la page Paramètres principale.
              Naviguez vers <strong>Paramètres → Onglet "Général"</strong> pour configurer le renommage des fichiers.
            </p>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Fonctionnalités disponibles :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-400 mt-2">
                <li>Activer/désactiver le renommage automatique</li>
                <li>Format personnalisable avec variables ({'{ANNÉE}'}, {'{NUMÉRO}'}, {'{DATE}'}, {'{DESCRIPTION}'})</li>
                <li>Option pour utiliser le numéro de transaction bancaire</li>
                <li>Aperçu du format avec exemple</li>
              </ul>
            </div>
          </div>

          {/* Section 3: Application Preferences */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Settings className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Préférences de l'Application
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Options d'affichage et de comportement
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-dark-text-secondary mb-4">
              ⚠️ Certaines préférences utilisateur peuvent être ajoutées ici dans les futures versions (thème, langue, notifications, etc.)
            </p>

            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <p className="text-sm text-purple-800 dark:text-purple-300">
                <strong>Fonctionnalités à venir :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-purple-700 dark:text-purple-400 mt-2">
                <li>Mode sombre/clair (dark mode toggle)</li>
                <li>Préférence de langue (FR/NL/EN)</li>
                <li>Notifications email</li>
                <li>Affichage de la page d'accueil par défaut</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
