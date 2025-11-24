import React, { useState, useEffect } from 'react';
import {
  Shield,
  Save,
  X,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Info,
  Download,
  Upload,
  Loader2
} from 'lucide-react';
import { UserRole, Permission, RoleConfig } from '@/types/user.types';
import { PermissionSettingsService, PermissionSettings } from '@/services/permissionSettingsService';
import { PermissionService } from '@/services/permissionService';
import { PermissionMatrix } from './PermissionMatrix';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function PermissionsManagement() {
  const { clubId, appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [originalSettings, setOriginalSettings] = useState<PermissionSettings | null>(null);
  const [currentSettings, setCurrentSettings] = useState<PermissionSettings | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'standard' | 'strict' | 'collaboratif' | 'ouvert'>('standard');

  // Charger les paramètres au montage
  useEffect(() => {
    loadSettings();
  }, [clubId]);

  // Détecter les changements
  useEffect(() => {
    if (originalSettings && currentSettings) {
      const changed = JSON.stringify(originalSettings) !== JSON.stringify(currentSettings);
      setHasChanges(changed);
    }
  }, [originalSettings, currentSettings]);

  const loadSettings = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const settings = await PermissionSettingsService.loadPermissionSettings(clubId);
      setOriginalSettings(settings);
      setCurrentSettings(settings);
    } catch (error) {
      console.error('Erreur lors du chargement des permissions:', error);
      toast.error('Erreur lors du chargement des permissions');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (role: UserRole, permission: Permission) => {
    if (!currentSettings) return;

    setCurrentSettings(prev => {
      if (!prev) return prev;

      const roleConfig = { ...prev.roles[role] };
      const permissions = [...roleConfig.permissions];
      const index = permissions.indexOf(permission);

      if (index > -1) {
        // Retirer la permission
        permissions.splice(index, 1);
      } else {
        // Ajouter la permission
        permissions.push(permission);
      }

      roleConfig.permissions = permissions;

      return {
        ...prev,
        roles: {
          ...prev.roles,
          [role]: roleConfig
        }
      };
    });
  };

  const handleSave = async () => {
    if (!currentSettings || !clubId || !appUser) return;

    try {
      // Valider avant de sauvegarder
      PermissionSettingsService.validatePermissions(currentSettings);

      setSaving(true);
      await PermissionSettingsService.savePermissionSettings(clubId, currentSettings, appUser.id);

      // Recharger les permissions dans le PermissionService
      await PermissionService.reload(clubId);

      setOriginalSettings(currentSettings);
      setHasChanges(false);
      setShowConfirmDialog(false);

      toast.success('Permissions sauvegardées avec succès !');
    } catch (error: any) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error(`Erreur : ${error.message || 'Impossible de sauvegarder'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (originalSettings) {
      setCurrentSettings(originalSettings);
      setHasChanges(false);
      toast.success('Modifications annulées');
    }
  };

  const handleReset = async () => {
    if (!clubId || !appUser) return;

    try {
      setSaving(true);
      await PermissionSettingsService.resetToDefaults(clubId, appUser.id);

      // Recharger
      await loadSettings();
      await PermissionService.reload(clubId);

      setShowResetDialog(false);
      toast.success('Permissions réinitialisées aux valeurs par défaut');
    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
      toast.error('Erreur lors de la réinitialisation');
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPreset = (preset: 'standard' | 'strict' | 'collaboratif' | 'ouvert') => {
    const presetSettings = PermissionSettingsService.getPreset(preset);
    setCurrentSettings(presetSettings);
    setSelectedPreset(preset);
    toast.success(`Configuration "${preset}" chargée`);
  };

  const getChangeSummary = () => {
    if (!originalSettings || !currentSettings) return [];

    return PermissionSettingsService.comparePermissions(originalSettings, currentSettings);
  };

  const exportSettings = () => {
    if (!currentSettings) return;

    const dataStr = JSON.stringify(currentSettings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `permissions-${clubId}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success('Configuration exportée');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!currentSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 dark:text-dark-text-muted">Impossible de charger les permissions</p>
      </div>
    );
  }

  const changeSummary = getChangeSummary();

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Gestion des Permissions
          </h2>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
            Configurez les permissions pour chaque rôle utilisateur
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportSettings}
            className="px-3 py-2 text-sm bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exporter
          </button>

          <button
            onClick={() => setShowResetDialog(true)}
            className="px-3 py-2 text-sm bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Réinitialiser
          </button>
        </div>
      </div>

      {/* Info: User Isolation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 dark:text-blue-300">
          <p className="font-medium">🔒 Isolation des utilisateurs (rôle "Utilisateur")</p>
          <p className="mt-1">
            Le rôle <strong>Utilisateur</strong> est automatiquement isolé par les règles de sécurité Firestore :
          </p>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            <li><strong>Transactions</strong> : Accès complètement bloqué (🔒 rouge)</li>
            <li><strong>Demandes</strong> : Filtrées automatiquement par demandeur (🔍 orange)</li>
            <li><strong>Activités</strong> : Filtrées automatiquement par organisateur, uniquement type "événement" (🔍 orange)</li>
          </ul>
          <p className="mt-2 text-xs opacity-75">
            Ces restrictions sont appliquées au niveau de la base de données et ne peuvent pas être modifiées via l'interface.
          </p>
        </div>
      </div>

      {/* Avertissement */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-orange-800 dark:text-orange-300">
          <p className="font-medium">Attention !</p>
          <p className="mt-1">
            Modifier les permissions affectera immédiatement le comportement de l'application pour tous les utilisateurs.
            Certaines permissions sont verrouillées pour garantir le bon fonctionnement du système.
          </p>
        </div>
      </div>

      {/* Presets removed - user isolation is now enforced via Firestore rules and query filters */}

      {/* Aperçu des changements */}
      {hasChanges && changeSummary.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">
                Aperçu des changements ({changeSummary.length} rôle(s) modifié(s))
              </h3>
              <div className="space-y-2">
                {changeSummary.map(({ role, changes }) => (
                  <div key={role} className="text-sm text-blue-800">
                    <span className="font-medium">{currentSettings.roles[role].label} :</span>
                    <ul className="ml-4 mt-1 space-y-1">
                      {changes.map(({ permission, action }) => (
                        <li key={permission} className="flex items-center gap-2">
                          {action === 'added' ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-green-600" />
                              <span>+ {permission}</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3 text-red-600" />
                              <span>- {permission}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tableau des permissions */}
      <PermissionMatrix
        roles={currentSettings.roles}
        onPermissionToggle={handlePermissionToggle}
      />

      {/* Actions */}
      {hasChanges && (
        <div className="flex items-center justify-end gap-3 p-4 bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 text-sm bg-white dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text-primary border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
          >
            <X className="w-4 h-4" />
            Annuler
          </button>
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sauvegarde...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Sauvegarder les modifications
              </>
            )}
          </button>
        </div>
      )}

      {/* Dialogue de confirmation */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-2">Confirmer les modifications</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Êtes-vous sûr de vouloir sauvegarder ces modifications ? Les permissions seront appliquées
              immédiatement pour tous les utilisateurs.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Sauvegarde...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogue de réinitialisation */}
      {showResetDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary mb-2">Réinitialiser aux valeurs par défaut ?</h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
              Cette action restaurera la configuration par défaut et effacera toutes vos personnalisations.
              Cette opération est irréversible.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowResetDialog(false)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Réinitialisation...' : 'Réinitialiser'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
