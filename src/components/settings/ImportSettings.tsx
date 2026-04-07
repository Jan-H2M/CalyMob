import { Upload, FileText, AlertCircle } from 'lucide-react';
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
        </div>
      </div>
    </div>
  );
}
