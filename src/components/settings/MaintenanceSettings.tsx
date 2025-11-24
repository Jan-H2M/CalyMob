import React from 'react';
import { Database, AlertTriangle } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';

export function MaintenanceSettings() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Maintenance']}
          title="Maintenance"
          description="Nettoyage et maintenance de la base de données"
        />

        <div className="space-y-6">
          {/* Section 1: Database Maintenance */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Database className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Nettoyage de Base de Données
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Outils de maintenance avancés
                </p>
              </div>
            </div>

            <p className="text-sm text-gray-700 dark:text-dark-text-secondary mb-4">
              ⚠️ Cette fonctionnalité est actuellement intégrée dans la page Paramètres principale.
              Naviguez vers <strong>Paramètres → Onglet "Données"</strong> pour accéder aux outils de maintenance.
            </p>

            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
              <p className="text-sm text-orange-800 dark:text-orange-300">
                <strong>Outils disponibles :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-orange-700 dark:text-orange-400 mt-2">
                <li>Nettoyage des transactions dupliquées</li>
                <li>Correction des transactions multi-liées</li>
                <li>Import batch de fichiers CSV</li>
                <li>Suppression complète des données (DANGER ZONE)</li>
              </ul>
            </div>
          </div>

          {/* Section 2: Danger Zone */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-red-300 dark:border-red-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-red-900 dark:text-red-400">
                  Zone Dangereuse
                </h2>
                <p className="text-sm text-red-700 dark:text-red-500 mt-1">
                  ⚠️ Opérations irréversibles - Utiliser avec extrême prudence
                </p>
              </div>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-300 mb-3">
                <strong>Actions destructives :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700 dark:text-red-400 mb-4">
                <li>Suppression de toutes les transactions bancaires</li>
                <li>Suppression de tous les événements et inscriptions</li>
                <li>Suppression de toutes les demandes de remboursement</li>
              </ul>
              <p className="text-xs text-red-600 dark:text-red-500 font-medium">
                💀 Ces opérations nécessitent une double confirmation (dialogue + saisie du mot "SUPPRIMER")
              </p>
            </div>

            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-300">
                  <p className="font-medium mb-1">Recommandation</p>
                  <p>
                    Avant toute opération de maintenance majeure, assurez-vous d'avoir une sauvegarde récente de vos données.
                    Les suppressions sont définitives et ne peuvent pas être annulées.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Statistics & Health */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Santé de la Base de Données
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Statistiques et état de santé
                </p>
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <strong>Informations disponibles :</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm text-blue-700 dark:text-blue-400 mt-2">
                <li>Nombre total de transactions bancaires</li>
                <li>Nombre d'événements et inscriptions</li>
                <li>Nombre de demandes de remboursement</li>
                <li>Taille estimée de la base de données</li>
                <li>Dernière date de sauvegarde (si configurée)</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
