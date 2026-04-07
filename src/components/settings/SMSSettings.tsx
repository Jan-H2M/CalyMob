import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { toast } from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Settings, Clock, History, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import {
  createNewSMSJob,
  duplicateSMSJob,
  validateSMSJob,
  getMessageTypeName,
  getDefaultJobDescription,
  getDefaultTemplate,
  generateCronExpression,
} from '@/services/smsService';
import {
  calculateSMSSegments,
  normalizePhoneNumber,
  DEFAULT_SMS_SETTINGS,
  type SMSSettings as SMSSettingsType,
  type SMSJob,
  type SMSMessageType,
  type SMSHistory,
} from '@/types/sms';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn } from '@/utils/utils';

type SMSTab = 'configuration' | 'automation' | 'history';

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const getDayShortName = (day: DayOfWeek): string => {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[day];
};

export default function SMSSettings() {
  const { clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<SMSTab>('configuration');
  const [settings, setSettings] = useState<SMSSettingsType>(DEFAULT_SMS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<SMSHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<SMSJob | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null);

  // Load settings, history on mount
  useEffect(() => {
    if (clubId) {
      loadSettings();
      loadHistory();
      loadQuota();
    }
  }, [clubId]);

  const loadSettings = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const loadedSettings = await FirebaseSettingsService.loadSMSSettings(clubId);
      setSettings(loadedSettings || DEFAULT_SMS_SETTINGS);
    } catch (error) {
      logger.error('Error loading SMS settings:', error);
      toast.error('Erreur lors du chargement des paramètres SMS');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!clubId) return;

    try {
      setLoadingHistory(true);
      const allHistory = await FirebaseSettingsService.loadSMSHistory(clubId, 50);
      // Filter to only show SMS, not WhatsApp (WhatsApp has its own page)
      const smsOnlyHistory = allHistory.filter(h => h.channel !== 'whatsapp');
      setHistory(smsOnlyHistory.slice(0, 20));
    } catch (error) {
      logger.error('Error loading SMS history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadQuota = async () => {
    if (!clubId) return;

    try {
      const quotaData = await FirebaseSettingsService.checkSMSQuota(clubId);
      setQuota(quotaData);
    } catch (error) {
      logger.error('Error loading SMS quota:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!clubId) return;

    try {
      setSaving(true);
      await FirebaseSettingsService.saveSMSSettings(clubId, settings);
      toast.success('Paramètres SMS sauvegardés', { duration: 1500 });
    } catch (error) {
      logger.error('Error saving SMS settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestSMS = async () => {
    if (!clubId) return;

    // Ask user for test phone number
    const testPhone = window.prompt(
      'Entrez le numéro de téléphone de test (format: +32 ou 0470...):\n\nNote: Twilio Trial ne peut envoyer qu\'aux numéros vérifiés.',
      settings.testPhoneNumber || '+32'
    );

    if (!testPhone || !testPhone.trim()) {
      toast.error('Numéro de téléphone requis');
      return;
    }

    const normalized = normalizePhoneNumber(testPhone, settings.defaultCountryCode);
    if (!normalized) {
      toast.error('Numéro de téléphone invalide');
      return;
    }

    try {
      setSendingTest(true);

      // Get Firebase Auth token
      const user = await import('@/lib/firebase').then(m => m.auth.currentUser);
      if (!user) {
        throw new Error('User not authenticated');
      }
      const authToken = await user.getIdToken();

      // Call the API endpoint (use relative URL for CORS compatibility)
      const apiBase = import.meta.env.PROD ? '' : 'https://caly-compta.vercel.app';
      const response = await fetch(`${apiBase}/api/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clubId,
          to: normalized,
          message: 'Calypso: Ceci est un message de test. Si vous recevez ce SMS, la configuration Twilio fonctionne correctement!',
          messageType: 'custom',
          sendType: 'test',
          authToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send test SMS');
      }

      toast.success(`SMS de test envoyé à ${normalized}`, { duration: 3000 });
      loadHistory(); // Refresh history
      loadQuota(); // Refresh quota

    } catch (error) {
      logger.error('Error sending test SMS:', error);
      toast.error(`Erreur: ${error instanceof Error ? error.message : 'Échec de l\'envoi'}`);
    } finally {
      setSendingTest(false);
    }
  };

  const handleToggleMasterSwitch = () => {
    setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleToggleTestMode = () => {
    setSettings(prev => ({ ...prev, testMode: !prev.testMode }));
  };

  const handleToggleJob = (jobId: string) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, enabled: !job.enabled } : job
      ),
    }));
  };

  const handleCreateJob = () => {
    const newJob = createNewSMSJob();
    setEditingJob(newJob);
    setShowJobModal(true);
  };

  const handleEditJob = (job: SMSJob) => {
    setEditingJob(job);
    setShowJobModal(true);
  };

  const handleDuplicateJob = (job: SMSJob) => {
    const duplicated = duplicateSMSJob(job);
    setSettings(prev => ({
      ...prev,
      jobs: [...prev.jobs, duplicated],
      updatedAt: new Date(),
    }));
    toast.success(`Job "${job.name}" dupliqué`, { duration: 1500 });
  };

  const handleDeleteJob = (jobId: string) => {
    const job = settings.jobs.find(j => j.id === jobId);
    if (!job) return;

    if (!window.confirm(`Voulez-vous vraiment supprimer le job "${job.name}" ?`)) {
      return;
    }

    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.filter(j => j.id !== jobId),
      updatedAt: new Date(),
    }));
    toast.success(`Job "${job.name}" supprimé`, { duration: 1500 });
  };

  const handleSaveJob = (job: SMSJob) => {
    const validation = validateSMSJob(job);
    if (!validation.valid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    const jobIndex = settings.jobs.findIndex(j => j.id === job.id);
    if (jobIndex >= 0) {
      setSettings(prev => ({
        ...prev,
        jobs: prev.jobs.map(j => j.id === job.id ? { ...job, updatedAt: new Date() } : j),
        updatedAt: new Date(),
      }));
      toast.success(`Job "${job.name}" modifié`, { duration: 1500 });
    } else {
      setSettings(prev => ({
        ...prev,
        jobs: [...prev.jobs, { ...job, updatedAt: new Date() }],
        updatedAt: new Date(),
      }));
      toast.success(`Job "${job.name}" créé`, { duration: 1500 });
    }

    setShowJobModal(false);
    setEditingJob(null);
  };

  const handleCancelJobEdit = () => {
    setShowJobModal(false);
    setEditingJob(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Compact Status Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* Title + Toggle */}
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">SMS via Twilio</h2>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
                {settings.enabled ? 'Activé' : 'Désactivé'}
              </span>
              <button
                onClick={handleToggleMasterSwitch}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  settings.enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Quota */}
          {quota && (
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
              Quota: <span className="font-medium">{quota.used}/{quota.limit}</span> SMS
              <span className={`ml-2 ${quota.remaining > 10 ? 'text-green-600' : 'text-red-600'}`}>
                ({quota.remaining} restants)
              </span>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSendTestSMS}
              disabled={sendingTest || !settings.twilio.accountSid}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {sendingTest ? 'Envoi...' : 'Test SMS'}
            </button>
            <Link
              to="/parametres/communication/sms-templates"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1"
            >
              Templates <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              to="/parametres/communication/whatsapp"
              className="text-sm text-green-600 hover:text-green-700 dark:text-green-400 flex items-center gap-1"
            >
              WhatsApp <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {!settings.enabled && (
          <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              Les SMS automatiques sont désactivés. Activez pour permettre l'envoi de jobs planifiés.
            </p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-dark-border dark:border-gray-700">
        <button
          onClick={() => setActiveTab('configuration')}
          className={cn(
            'px-6 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'configuration'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:text-dark-text-muted dark:hover:text-gray-200'
          )}
        >
          <Settings className="h-4 w-4" />
          Configuration
        </button>

        <button
          onClick={() => setActiveTab('automation')}
          className={cn(
            'px-6 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'automation'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:text-dark-text-muted dark:hover:text-gray-200'
          )}
        >
          <Clock className="h-4 w-4" />
          Automation
          <span className="ml-1 px-1.5 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 rounded text-xs">
            {settings.jobs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-6 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2',
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:text-dark-text-muted dark:hover:text-gray-200'
          )}
        >
          <History className="h-4 w-4" />
          Historique
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'configuration' && (
        <>
          {/* Twilio Configuration */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white mb-4">
              Configuration Twilio
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="sms-accountSid-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Account SID
                </label>
                <input
                  id="sms-accountSid-input"
                  type="text"
                  value={settings.twilio.accountSid}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    twilio: { ...prev.twilio, accountSid: e.target.value }
                  }))}
                  placeholder="AC..."
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="sms-authToken-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Auth Token
                </label>
                <input
                  id="sms-authToken-input"
                  type="password"
                  value={settings.twilio.authToken}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    twilio: { ...prev.twilio, authToken: e.target.value }
                  }))}
                  placeholder="••••••••"
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="sms-messagingServiceSid-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Messaging Service SID
                </label>
                <input
                  id="sms-messagingServiceSid-input"
                  type="text"
                  value={settings.twilio.messagingServiceSid}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    twilio: { ...prev.twilio, messagingServiceSid: e.target.value }
                  }))}
                  placeholder="MG..."
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="sms-fromPhoneNumber-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                  Numéro d'envoi (From)
                </label>
                <input
                  id="sms-fromPhoneNumber-input"
                  type="text"
                  value={settings.twilio.fromPhoneNumber}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    twilio: { ...prev.twilio, fromPhoneNumber: e.target.value }
                  }))}
                  placeholder="+1234567890"
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Test mode and other options */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                    Mode test
                  </label>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                    En mode test, seuls les numéros vérifiés Twilio reçoivent les SMS
                  </p>
                </div>
                <button
                  onClick={handleToggleTestMode}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    settings.testMode ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.testMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="mt-4 flex gap-4">
                <div className="flex-1">
                  <label htmlFor="sms-defaultCountryCode-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                    Code pays par défaut
                  </label>
                  <input
                    id="sms-defaultCountryCode-input"
                    type="text"
                    value={settings.defaultCountryCode}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      defaultCountryCode: e.target.value
                    }))}
                    placeholder="+32"
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="flex-1">
                  <label htmlFor="sms-maxSmsPerDay-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
                    Limite SMS/jour
                  </label>
                  <input
                    id="sms-maxSmsPerDay-input"
                    type="number"
                    min="1"
                    max="1000"
                    value={settings.maxSmsPerDay}
                    onChange={(e) => setSettings(prev => ({
                      ...prev,
                      maxSmsPerDay: parseInt(e.target.value, 10) || 100
                    }))}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'automation' && (
        <>
          {/* Jobs list */}
          <div className="space-y-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">
                Jobs SMS configurés ({settings.jobs.length})
              </h3>
              <button
                onClick={handleCreateJob}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <span>+</span>
                <span>Nouveau job</span>
              </button>
            </div>

            {settings.jobs.length === 0 ? (
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700 border border-gray-200 dark:border-dark-border dark:border-gray-600 rounded-lg p-8 text-center">
                <p className="text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted mb-4">Aucun job SMS configuré</p>
                <button
                  onClick={handleCreateJob}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  Créer votre premier job SMS
                </button>
              </div>
            ) : (
              settings.jobs.map(job => (
                <SMSJobCard
                  key={job.id}
                  job={job}
                  globalEnabled={settings.enabled}
                  onToggle={() => handleToggleJob(job.id)}
                  onEdit={() => handleEditJob(job)}
                  onDuplicate={() => handleDuplicateJob(job)}
                  onDelete={() => handleDeleteJob(job.id)}
                />
              ))
            )}
          </div>

          {/* Save button for automation changes */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder les paramètres'}
            </button>
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">Historique d'envoi SMS</h3>
            <button
              onClick={loadHistory}
              disabled={loadingHistory}
              className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
            >
              {loadingHistory ? 'Actualisation...' : 'Actualiser'}
            </button>
          </div>

          {history.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-dark-text-muted text-center py-8">
              Aucun SMS envoyé pour le moment
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700 border-b border-gray-200 dark:border-dark-border dark:border-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Date</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Destinataire</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Message</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Type</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {history.map(sms => (
                    <tr key={sms.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700">
                      <td className="px-4 py-3 text-gray-900 dark:text-dark-text-primary dark:text-white">
                        {sms.createdAt ? new Date(sms.createdAt).toLocaleString('fr-BE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                        <div>{sms.recipientName || '-'}</div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-muted">{sms.recipientPhone}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 max-w-xs truncate" title={sms.message}>
                        {sms.message?.substring(0, 50)}...
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted text-xs">
                        {sms.sendType === 'automated' ? 'Auto' : sms.sendType === 'test' ? 'Test' : 'Manuel'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={sms.twilioStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Job Edit Modal */}
      {showJobModal && editingJob && (
        <SMSJobEditModal
          job={editingJob}
          onSave={handleSaveJob}
          onCancel={handleCancelJobEdit}
        />
      )}
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; label: string }> = {
    delivered: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', label: 'Livré' },
    sent: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Envoyé' },
    queued: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', label: 'En attente' },
    sending: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', label: 'Envoi...' },
    failed: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Échec' },
    undelivered: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', label: 'Non livré' },
  };

  const config = statusConfig[status] || { color: 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800', label: status };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// SMS Job Card component
interface SMSJobCardProps {
  job: SMSJob;
  globalEnabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function SMSJobCard({
  job,
  globalEnabled,
  onToggle,
  onEdit,
  onDuplicate,
  onDelete,
}: SMSJobCardProps) {
  const allDays: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
  const timesOfDay = job.timesOfDay || ['09:00'];
  const cronExpression = generateCronExpression(job.daysOfWeek, timesOfDay);
  const segments = calculateSMSSegments(job.messageTemplate);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-dark-border dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-dark-border dark:border-gray-600 flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={onToggle}
            disabled={!globalEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              job.enabled && globalEnabled ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'
            } ${!globalEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                job.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary dark:text-white">{job.name}</h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted truncate">{job.description}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1 ml-3">
          <button
            onClick={onEdit}
            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            title="Modifier"
          >
            Edit
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-gray-700 rounded transition-colors"
            title="Dupliquer"
          >
            Copy
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
            title="Supprimer"
          >
            Del
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {/* Days */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
              Jours d'exécution
            </label>
            <div className="flex flex-wrap gap-1">
              {allDays.map(day => (
                <span
                  key={day}
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    job.daysOfWeek.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-600 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted'
                  }`}
                >
                  {getDayShortName(day)}
                </span>
              ))}
            </div>
          </div>

          {/* Times */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
              Heures d'exécution
            </label>
            <div className="flex flex-wrap gap-1">
              {timesOfDay.map((time, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-600 text-gray-700 dark:text-dark-text-primary dark:text-gray-300"
                >
                  {time}
                </span>
              ))}
            </div>
          </div>

          {/* Message preview */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-1">
              Message ({segments} segment{segments > 1 ? 's' : ''})
            </label>
            <p className="text-xs text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted truncate" title={job.messageTemplate}>
              {job.messageTemplate?.substring(0, 60)}...
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border dark:border-gray-600 text-xs text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
          <div>
            <span className="font-semibold">Cron:</span>{' '}
            <code className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 px-1.5 py-0.5 rounded">{cronExpression}</code>
          </div>
          {job.lastRun && (
            <div>
              <span className="font-semibold">Dernier:</span>{' '}
              {new Date(job.lastRun).toLocaleDateString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {job.lastRunSuccess !== undefined && (
                <span className={job.lastRunSuccess ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                  {job.lastRunSuccess ? '✓' : '✗'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// SMS Job Edit Modal
interface SMSJobEditModalProps {
  job: SMSJob;
  onSave: (job: SMSJob) => void;
  onCancel: () => void;
}

function SMSJobEditModal({ job, onSave, onCancel }: SMSJobEditModalProps) {
  const [editedJob, setEditedJob] = useState<SMSJob>({
    ...job,
    timesOfDay: job.timesOfDay || ['09:00'],
  });

  const allDays: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0];
  const normalizedTimes = [...(editedJob.timesOfDay || ['09:00']), '', '', '', ''].slice(0, 4);
  const segments = calculateSMSSegments(editedJob.messageTemplate);

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = editedJob.daysOfWeek.includes(day)
      ? editedJob.daysOfWeek.filter(d => d !== day)
      : [...editedJob.daysOfWeek, day].sort((a, b) => a - b);

    setEditedJob(prev => ({ ...prev, daysOfWeek: newDays }));
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...normalizedTimes];
    newTimes[index] = value;
    const filteredTimes = newTimes.filter(t => t && t.trim() !== '');
    setEditedJob(prev => ({
      ...prev,
      timesOfDay: filteredTimes.length > 0 ? filteredTimes : ['09:00'],
    }));
  };

  const handleRoleToggle = (role: 'superadmin' | 'admin' | 'validateur' | 'user') => {
    const newRoles = editedJob.recipients.roles.includes(role)
      ? editedJob.recipients.roles.filter(r => r !== role)
      : [...editedJob.recipients.roles, role];

    setEditedJob(prev => ({
      ...prev,
      recipients: { ...prev.recipients, roles: newRoles },
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(editedJob);
  };

  const messageTypes: { value: SMSMessageType; label: string }[] = [
    { value: 'payment_reminder', label: 'Rappel de paiement' },
    { value: 'invoice_notification', label: 'Notification de facture' },
    { value: 'expense_alert', label: 'Alerte de dépense' },
    { value: 'transaction_confirmation', label: 'Confirmation de transaction' },
    { value: 'activity_notification', label: 'Notification d\'activité' },
    { value: 'custom', label: 'Message personnalisé' },
  ];

  const roles: ('superadmin' | 'admin' | 'validateur' | 'user')[] = ['superadmin', 'admin', 'validateur', 'user'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-dark-border dark:border-gray-700 pb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary dark:text-white">
              {job.id.startsWith('sms-job-') && !job.lastRun ? 'Nouveau job SMS' : 'Modifier le job SMS'}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300 transition-colors"
            >
              X
            </button>
          </div>

          {/* Job name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Nom du job *
            </label>
            <input
              type="text"
              value={editedJob.name}
              onChange={(e) => setEditedJob(prev => ({ ...prev, name: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Description *
            </label>
            <textarea
              value={editedJob.description}
              onChange={(e) => setEditedJob(prev => ({ ...prev, description: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              required
            />
          </div>

          {/* Message type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Type de message *
            </label>
            <select
              value={editedJob.messageType}
              onChange={(e) => {
                const messageType = e.target.value as SMSMessageType;
                setEditedJob(prev => ({
                  ...prev,
                  messageType,
                  description: getDefaultJobDescription(messageType),
                  messageTemplate: getDefaultTemplate(messageType),
                }));
              }}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
              required
            >
              {messageTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Message template */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Template du message * ({segments} segment{segments > 1 ? 's' : ''} SMS)
            </label>
            <textarea
              value={editedJob.messageTemplate}
              onChange={(e) => setEditedJob(prev => ({ ...prev, messageTemplate: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              rows={3}
              required
              placeholder="Calypso: {{variable}} message..."
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              Variables disponibles: {'{{count}}'}, {'{{amount}}'}, {'{{title}}'}, {'{{date}}'}, {'{{reference}}'}
            </p>
            {segments > 1 && (
              <p className="mt-1 text-xs text-amber-600">
                Ce message nécessite {segments} segments SMS (160 chars = 1 segment)
              </p>
            )}
          </div>

          {/* Days of week */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Jours d'exécution *
            </label>
            <div className="flex flex-wrap gap-2">
              {allDays.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    editedJob.daysOfWeek.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {getDayShortName(day)}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Heures d'exécution (max 4) *
            </label>
            <div className="grid grid-cols-4 gap-3">
              {normalizedTimes.map((time, index) => (
                <input
                  key={index}
                  type="time"
                  value={time}
                  onChange={(e) => handleTimeChange(index, e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
                  required={index === 0}
                />
              ))}
            </div>
          </div>

          {/* Recipients */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Rôles destinataires *
            </label>
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleToggle(role)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    editedJob.recipients.roles.includes(role)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          {/* Minimum count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary dark:text-gray-300 mb-2">
              Nombre minimum d'items pour envoyer
            </label>
            <input
              type="number"
              min="0"
              value={editedJob.minimumCount || 0}
              onChange={(e) => setEditedJob(prev => ({ ...prev, minimumCount: parseInt(e.target.value, 10) }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-dark-text-primary dark:text-white focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-dark-border dark:border-gray-700">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {job.id.startsWith('sms-job-') && !job.lastRun ? 'Créer le job' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
