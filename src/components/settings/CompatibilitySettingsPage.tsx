import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Smartphone, Globe, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { CompatibilitySettings } from '@/types/settings.types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { logger } from '@/utils/logger';

export function CompatibilitySettingsPage() {
  const navigate = useNavigate();
  const { clubId, appUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompatibilitySettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, [clubId]);

  async function loadSettings() {
    if (!clubId) return;

    try {
      setLoading(true);
      const data = await FirebaseSettingsService.getCompatibilitySettings(clubId);

      if (data) {
        setSettings(data);
      } else {
        // Initialize with defaults
        setSettings({
          calymob: {
            ios: {
              minSupported: '14.0',
              minRecommended: '16.0',
              currentTested: '17.5',
            },
            android: {
              minSupported: 24,
              minRecommended: 30,
              currentTested: 34,
            },
          },
          calycompta: {
            browsers: {
              Chrome: { minSupported: 90, minRecommended: 110, status: 'supported' },
              Safari: { minSupported: 14, minRecommended: 16, status: 'supported' },
              Firefox: { minSupported: 90, minRecommended: 110, status: 'supported' },
              Edge: { minSupported: 90, minRecommended: 110, status: 'supported' },
              Opera: { minSupported: null, minRecommended: null, status: 'untested' },
            },
          },
          messages: {
            unsupported: 'Votre navigateur ou appareil n\'est pas pris en charge. Veuillez utiliser une version plus récente ou un autre navigateur (Chrome, Safari, Firefox, Edge).',
            warning: 'Une version plus récente est disponible. Mettez à jour votre application ou navigateur pour bénéficier de la meilleure expérience et des dernières fonctionnalités.',
            browserUntested: 'Ce navigateur n\'a pas été officiellement testé. Certaines fonctionnalités peuvent ne pas fonctionner correctement. Nous recommandons Chrome, Safari, Firefox ou Edge.',
          },
        });
      }
    } catch (error) {
      logger.error('Error loading compatibility settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!clubId || !settings) return;

    // Get userId from appUser or fallback to 'admin'
    const userId = appUser?.uid || 'admin';

    try {
      setSaving(true);
      await FirebaseSettingsService.saveCompatibilitySettings(clubId, settings, userId);
      toast.success('Paramètres de compatibilité enregistrés');
    } catch (error) {
      logger.error('Error saving compatibility settings:', error);
      toast.error('Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-5xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Système', 'Compatibilité']}
            title="Compatibilité Apps/Browsers"
            description="Configuration des versions minimum supportées"
          />
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-500 dark:text-dark-text-muted">Chargement...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Système', 'Compatibilité']}
          title="Compatibilité Apps/Browsers"
          description="Configuration des versions minimum supportées pour CalyMob et CalyCompta"
        />

        {/* CalyMob Mobile App Settings */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Smartphone className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">CalyMob (Mobile)</h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">iOS et Android versions</p>
            </div>
          </div>

          {/* iOS Settings */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">iOS</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="compat-ios-minSupported-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Min Supported
                </label>
                <input
                  id="compat-ios-minSupported-input"
                  type="text"
                  value={settings.calymob.ios.minSupported}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        ios: { ...settings.calymob.ios, minSupported: e.target.value },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="14.0"
                />
              </div>
              <div>
                <label htmlFor="compat-ios-minRecommended-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Min Recommended
                </label>
                <input
                  id="compat-ios-minRecommended-input"
                  type="text"
                  value={settings.calymob.ios.minRecommended}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        ios: { ...settings.calymob.ios, minRecommended: e.target.value },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="16.0"
                />
              </div>
              <div>
                <label htmlFor="compat-ios-currentTested-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Current Tested
                </label>
                <input
                  id="compat-ios-currentTested-input"
                  type="text"
                  value={settings.calymob.ios.currentTested}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        ios: { ...settings.calymob.ios, currentTested: e.target.value },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="17.5"
                />
              </div>
            </div>
          </div>

          {/* Android Settings */}
          <div className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">Android (API Level)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label htmlFor="compat-android-minSupported-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Min Supported
                </label>
                <input
                  id="compat-android-minSupported-input"
                  type="number"
                  value={settings.calymob.android.minSupported}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        android: { ...settings.calymob.android, minSupported: parseInt(e.target.value) || 24 },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="24"
                />
              </div>
              <div>
                <label htmlFor="compat-android-minRecommended-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Min Recommended
                </label>
                <input
                  id="compat-android-minRecommended-input"
                  type="number"
                  value={settings.calymob.android.minRecommended}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        android: { ...settings.calymob.android, minRecommended: parseInt(e.target.value) || 30 },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="30"
                />
              </div>
              <div>
                <label htmlFor="compat-android-currentTested-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                  Current Tested
                </label>
                <input
                  id="compat-android-currentTested-input"
                  type="number"
                  value={settings.calymob.android.currentTested}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      calymob: {
                        ...settings.calymob,
                        android: { ...settings.calymob.android, currentTested: parseInt(e.target.value) || 34 },
                      },
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white"
                  placeholder="34"
                />
              </div>
            </div>
          </div>
        </div>

        {/* CalyCompta Web App Settings */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <Globe className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">CalyCompta (Web)</h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">Browser compatibility</p>
            </div>
          </div>

          {/* Browser Settings */}
          <div className="space-y-3">
            {Object.entries(settings.calycompta.browsers).map(([browserName, config]) => (
              <div
                key={browserName}
                className="p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg grid grid-cols-4 gap-4 items-center"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-dark-text-primary dark:text-white">{browserName}</div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Min Supported</label>
                  <input
                    type="number"
                    value={config.minSupported || ''}
                    onChange={(e) => {
                      const newBrowsers = { ...settings.calycompta.browsers };
                      newBrowsers[browserName] = {
                        ...config,
                        minSupported: e.target.value ? parseInt(e.target.value) : null,
                      };
                      setSettings({
                        ...settings,
                        calycompta: { ...settings.calycompta, browsers: newBrowsers },
                      });
                    }}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white text-sm"
                    placeholder="90"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Min Recommended</label>
                  <input
                    type="number"
                    value={config.minRecommended || ''}
                    onChange={(e) => {
                      const newBrowsers = { ...settings.calycompta.browsers };
                      newBrowsers[browserName] = {
                        ...config,
                        minRecommended: e.target.value ? parseInt(e.target.value) : null,
                      };
                      setSettings({
                        ...settings,
                        calycompta: { ...settings.calycompta, browsers: newBrowsers },
                      });
                    }}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white text-sm"
                    placeholder="110"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">Status</label>
                  <select
                    value={config.status}
                    onChange={(e) => {
                      const newBrowsers = { ...settings.calycompta.browsers };
                      newBrowsers[browserName] = {
                        ...config,
                        status: e.target.value as 'supported' | 'untested' | 'unsupported',
                      };
                      setSettings({
                        ...settings,
                        calycompta: { ...settings.calycompta, browsers: newBrowsers },
                      });
                    }}
                    className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-secondary text-gray-900 dark:text-dark-text-primary dark:text-white text-sm"
                  >
                    <option value="supported">Supported</option>
                    <option value="untested">Untested</option>
                    <option value="unsupported">Unsupported</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">Messages d'Avertissement</h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-muted">Textes affichés aux utilisateurs</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="compat-msg-unsupported-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                Unsupported (Erreur)
              </label>
              <textarea
                id="compat-msg-unsupported-input"
                value={settings.messages.unsupported}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    messages: { ...settings.messages, unsupported: e.target.value },
                  })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="compat-msg-warning-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                Warning (Avertissement)
              </label>
              <textarea
                id="compat-msg-warning-input"
                value={settings.messages.warning}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    messages: { ...settings.messages, warning: e.target.value },
                  })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="compat-msg-browserUntested-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
                Browser Untested (Info)
              </label>
              <textarea
                id="compat-msg-browserUntested-input"
                value={settings.messages.browserUntested}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    messages: { ...settings.messages, browserUntested: e.target.value },
                  })
                }
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary dark:text-white"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-3">
          <button
            onClick={() => navigate('/parametres/systeme')}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              'px-6 py-2 bg-calypso-blue hover:bg-calypso-blue/90 text-white rounded-lg transition-colors flex items-center gap-2',
              saving && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Save className="h-4 w-4" />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900 dark:text-blue-200">
              <p className="font-medium mb-1">Configuration dynamique</p>
              <p>
                Ces paramètres sont chargés depuis Firebase et peuvent être mis à jour sans déploiement.
                Les utilisateurs verront les avertissements lors de leur prochaine connexion.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
