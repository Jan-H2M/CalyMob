import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { listTemplates } from '@/services/emailTemplateService';
import {
  createNewJob,
  duplicateJob,
  validateJob,
  getEmailTypeName,
  getDefaultJobDescription,
  IMPLEMENTED_COMMUNICATION_EMAIL_TYPES,
  normalizeCommunicationEmailType,
} from '@/services/communicationService';
import type {
  CommunicationSettings as CommunicationSettingsType,
  CommunicationJob,
  DayOfWeek,
  CommunicationLog,
  CommunicationEmailType,
} from '@/types/communication';
import type { EmailTemplate } from '@/types/emailTemplates';
import {
  DEFAULT_COMMUNICATION_SETTINGS,
  getDayShortName,
  generateCronExpression,
} from '@/types/communication';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ValueListSelector } from '@/components/commun/ValueListSelector';
import { MemberEmailSelector } from '@/components/commun/MemberEmailSelector';

const testEmailApiBase = (import.meta as any).env?.PROD ? '' : 'https://caly-compta.vercel.app';

export default function CommunicationSettings() {
  const { clubId } = useAuth();
  const [settings, setSettings] = useState<CommunicationSettingsType>(DEFAULT_COMMUNICATION_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [showJobModal, setShowJobModal] = useState(false);
  const [editingJob, setEditingJob] = useState<CommunicationJob | null>(null);

  // Load settings and templates on mount
  useEffect(() => {
    if (clubId) {
      loadSettings();
      loadLogs();
      loadTemplates();
    }
  }, [clubId]);

  const loadSettings = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const loadedSettings = await FirebaseSettingsService.loadCommunicationSettings(clubId);
      setSettings(loadedSettings || DEFAULT_COMMUNICATION_SETTINGS);
    } catch (error) {
      logger.error('Error loading communication settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!clubId) return;

    try {
      setLoadingLogs(true);
      // Load from email_history instead of communication_logs
      const emailHistoryRef = collection(db, 'clubs', clubId, 'email_history');
      const q = query(emailHistoryRef, orderBy('sentAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);

      const loadedLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          recipientEmail: data.recipientEmail,
          subject: data.subject,
          status: data.status,
          sendType: data.sendType,
          jobName: data.jobName,
          timestamp: data.sentAt?.toDate() || data.createdAt?.toDate(),
          statusMessage: data.statusMessage,
        };
      }) as CommunicationLog[];

      setLogs(loadedLogs);
    } catch (error) {
      logger.error('Error loading email history:', error);
    } finally {
      setLoadingLogs(false);
    }
  };

  const loadTemplates = async () => {
    if (!clubId) return;

    try {
      const loadedTemplates = await listTemplates(clubId);
      setTemplates(loadedTemplates.filter(t => t.isActive)); // Only show active templates
    } catch (error) {
      logger.error('Error loading templates:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!clubId) return;

    try {
      setSaving(true);
      await FirebaseSettingsService.saveCommunicationSettings(clubId, settings);
      toast.success('✓ Paramètres sauvegardés', { duration: 1500 });
    } catch (error) {
      logger.error('Error saving settings:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (job: CommunicationJob) => {
    if (!clubId) return;

    // Ask user for test email address
    const testEmail = window.prompt(
      'Entrez l\'adresse email de test:',
      'jan.andriessens@gmail.com'
    );

    if (!testEmail || !testEmail.trim()) {
      toast.error('Adresse email requise');
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

      // Match the email services: same-origin in production, Vercel fallback in development.
      const response = await fetch(`${testEmailApiBase}/api/send-test-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clubId,
          jobId: job.id,
          testEmail: testEmail.trim(),
          authToken,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        logger.error('❌ API Error Response:', result);
        throw new Error(result.error || result.details || 'Failed to send test email');
      }

      toast.success(`✅ Email de test envoyé à ${testEmail}`, { duration: 3000 });
      logger.debug('📧 Test email sent:', result.details);
    } catch (error) {
      logger.error('❌ Error sending test email:', error);
      toast.error(`Erreur: ${error instanceof Error ? error.message : 'Échec de l\'envoi'}`);
    } finally {
      setSendingTest(false);
    }
  };

  const handleToggleMasterSwitch = () => {
    setSettings(prev => ({ ...prev, enabled: !prev.enabled }));
  };

  const handleToggleJob = (jobId: string) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, enabled: !job.enabled } : job
      ),
    }));
  };

  const handleUpdateJobDays = (jobId: string, days: DayOfWeek[]) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, daysOfWeek: days, updatedAt: new Date() } : job
      ),
    }));
  };

  const handleUpdateJobTimes = (jobId: string, times: string[]) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, timesOfDay: times, updatedAt: new Date() } : job
      ),
    }));
  };

  const handleUpdateJobMinimumCount = (jobId: string, count: number) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, minimumCount: count, updatedAt: new Date() } : job
      ),
    }));
  };

  const handleUpdateJobTemplate = (jobId: string, templateId: string) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, templateId: templateId || undefined, updatedAt: new Date() } : job
      ),
    }));
  };

  const handleCreateJob = () => {
    const newJob = createNewJob();
    setEditingJob(newJob);
    setShowJobModal(true);
  };

  const handleEditJob = (job: CommunicationJob) => {
    setEditingJob(job);
    setShowJobModal(true);
  };

  const handleDuplicateJob = (job: CommunicationJob) => {
    const duplicated = duplicateJob(job);
    setSettings(prev => ({
      ...prev,
      jobs: [...prev.jobs, duplicated],
      updatedAt: new Date(),
    }));
    toast.success(`✓ Job "${job.name}" dupliqué`, { duration: 1500 });
  };

  const handleDeleteJob = (jobId: string) => {
    const job = settings.jobs.find(j => j.id === jobId);
    if (!job) return;

    if (!window.confirm(`Voulez-vous vraiment supprimer le job "${job.name}" ?\n\nCette action est irréversible.`)) {
      return;
    }

    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.filter(j => j.id !== jobId),
      updatedAt: new Date(),
    }));
    toast.success(`✓ Job "${job.name}" supprimé`, { duration: 1500 });
  };

  const handleSaveJob = (job: CommunicationJob) => {
    const validation = validateJob(job);
    if (!validation.valid) {
      validation.errors.forEach(error => toast.error(error));
      return;
    }

    const jobIndex = settings.jobs.findIndex(j => j.id === job.id);
    if (jobIndex >= 0) {
      // Update existing job
      setSettings(prev => ({
        ...prev,
        jobs: prev.jobs.map(j => j.id === job.id ? { ...job, updatedAt: new Date() } : j),
        updatedAt: new Date(),
      }));
      toast.success(`✓ Job "${job.name}" modifié`, { duration: 1500 });
    } else {
      // Add new job
      setSettings(prev => ({
        ...prev,
        jobs: [...prev.jobs, { ...job, updatedAt: new Date() }],
        updatedAt: new Date(),
      }));
      toast.success(`✓ Job "${job.name}" créé`, { duration: 1500 });
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
      {/* Header with master toggle */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary mb-2">
              📧 Communication automatisée
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              Configurez des jobs planifiés pour envoyer des emails automatiques aux membres.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
              {settings.enabled ? 'Activé' : 'Désactivé'}
            </span>
            <button
              onClick={handleToggleMasterSwitch}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enabled ? 'bg-blue-600' : 'bg-gray-300'
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

        {!settings.enabled && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              ⚠️ Les emails automatiques sont désactivés. Activez pour permettre l'envoi de jobs planifiés.
            </p>
          </div>
        )}
      </div>

      {/* Jobs list */}
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Jobs configurés ({settings.jobs.length})
          </h3>
          <button
            onClick={handleCreateJob}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
          >
            <span>➕</span>
            <span>Nouveau job</span>
          </button>
        </div>

        {settings.jobs.length === 0 ? (
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-8 text-center">
            <p className="text-gray-600 dark:text-dark-text-secondary mb-4">Aucun job configuré</p>
            <button
              onClick={handleCreateJob}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              ➕ Créer votre premier job
            </button>
          </div>
        ) : (
          settings.jobs.map(job => (
            <JobConfigCard
              key={job.id}
              job={job}
              globalEnabled={settings.enabled}
              templates={templates}
              onToggle={() => handleToggleJob(job.id)}
              onUpdateDays={(days) => handleUpdateJobDays(job.id, days)}
              onUpdateTimes={(times) => handleUpdateJobTimes(job.id, times)}
              onUpdateMinimumCount={(count) => handleUpdateJobMinimumCount(job.id, count)}
              onUpdateTemplate={(templateId) => handleUpdateJobTemplate(job.id, templateId)}
              onSendTest={() => handleSendTestEmail(job)}
              onEdit={() => handleEditJob(job)}
              onDuplicate={() => handleDuplicateJob(job)}
              onDelete={() => handleDeleteJob(job.id)}
              sendingTest={sendingTest}
            />
          ))
        )}
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Sauvegarde...' : '💾 Sauvegarder les paramètres'}
        </button>
      </div>

      {/* Email logs */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">📜 Historique d'envoi</h3>
          <button
            onClick={loadLogs}
            disabled={loadingLogs}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {loadingLogs ? '⟳ Actualisation...' : '🔄 Actualiser'}
          </button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-dark-text-muted text-center py-8">
            Aucun email envoyé pour le moment
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary">Sujet</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary">Destinataire</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary">Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-dark-text-primary">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                    <td className="px-4 py-3 text-gray-900 dark:text-dark-text-primary">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-BE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-dark-text-primary max-w-xs truncate" title={log.subject}>
                      {log.subject || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-dark-text-primary">{log.recipientEmail || '-'}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-dark-text-secondary text-xs">
                      {log.sendType === 'automated' ? '🤖 Auto' : log.sendType === 'manual' ? '👤 Manuel' : log.jobName || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {log.status === 'sent' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                          ✓ Envoyé
                        </span>
                      ) : log.status === 'failed' ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300" title={log.statusMessage}>
                          ✗ Échec
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:text-dark-text-primary">
                          {log.status || 'Inconnu'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Job Edit Modal */}
      {showJobModal && editingJob && clubId && (
        <JobEditModal
          job={editingJob}
          templates={templates}
          clubId={clubId}
          onSave={handleSaveJob}
          onCancel={handleCancelJobEdit}
        />
      )}
    </div>
  );
}

interface JobConfigCardProps {
  job: CommunicationJob;
  globalEnabled: boolean;
  templates: EmailTemplate[];
  onToggle: () => void;
  onUpdateDays: (days: DayOfWeek[]) => void;
  onUpdateTimes: (times: string[]) => void;
  onUpdateMinimumCount: (count: number) => void;
  onUpdateTemplate: (templateId: string) => void;
  onSendTest: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  sendingTest: boolean;
}

function JobConfigCard({
  job,
  globalEnabled,
  templates,
  onToggle,
  onUpdateDays,
  onUpdateTimes,
  onUpdateMinimumCount,
  onUpdateTemplate,
  onSendTest,
  onEdit,
  onDuplicate,
  onDelete,
  sendingTest,
}: JobConfigCardProps) {
  const allDays: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]; // Lun-Dim
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);

  // Normalize timesOfDay: use array or fallback to single timeOfDay for backwards compat
  const timesOfDay = job.timesOfDay || (job.timeOfDay ? [job.timeOfDay] : ['09:00']);
  // Ensure we always have 4 slots (pad with empty strings)
  const normalizedTimes = [...timesOfDay, '', '', '', ''].slice(0, 4);
  const normalizedJobEmailType = normalizeCommunicationEmailType(job.emailType);
  const compatibleTemplates = templates.filter((template) => template.emailType === normalizedJobEmailType);
  const selectedTemplate = templates.find((template) => template.id === job.templateId);
  const selectedTemplateIsCompatible = !selectedTemplate || selectedTemplate.emailType === normalizedJobEmailType;
  const defaultTemplatePreview = {
    pending_demands: {
      subject: '📋 Rappel: {{demandesCount}} demande(s) de remboursement en attente',
      summary: 'Résumé des demandes en attente avec total, tableau détaillé et CTA vers la liste des dépenses.'
    },
    accounting_codes: {
      subject: '📊 Codes comptables - {{totalTransactions}} nouvelle(s) transaction(s)',
      summary: 'Liste des transactions codées avec date, séquence, contrepartie, code comptable et montant.'
    },
    bank_validation_pending: {
      subject: '🏦 Validation bancaire requise - {{demandesCount}} paiement(s)',
      summary: 'Liste des paiements créés dans la banque avec bénéficiaire, description, montant et rappel d’action.'
    }
  } as const;

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = job.daysOfWeek.includes(day)
      ? job.daysOfWeek.filter(d => d !== day)
      : [...job.daysOfWeek, day].sort((a, b) => a - b);

    onUpdateDays(newDays);
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...normalizedTimes];
    newTimes[index] = value;
    // Filter out empty strings for storage, but keep at least one time
    const filteredTimes = newTimes.filter(t => t && t.trim() !== '');
    onUpdateTimes(filteredTimes.length > 0 ? filteredTimes : ['09:00']);
  };

  const cronExpression = generateCronExpression(job.daysOfWeek, timesOfDay);
  const previewConfig = defaultTemplatePreview[normalizedJobEmailType as keyof typeof defaultTemplatePreview];

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow border border-gray-200 dark:border-dark-border overflow-hidden">
      {/* Compact header with toggle and actions */}
      <div className="bg-gray-50 dark:bg-dark-bg-tertiary px-4 py-3 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={onToggle}
            disabled={!globalEnabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
              job.enabled && globalEnabled ? 'bg-green-600' : 'bg-gray-300'
            } ${!globalEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                job.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">{job.name}</h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-muted truncate">{job.description}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center space-x-1 ml-3">
          <button
            onClick={onEdit}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            title="Modifier"
          >
            ✏️
          </button>
          <button
            onClick={onDuplicate}
            className="p-1.5 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded transition-colors"
            title="Dupliquer"
          >
            📋
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Supprimer"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Compact configuration grid */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          {/* Days - inline badges */}
          <div>
            <span className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Jours d'exécution
            </span>
            <div className="flex flex-wrap gap-1">
              {allDays.map(day => (
                <button
                  key={day}
                  onClick={() => handleDayToggle(day)}
                  disabled={!globalEnabled || !job.enabled}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    job.daysOfWeek.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-bg-primary'
                  } ${!globalEnabled || !job.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {getDayShortName(day)}
                </button>
              ))}
            </div>
          </div>

          {/* Times - 4 compact inputs in 2x2 grid */}
          <div className="col-span-2">
            <span className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Heures d'exécution (Europe/Brussels) - max 4 par jour
            </span>
            <div className="grid grid-cols-4 gap-2">
              {normalizedTimes.map((time, index) => (
                <input
                  key={index}
                  type="time"
                  value={time}
                  onChange={(e) => handleTimeChange(index, e.target.value)}
                  disabled={!globalEnabled || !job.enabled}
                  placeholder="--:--"
                  className="block w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                />
              ))}
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-text-muted">
              {timesOfDay.filter(t => t).length} moment(s) configuré(s)
            </p>
          </div>

        </div>

        {/* Minimum count - separate row */}
        {job.minimumCount !== undefined && (
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
              Nombre minimum d'items pour envoyer
            </label>
            <input
              type="number"
              min="0"
              value={job.minimumCount}
              onChange={(e) => onUpdateMinimumCount(parseInt(e.target.value, 10))}
              disabled={!globalEnabled || !job.enabled}
              className="block w-full px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-text-muted">
              L'email ne sera pas envoyé s'il y a moins de {job.minimumCount} demande(s)
            </p>
          </div>
        )}

        {/* Recipients - inline badges */}
        <div>
          <span className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Destinataires
          </span>
          <div className="flex flex-wrap gap-1.5">
            {job.recipients.roles.map(role => (
              <span
                key={role}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
              >
                {role}
              </span>
            ))}
            {job.recipients.clubFunctions?.map(func => (
              <span
                key={func}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
              >
                {func}
              </span>
            ))}
            {job.recipients.additionalEmails?.map(email => (
              <span
                key={email}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300"
                title={email}
              >
                📧 {email.split('@')[0]}
              </span>
            ))}
          </div>
        </div>

        {/* Template selector with preview */}
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-dark-text-primary mb-1">
            Template d'email
          </label>
          <div className="flex gap-2">
            <select
              value={job.templateId || ''}
              onChange={(e) => onUpdateTemplate(e.target.value)}
              disabled={!globalEnabled || !job.enabled}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-dark-border rounded bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">(Template par défaut du type)</option>
              {job.templateId && selectedTemplate && !selectedTemplateIsCompatible && (
                <option value={job.templateId}>
                  {selectedTemplate.name} - incompatible avec ce type
                </option>
              )}
              {compatibleTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {(job.templateId || !job.templateId) && (
              <button
                onClick={() => setShowTemplatePreview(!showTemplatePreview)}
                className="px-3 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded transition-colors flex-shrink-0"
              >
                {showTemplatePreview ? '👁️ Masquer' : '👁️ Voir template'}
              </button>
            )}
            <button
              onClick={() => window.open('/parametres/email-templates', '_blank')}
              className="px-3 py-1 text-xs bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              title="Gérer les templates"
            >
              ⚙️ Gérer
            </button>
          </div>
          {!job.templateId && !showTemplatePreview && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-text-muted">
              💡 Template par défaut du type "{getEmailTypeName(job.emailType)}" utilisé
            </p>
          )}
          {job.templateId && !showTemplatePreview && selectedTemplate && (
            <p className={`mt-0.5 text-xs ${selectedTemplateIsCompatible ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {selectedTemplateIsCompatible ? `✓ ${selectedTemplate.name}` : `⚠️ ${selectedTemplate.name} ne correspond pas au type d'email`}
            </p>
          )}
        </div>

        {/* Template preview */}
        {showTemplatePreview && (
          <div className="col-span-3 border border-gray-300 dark:border-dark-border rounded-lg overflow-hidden">
            <div className="bg-gray-100 dark:bg-dark-bg-tertiary px-3 py-2 border-b border-gray-300 dark:border-dark-border flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700 dark:text-dark-text-primary">
                {job.templateId && selectedTemplate
                  ? `📄 ${selectedTemplate.name}`
                  : '📄 Template par défaut (hardcodé)'}
              </span>
              <button
                onClick={() => setShowTemplatePreview(false)}
                className="text-xs text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
              >
                ✕
              </button>
            </div>
            <div className="p-3 bg-white dark:bg-dark-bg-secondary max-h-64 overflow-y-auto text-xs">
              {job.templateId && selectedTemplate ? (
                <div>
                  <div className="mb-2 pb-2 border-b border-gray-200 dark:border-dark-border">
                    <p className="font-semibold text-gray-700 dark:text-dark-text-primary">Sujet:</p>
                    <p className="text-gray-900 dark:text-dark-text-primary font-mono text-xs bg-gray-50 dark:bg-dark-bg-tertiary px-2 py-1 rounded mt-1">
                      {selectedTemplate.subject}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-dark-text-primary mb-1">Contenu HTML:</p>
                    <pre className="text-xs text-gray-600 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                      {selectedTemplate.htmlContent.substring(0, 500)}
                      {selectedTemplate.htmlContent.length > 500 && '...'}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-dark-text-primary">Sujet:</p>
                    <p className="text-gray-900 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary px-2 py-1 rounded mt-1">
                      {previewConfig?.subject || getEmailTypeName(job.emailType)}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-dark-text-primary">Contenu:</p>
                    <p className="text-gray-600 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded mt-1">
                      {previewConfig?.summary || 'Template par défaut configuré pour ce type de job.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom bar with cron and test button */}
        <div className="col-span-3 flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-dark-text-secondary">
            <div>
              <span className="font-semibold">Cron:</span>{' '}
              <code className="bg-gray-100 dark:bg-dark-bg-tertiary px-1.5 py-0.5 rounded">{cronExpression}</code>
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
          <button
            onClick={onSendTest}
            disabled={!globalEnabled || !job.enabled || sendingTest}
            className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            {sendingTest ? '📤 Envoi...' : '📧 Test'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface JobEditModalProps {
  job: CommunicationJob;
  templates: EmailTemplate[];
  clubId: string;
  onSave: (job: CommunicationJob) => void;
  onCancel: () => void;
}

function JobEditModal({ job, templates, clubId, onSave, onCancel }: JobEditModalProps) {
  // Initialize with timesOfDay or fallback to timeOfDay for backwards compatibility
  const initialTimesOfDay = job.timesOfDay || (job.timeOfDay ? [job.timeOfDay] : ['09:00']);
  const [editedJob, setEditedJob] = useState<CommunicationJob>({
    ...job,
    timesOfDay: initialTimesOfDay,
  });
  const allDays: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]; // Lun-Dim

  // Ensure we always have 4 slots (pad with empty strings)
  const normalizedTimes = [...(editedJob.timesOfDay || ['09:00']), '', '', '', ''].slice(0, 4);
  const normalizedEditedEmailType = normalizeCommunicationEmailType(editedJob.emailType);
  const compatibleTemplates = templates.filter((template) => template.emailType === normalizedEditedEmailType);
  const selectedTemplate = templates.find((template) => template.id === editedJob.templateId);
  const selectedTemplateIsCompatible = !selectedTemplate || selectedTemplate.emailType === normalizedEditedEmailType;

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = editedJob.daysOfWeek.includes(day)
      ? editedJob.daysOfWeek.filter(d => d !== day)
      : [...editedJob.daysOfWeek, day].sort((a, b) => a - b);

    setEditedJob(prev => ({ ...prev, daysOfWeek: newDays }));
  };

  const handleTimeChange = (index: number, value: string) => {
    const newTimes = [...normalizedTimes];
    newTimes[index] = value;
    // Filter out empty strings for storage, but keep at least one time
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

  const emailTypes: { value: CommunicationEmailType; label: string }[] =
    IMPLEMENTED_COMMUNICATION_EMAIL_TYPES.map((value) => ({
      value,
      label: getEmailTypeName(value),
    }));

  const roles: ('superadmin' | 'admin' | 'validateur' | 'user')[] = ['superadmin', 'admin', 'validateur', 'user'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b dark:border-dark-border pb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {job.id.startsWith('job-') && !job.lastRun ? 'Nouveau job' : 'Modifier le job'}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-primary transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Job name */}
          <div>
            <label htmlFor="commjob-name-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Nom du job *
            </label>
            <input
              id="commjob-name-input"
              type="text"
              value={editedJob.name}
              onChange={(e) => setEditedJob(prev => ({ ...prev, name: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label htmlFor="commjob-description-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description *
            </label>
            <textarea
              id="commjob-description-input"
              value={editedJob.description}
              onChange={(e) => setEditedJob(prev => ({ ...prev, description: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              required
            />
          </div>

          {/* Email type */}
          <div>
            <label htmlFor="commjob-emailType-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Type d'email *
            </label>
            <select
              id="commjob-emailType-input"
              value={editedJob.emailType}
              onChange={(e) => {
                const emailType = e.target.value as CommunicationEmailType;
                setEditedJob(prev => ({
                  ...prev,
                  emailType,
                  name: !prev.name || prev.name === 'Nouveau job' || prev.name === getEmailTypeName(prev.emailType)
                    ? getEmailTypeName(emailType)
                    : prev.name,
                  description: getDefaultJobDescription(emailType),
                  templateId: selectedTemplate && selectedTemplate.emailType === emailType ? prev.templateId : undefined,
                }));
              }}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
              required
            >
              {emailTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Days of week */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Jours d'exécution *
            </span>
            <div className="flex flex-wrap gap-2">
              {allDays.map(day => (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayToggle(day)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    editedJob.daysOfWeek.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 dark:hover:bg-dark-bg-primary'
                  }`}
                >
                  {getDayShortName(day)}
                </button>
              ))}
            </div>
            {editedJob.daysOfWeek.length === 0 && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">Au moins un jour doit être sélectionné</p>
            )}
          </div>

          {/* Times - up to 4 execution times per day */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Heures d'exécution (Europe/Brussels) - max 4 par jour *
            </span>
            <div className="grid grid-cols-4 gap-3">
              {normalizedTimes.map((time, index) => (
                <div key={index}>
                  <label className="block text-xs text-gray-500 dark:text-dark-text-muted mb-1">
                    Moment {index + 1} {index === 0 && '*'}
                  </label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => handleTimeChange(index, e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
                    required={index === 0}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
              {(editedJob.timesOfDay || []).filter(t => t).length} moment(s) configuré(s). Laissez les champs vides pour désactiver.
            </p>
          </div>

          {/* Recipients - Roles */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Rôles destinataires *
            </span>
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleToggle(role)}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    editedJob.recipients.roles.includes(role)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 dark:hover:bg-dark-bg-primary'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            {editedJob.recipients.roles.length === 0 && (!editedJob.recipients.additionalEmails || editedJob.recipients.additionalEmails.length === 0) && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">Au moins un rôle ou email doit être sélectionné</p>
            )}
          </div>

          {/* Recipients - Club Functions */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Fonctions destinataires (optionnel)
            </span>
            <ValueListSelector
              clubId={clubId}
              listId="fonction"
              value={editedJob.recipients.clubFunctions || []}
              onChange={(newValue) => {
                const selectedFunctions = newValue as string[];
                setEditedJob(prev => ({
                  ...prev,
                  recipients: { ...prev.recipients, clubFunctions: selectedFunctions },
                }));
              }}
              mode="multi"
              showBadges={true}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              Filtrer aussi sur les fonctions club (CA, Encadrants, etc.)
            </p>
          </div>

          {/* Recipients - Additional Emails */}
          <div>
            <span className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Emails supplémentaires (optionnel)
            </span>
            <MemberEmailSelector
              clubId={clubId}
              value={editedJob.recipients.additionalEmails || []}
              onChange={(emails) => {
                setEditedJob(prev => ({
                  ...prev,
                  recipients: { ...prev.recipients, additionalEmails: emails },
                }));
              }}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              Sélectionnez des membres spécifiques qui recevront également cet email
            </p>
          </div>

          {/* Template selection */}
          <div>
            <label htmlFor="commjob-templateId-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Template d'email
            </label>
            <select
              id="commjob-templateId-input"
              value={editedJob.templateId || ''}
              onChange={(e) => setEditedJob(prev => ({ ...prev, templateId: e.target.value || undefined }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">(Template par défaut du type)</option>
              {editedJob.templateId && selectedTemplate && !selectedTemplateIsCompatible && (
                <option value={editedJob.templateId}>
                  {selectedTemplate.name} - incompatible avec ce type
                </option>
              )}
              {compatibleTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              {editedJob.templateId
                ? selectedTemplateIsCompatible
                  ? '✓ Template personnalisé sélectionné'
                  : '⚠️ Le template sélectionné ne correspond pas au type d’email choisi et sera ignoré'
                : '💡 Aucun template sélectionné - le système utilisera le template par défaut de ce type'}
            </p>
          </div>

          {/* Include details */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="includeDetails"
              checked={editedJob.includeDetails}
              onChange={(e) => setEditedJob(prev => ({ ...prev, includeDetails: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-dark-border rounded"
            />
            <label htmlFor="includeDetails" className="ml-2 block text-sm text-gray-700 dark:text-dark-text-primary">
              Inclure les détails (tableau) dans l'email
            </label>
          </div>

          {/* Minimum count */}
          <div>
            <label htmlFor="commjob-minimumCount-input" className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Nombre minimum d'items pour envoyer
            </label>
            <input
              id="commjob-minimumCount-input"
              type="number"
              min="0"
              value={editedJob.minimumCount || 0}
              onChange={(e) => setEditedJob(prev => ({ ...prev, minimumCount: parseInt(e.target.value, 10) }))}
              className="block w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
              L'email ne sera pas envoyé s'il y a moins de {editedJob.minimumCount || 0} item(s)
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t dark:border-dark-border">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-md hover:bg-gray-200 dark:hover:bg-dark-bg-primary transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              {job.id.startsWith('job-') && !job.lastRun ? 'Créer le job' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
