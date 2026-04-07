import React, { useState, useEffect } from 'react';
import { Download, Save, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SettingsHeader } from './SettingsHeader';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { DenormalizationSyncService } from '@/services/denormalizationSyncService';
import { DownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } from '@/types/settings.types';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

export function GeneralSettings() {
  const { clubId, appUser } = useAuth();

  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Sync states
  const [isSyncingCodes, setIsSyncingCodes] = useState(false);
  const [isSyncingOperations, setIsSyncingOperations] = useState(false);
  const [syncCodeProgress, setSyncCodeProgress] = useState<{ current: number; total: number } | null>(null);
  const [syncOpProgress, setSyncOpProgress] = useState<{ current: number; total: number } | null>(null);

  // Charger les paramètres au montage
  useEffect(() => {
    async function loadSettings() {
      if (!clubId) return;
      try {
        const settings = await FirebaseSettingsService.loadDownloadSettings(clubId);
        setDownloadSettings(settings);
      } catch (error) {
        logger.error('Erreur lors du chargement des paramètres:', error);
        toast.error('Erreur lors du chargement des paramètres');
      } finally {
        setIsLoading(false);
      }
    }
    loadSettings();
  }, [clubId]);

  const saveSettings = async () => {
    if (!clubId || !appUser?.id) return;
    setIsSaving(true);
    try {
      await FirebaseSettingsService.saveDownloadSettings(clubId, downloadSettings, appUser!.id);
      toast.success('Paramètres sauvegardés');
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSyncCodeComptableLabels = async () => {
    if (!clubId) return;
    setIsSyncingCodes(true);
    setSyncCodeProgress(null);
    try {
      const result = await DenormalizationSyncService.syncAllCodeComptableLabels(
        clubId,
        (current, total) => setSyncCodeProgress({ current, total })
      );
      if (result.success) {
        toast.success(`${result.updatedCount} libellé(s) mis à jour sur ${result.totalProcessed} vérifiée(s)`);
      } else {
        toast.error(`Synchronisation partielle: ${result.errors.length} erreur(s)`);
      }
    } catch (error) {
      logger.error('Erreur sync codes comptables:', error);
      toast.error('Erreur lors de la synchronisation');
    } finally {
      setIsSyncingCodes(false);
      setSyncCodeProgress(null);
    }
  };

  const handleSyncOperationTitres = async () => {
    if (!clubId) return;
    setIsSyncingOperations(true);
    setSyncOpProgress(null);
    try {
      const result = await DenormalizationSyncService.syncAllOperationTitres(
        clubId,
        (current, total) => setSyncOpProgress({ current, total })
      );
      if (result.success) {
        toast.success(
          `${result.updatedCount} document(s) mis à jour sur ${result.totalProcessed} opération(s)`
        );
      } else {
        toast.error(`Synchronisation partielle: ${result.errors.length} erreur(s)`);
      }
    } catch (error) {
      logger.error('Erreur sync opérations:', error);
      toast.error('Erreur lors de la synchronisation');
    } finally {
      setIsSyncingOperations(false);
      setSyncOpProgress(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-5xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Paramètres Généraux']}
            title="Paramètres Généraux"
            description="Configuration générale"
          />
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Paramètres Généraux']}
          title="Paramètres Généraux"
          description="Configuration générale de l'application"
        />

        <div className="space-y-6">
          {/* Section Téléchargements des justificatifs */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Download className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Téléchargements des Justificatifs
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Configuration du renommage automatique des fichiers téléchargés
                </p>
              </div>
            </div>

            <div className="space-y-5">
              {/* Toggle renommage automatique */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                    Renommer automatiquement les fichiers
                  </p>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    Activer le renommage automatique avec le format personnalisable ci-dessous
                  </p>
                </div>
                <button
                  onClick={() => setDownloadSettings({ ...downloadSettings, autoRenameFiles: !downloadSettings.autoRenameFiles })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    downloadSettings.autoRenameFiles ? "bg-green-600" : "bg-gray-200 dark:bg-gray-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      downloadSettings.autoRenameFiles ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Format du nom de fichier */}
              {downloadSettings.autoRenameFiles && (
                <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Format du nom de fichier
                  </label>
                  <input
                    type="text"
                    value={downloadSettings.filenamePattern || ''}
                    onChange={(e) => setDownloadSettings({ ...downloadSettings, filenamePattern: e.target.value })}
                    placeholder="{ANNÉE}-{NUMÉRO} - {DATE} {DESCRIPTION}.{ext}"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text-primary rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Variables disponibles:{' '}
                      <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">{'{ANNÉE}'}</code>,{' '}
                      <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">{'{NUMÉRO}'}</code>,{' '}
                      <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">{'{DATE}'}</code>,{' '}
                      <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">{'{DESCRIPTION}'}</code>,{' '}
                      <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">{'{ext}'}</code>
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Exemple: <span className="font-mono bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-800 px-1 rounded">2025-00175 - 2025 10 22 Coltri liée à LEMAITRE GEOFFROY.pdf</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Toggle numéro de transaction */}
              {downloadSettings.autoRenameFiles && (
                <div className="flex items-center justify-between pl-4 border-l-2 border-blue-200 dark:border-blue-800">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                      Utiliser le numéro de transaction bancaire
                    </p>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      Si une transaction est liée, utiliser son numéro de séquence au lieu de l'ID de la demande
                    </p>
                  </div>
                  <button
                    onClick={() => setDownloadSettings({ ...downloadSettings, useTransactionNumber: !downloadSettings.useTransactionNumber })}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      downloadSettings.useTransactionNumber ? "bg-green-600" : "bg-gray-200 dark:bg-gray-700"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        downloadSettings.useTransactionNumber ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              )}

              {/* Bouton Sauvegarder */}
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={saveSettings}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          </div>
          {/* Section Synchronisation des données */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <RefreshCw className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                  Synchronisation des Données
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Mettre à jour les noms et libellés dans tous les documents liés
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Sync Code Comptable Labels */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                      Synchroniser les libellés des codes comptables
                    </p>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                      Mettre à jour les libellés dans les demandes de remboursement
                    </p>
                  </div>
                  <button
                    onClick={handleSyncCodeComptableLabels}
                    disabled={isSyncingCodes || isSyncingOperations}
                    className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                  >
                    <RefreshCw className={cn("h-4 w-4", isSyncingCodes && "animate-spin")} />
                    {isSyncingCodes ? 'Synchronisation...' : 'Synchroniser'}
                  </button>
                </div>

                {syncCodeProgress && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-dark-text-muted mb-1">
                      <span>{syncCodeProgress.current} / {syncCodeProgress.total}</span>
                      <span>{Math.round((syncCodeProgress.current / syncCodeProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(syncCodeProgress.current / syncCodeProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sync Operation Titres */}
              <div className="border border-gray-200 dark:border-dark-border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                      Synchroniser les noms des activités
                    </p>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                      Mettre à jour les noms dans les demandes, inscriptions, transactions et messages
                    </p>
                  </div>
                  <button
                    onClick={handleSyncOperationTitres}
                    disabled={isSyncingOperations || isSyncingCodes}
                    className="ml-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium whitespace-nowrap"
                  >
                    <RefreshCw className={cn("h-4 w-4", isSyncingOperations && "animate-spin")} />
                    {isSyncingOperations ? 'Synchronisation...' : 'Synchroniser'}
                  </button>
                </div>

                {syncOpProgress && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-dark-text-muted mb-1">
                      <span>{syncOpProgress.current} / {syncOpProgress.total} opérations</span>
                      <span>{Math.round((syncOpProgress.current / syncOpProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(syncOpProgress.current / syncOpProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                La synchronisation est aussi exécutée automatiquement lors de la modification d'un code comptable ou d'un nom d'activité.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
