import React, { useState, useEffect } from 'react';
import { Shield, Clock, Save, Info } from 'lucide-react';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { SecuritySettings as SecuritySettingsType, IDLE_TIMEOUT_OPTIONS } from '@/types/settings.types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

export function SecuritySettings() {
  const { clubId, appUser } = useAuth();
  const [settings, setSettings] = useState<SecuritySettingsType>({
    autoLogoutEnabled: true,
    idleTimeoutMinutes: 30,
    warningBeforeMinutes: 2
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [clubId]);

  const loadSettings = async () => {
    try {
      const loaded = await FirebaseSettingsService.loadSecuritySettings(clubId);
      setSettings(loaded);
    } catch (error) {
      console.error('Error loading security settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await FirebaseSettingsService.saveSecuritySettings(clubId, settings, appUser?.id);
      toast.success('Paramètres de sécurité sauvegardés');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Sécurité de la session
        </h2>
        <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
          Configurez la déconnexion automatique après inactivité
        </p>
      </div>

      {/* Auto-logout toggle */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
              Déconnexion automatique
            </h3>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              Déconnecter automatiquement les utilisateurs après une période d'inactivité
            </p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, autoLogoutEnabled: !settings.autoLogoutEnabled })}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              settings.autoLogoutEnabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings.autoLogoutEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Timeout duration */}
      {settings.autoLogoutEnabled && (
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-start gap-3 mb-4">
            <Clock className="w-5 h-5 text-gray-400 dark:text-dark-text-muted mt-0.5" />
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                Durée d'inactivité
              </h3>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                Temps avant déconnexion automatique
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {IDLE_TIMEOUT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSettings({ ...settings, idleTimeoutMinutes: option.value })}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  settings.idleTimeoutMinutes === option.value
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="font-medium text-gray-900 dark:text-dark-text-primary">{option.label}</div>
                <div className="text-xs text-gray-600 dark:text-dark-text-secondary mt-1">{option.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium mb-1">Comment ça fonctionne?</p>
          <ul className="space-y-1 text-blue-800">
            <li>• Un avertissement s'affiche 2 minutes avant la déconnexion</li>
            <li>• Tout mouvement de souris ou frappe clavier réinitialise le timer</li>
            <li>• Vous pouvez cliquer "Rester connecté" pour annuler</li>
            <li>• Cette fonctionnalité protège vos données si vous oubliez de vous déconnecter</li>
          </ul>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              Sauvegarde...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Sauvegarder
            </>
          )}
        </button>
      </div>
    </div>
  );
}
