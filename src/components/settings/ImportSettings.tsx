import React, { useState } from 'react';
import { Upload, FileText, Calendar, Image, CheckCircle, AlertCircle } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { useNavigate } from 'react-router-dom';

export function ImportSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Import & Export']}
          title="Import & Export"
          description="Importer et exporter vos données financières"
        />

        <div className="space-y-6">
          {/* Section 1: Import Transactions Bancaires */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Transactions Bancaires
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importer les relevés bancaires CSV (BNP, KBC, ING, Belfius)
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Info Box */}
              <div className="p-4 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-cyan-800 dark:text-cyan-300">
                    <p className="font-medium mb-2">Formats supportés</p>
                    <ul className="list-disc list-inside space-y-1 text-cyan-700 dark:text-cyan-400">
                      <li>BNP Paribas Fortis (CSV, séparateur point-virgule)</li>
                      <li>KBC (CSV, en-têtes néerlandais)</li>
                      <li>ING (CSV, format standard)</li>
                      <li>Belfius (CSV, format standard)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Button navigant vers TransactionsPage */}
              <button
                onClick={() => navigate('/transactions')}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-lg font-medium shadow-md hover:shadow-lg"
              >
                <Upload className="h-6 w-6" />
                Importer des transactions bancaires
              </button>

              <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                💡 Les doublons sont détectés automatiquement. Les numéros de séquence incomplets sont mis à jour intelligemment.
              </p>
            </div>
          </div>

          {/* Section 2: Import Événements VP Dive */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Événements VP Dive
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importer les inscriptions depuis VP Dive (XLS)
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Info Box */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p className="font-medium mb-2">Données importées</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700 dark:text-blue-400">
                      <li>Informations de l'événement (nom, date, montant)</li>
                      <li>Participants avec licences LIFRAS/FEBRAS</li>
                      <li>Niveaux de plongée (P1, P2, P3, etc.)</li>
                      <li>Statuts de paiement et informations de contact</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Button navigant vers OperationsPage */}
              <button
                onClick={() => navigate('/operations')}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-medium shadow-md hover:shadow-lg"
              >
                <Upload className="h-6 w-6" />
                Importer des événements VP Dive
              </button>

              <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                💡 L'import génère automatiquement les statistiques et les détails des participants.
              </p>
            </div>
          </div>

          {/* Section 3: Import Justificatifs (Documents) */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <Image className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Justificatifs de Dépenses
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Réviser et compléter les documents PDF/images des demandes
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Info Box */}
              <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-800 dark:text-orange-300">
                    <p className="font-medium mb-2">Formats supportés</p>
                    <ul className="list-disc list-inside space-y-1 text-orange-700 dark:text-orange-400">
                      <li>PDF (factures, reçus, justificatifs)</li>
                      <li>Images (JPG, PNG, max 10MB par fichier)</li>
                      <li>Multi-upload supporté (plusieurs fichiers simultanément)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Button navigant vers DocumentReviewPage */}
              <button
                onClick={() => navigate('/document-review')}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-lg font-medium shadow-md hover:shadow-lg"
              >
                <Upload className="h-6 w-6" />
                Réviser les justificatifs
              </button>

              <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                💡 Ajoutez catégories et codes comptables directement depuis l'interface de révision.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
