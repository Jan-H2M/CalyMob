import React, { useState, useEffect } from 'react';
import { RefreshCw, Plus, Send, Check, Info } from 'lucide-react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAppVersion } from '@/hooks/useVersionCheck';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

interface VersionInfo {
  version: string;
  buildNumber?: number;
  forceRefresh: boolean;
  message?: string;
  updatedAt?: any;
}

/**
 * Admin component to control app version and force user refreshes
 */
export function AppVersionControl() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentFirestoreVersion, setCurrentFirestoreVersion] = useState<VersionInfo | null>(null);
  const [newVersion, setNewVersion] = useState('');

  const localVersion = getAppVersion();

  // Load current version from Firestore
  useEffect(() => {
    const loadVersion = async () => {
      try {
        const versionDoc = await getDoc(doc(db, 'settings', 'app_version'));
        if (versionDoc.exists()) {
          const data = versionDoc.data() as VersionInfo;
          setCurrentFirestoreVersion(data);
          setNewVersion(data.version);
        } else {
          setNewVersion(localVersion);
        }
      } catch (error) {
        logger.error('Error loading version:', error);
        toast.error('Erreur lors du chargement de la version');
      } finally {
        setLoading(false);
      }
    };

    loadVersion();
  }, [localVersion]);

  // Increment patch version by 1
  const incrementVersion = (version: string): string => {
    const parts = version.split('.');
    if (parts.length !== 3) return '1.0.1';
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  };

  // Handle +1 button click - increment and update input
  const handleIncrement = () => {
    setNewVersion(incrementVersion(newVersion || localVersion));
  };

  // Save version without forcing refresh
  const handleSave = async () => {
    if (!newVersion.trim()) {
      toast.error('Veuillez entrer un numéro de version');
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'app_version'), {
        version: newVersion.trim(),
        forceRefresh: false,
        message: null,
        updatedAt: serverTimestamp(),
      });

      setCurrentFirestoreVersion({
        version: newVersion.trim(),
        forceRefresh: false,
      });

      toast.success('Version mise à jour');
    } catch (error) {
      logger.error('Error saving version:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  // Force all users to refresh
  const handleForceRefresh = async () => {
    const versionToUse = newVersion.trim() || incrementVersion(currentFirestoreVersion?.version || localVersion);

    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'app_version'), {
        version: versionToUse,
        forceRefresh: true,
        message: 'Une mise à jour est disponible.',
        updatedAt: serverTimestamp(),
      });

      setNewVersion(versionToUse);
      setCurrentFirestoreVersion({
        version: versionToUse,
        forceRefresh: true,
        message: 'Une mise à jour est disponible.',
      });

      toast.success('Force refresh déclenché pour tous les utilisateurs!');
    } catch (error) {
      logger.error('Error triggering refresh:', error);
      toast.error('Erreur lors du déclenchement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-dark-bg-tertiary rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
          <RefreshCw className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
            Contrôle de Version
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Forcer les utilisateurs à rafraîchir leur navigateur
          </p>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 text-sm">
          <div>
            <span className="text-gray-500 dark:text-dark-text-muted">Version locale:</span>
            <span className="ml-2 font-mono font-medium text-gray-900 dark:text-dark-text-primary">
              {localVersion}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 dark:text-dark-text-muted">Firestore:</span>
            <span className="font-mono font-medium text-gray-900 dark:text-dark-text-primary">
              {currentFirestoreVersion?.version || 'Non définie'}
              {currentFirestoreVersion?.buildNumber && (
                <span className="text-gray-400 dark:text-dark-text-muted ml-1">
                  ({currentFirestoreVersion.buildNumber})
                </span>
              )}
            </span>
            {currentFirestoreVersion?.forceRefresh && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                Force Refresh Actif
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Version Input with +1 Button */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
          Numéro de Version
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newVersion}
            onChange={(e) => setNewVersion(e.target.value)}
            placeholder="1.0.0"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary font-mono focus:ring-2 focus:ring-calypso-blue dark:focus:ring-calypso-aqua focus:border-transparent"
          />
          <button
            onClick={handleIncrement}
            disabled={saving}
            className="flex items-center gap-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 dark:hover:bg-dark-border text-gray-700 dark:text-dark-text-primary font-medium rounded-lg transition-colors border border-gray-300 dark:border-dark-border"
            title="Incrémenter la version de +1"
          >
            <Plus className="w-4 h-4" />
            <span>1</span>
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-calypso-blue dark:bg-calypso-aqua hover:bg-calypso-blue/90 dark:hover:bg-calypso-aqua/90 disabled:opacity-50 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
        <button
          onClick={handleForceRefresh}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
          {saving ? 'Envoi...' : 'Force Refresh'}
        </button>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <p>
              <strong>Sauvegarder</strong> met à jour la version sans forcer de refresh.
              <strong> Force Refresh</strong> oblige tous les utilisateurs à recharger immédiatement.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
