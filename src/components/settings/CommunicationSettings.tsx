import React, { useState, useEffect } from 'react';
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
      console.error('Error loading communication settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    if (!clubId) return;

    try {
      setLoadingLogs(true);
      const logsRef = collection(db, 'clubs', clubId, 'communication_logs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(20));
      const snapshot = await getDocs(q);

      const loadedLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate(),
      })) as CommunicationLog[];

      setLogs(loadedLogs);
    } catch (error) {
      console.error('Error loading logs:', error);
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
      console.error('Error loading templates:', error);
    }
  };

  const handleSaveSettings = async () => {
    if (!clubId) return;

    try {
      setSaving(true);
      await FirebaseSettingsService.saveCommunicationSettings(clubId, settings);
      toast.success('✓ Paramètres sauvegardés', { duration: 1500 });
    } catch (error) {
      console.error('Error saving settings:', error);
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

      // Call the API endpoint
      const response = await fetch('/api/send-test-email', {
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
        console.error('❌ API Error Response:', result);
        throw new Error(result.error || result.details || 'Failed to send test email');
      }

      toast.success(`✅ Email de test envoyé à ${testEmail}`, { duration: 3000 });
      console.log('📧 Test email sent:', result.details);
    } catch (error) {
      console.error('❌ Error sending test email:', error);
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

  const handleUpdateJobTime = (jobId: string, time: string) => {
    setSettings(prev => ({
      ...prev,
      jobs: prev.jobs.map(job =>
        job.id === jobId ? { ...job, timeOfDay: time, updatedAt: new Date() } : job
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              📧 Communication automatisée
            </h2>
            <p className="text-sm text-gray-600">
              Configurez des jobs planifiés pour envoyer des emails automatiques aux membres.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700">
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
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <p className="text-sm text-amber-800">
              ⚠️ Les emails automatiques sont désactivés. Activez pour permettre l'envoi de jobs planifiés.
            </p>
          </div>
        )}
      </div>

      {/* Jobs list */}
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
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
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-gray-600 mb-4">Aucun job configuré</p>
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
              onUpdateTime={(time) => handleUpdateJobTime(job.id, time)}
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">📜 Historique d'envoi</h3>
          <button
            onClick={loadLogs}
            disabled={loadingLogs}
            className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {loadingLogs ? '⟳ Actualisation...' : '🔄 Actualiser'}
          </button>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Aucun email envoyé pour le moment
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Job</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Destinataires</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Items</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString('fr-BE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {settings.jobs.find(j => j.id === log.jobId)?.name || log.emailType}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{log.recipientCount}</td>
                    <td className="px-4 py-3 text-gray-700">{log.itemCount || '-'}</td>
                    <td className="px-4 py-3">
                      {log.success ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Succès
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ✗ Erreur
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
      {showJobModal && editingJob && (
        <JobEditModal
          job={editingJob}
          templates={templates}
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
  onUpdateTime: (time: string) => void;
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
  onUpdateTime,
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

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = job.daysOfWeek.includes(day)
      ? job.daysOfWeek.filter(d => d !== day)
      : [...job.daysOfWeek, day].sort((a, b) => a - b);

    onUpdateDays(newDays);
  };

  const cronExpression = generateCronExpression(job.daysOfWeek, job.timeOfDay);
  const selectedTemplate = templates.find(t => t.id === job.templateId);

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      {/* Compact header with toggle and actions */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
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
            <h3 className="text-base font-semibold text-gray-900">{job.name}</h3>
            <p className="text-xs text-gray-500 truncate">{job.description}</p>
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
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
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
        <div className="grid grid-cols-3 gap-3 text-sm">
          {/* Days - inline badges */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Jours d'exécution
            </label>
            <div className="flex flex-wrap gap-1">
              {allDays.map(day => (
                <button
                  key={day}
                  onClick={() => handleDayToggle(day)}
                  disabled={!globalEnabled || !job.enabled}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    job.daysOfWeek.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  } ${!globalEnabled || !job.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {getDayShortName(day)}
                </button>
              ))}
            </div>
          </div>

          {/* Time - compact input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Heure d'exécution (Europe/Brussels)
            </label>
            <input
              type="time"
              value={job.timeOfDay}
              onChange={(e) => onUpdateTime(e.target.value)}
              disabled={!globalEnabled || !job.enabled}
              className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Minimum count - compact input */}
          {job.minimumCount !== undefined && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Nombre minimum d'items pour envoyer
              </label>
              <input
                type="number"
                min="0"
                value={job.minimumCount}
                onChange={(e) => onUpdateMinimumCount(parseInt(e.target.value, 10))}
                disabled={!globalEnabled || !job.enabled}
                className="block w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-0.5 text-xs text-gray-500">
                L'email ne sera pas envoyé s'il y a moins de {job.minimumCount} demande(s)
              </p>
            </div>
          )}
        </div>

        {/* Recipients - inline badges */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Destinataires
          </label>
          <div className="flex flex-wrap gap-1.5">
            {job.recipients.roles.map(role => (
              <span
                key={role}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        {/* Template selector with preview */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Template d'email
          </label>
          <div className="flex gap-2">
            <select
              value={job.templateId || ''}
              onChange={(e) => onUpdateTemplate(e.target.value)}
              disabled={!globalEnabled || !job.enabled}
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">(Template par défaut - hardcodé)</option>
              {templates.map((template) => (
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
              className="px-3 py-1 text-xs bg-gray-100 text-gray-700 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
              title="Gérer les templates"
            >
              ⚙️ Gérer
            </button>
          </div>
          {!job.templateId && !showTemplatePreview && (
            <p className="mt-0.5 text-xs text-gray-500">
              💡 Template hardcodé utilisé
            </p>
          )}
          {job.templateId && !showTemplatePreview && selectedTemplate && (
            <p className="mt-0.5 text-xs text-blue-600">
              ✓ {selectedTemplate.name}
            </p>
          )}
        </div>

        {/* Template preview */}
        {showTemplatePreview && (
          <div className="col-span-3 border border-gray-300 rounded-lg overflow-hidden">
            <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {job.templateId && selectedTemplate
                  ? `📄 ${selectedTemplate.name}`
                  : '📄 Template par défaut (hardcodé)'}
              </span>
              <button
                onClick={() => setShowTemplatePreview(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-3 bg-white max-h-64 overflow-y-auto text-xs">
              {job.templateId && selectedTemplate ? (
                <div>
                  <div className="mb-2 pb-2 border-b border-gray-200">
                    <p className="font-semibold text-gray-700">Sujet:</p>
                    <p className="text-gray-900 font-mono text-xs bg-gray-50 px-2 py-1 rounded mt-1">
                      {selectedTemplate.subject}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 mb-1">Contenu HTML:</p>
                    <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">
                      {selectedTemplate.htmlContent.substring(0, 500)}
                      {selectedTemplate.htmlContent.length > 500 && '...'}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="font-semibold text-gray-700">Sujet:</p>
                    <p className="text-gray-900 bg-gray-50 px-2 py-1 rounded mt-1">
                      📧 [count] demande(s) de remboursement en attente
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700">Contenu:</p>
                    <p className="text-gray-600 bg-gray-50 p-2 rounded mt-1">
                      Email HTML avec:<br/>
                      • En-tête avec gradient bleu<br/>
                      • Résumé avec nombre de demandes et montant total<br/>
                      • Alerte urgence si demandes {'>'} 7 jours<br/>
                      • Tableau détaillé des demandes<br/>
                      • Bouton "Consulter les demandes"<br/>
                      • Footer CalyCompta
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom bar with cron and test button */}
        <div className="col-span-3 flex items-center justify-between pt-2 border-t border-gray-200">
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <div>
              <span className="font-semibold">Cron:</span>{' '}
              <code className="bg-gray-100 px-1.5 py-0.5 rounded">{cronExpression}</code>
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
  onSave: (job: CommunicationJob) => void;
  onCancel: () => void;
}

function JobEditModal({ job, templates, onSave, onCancel }: JobEditModalProps) {
  const [editedJob, setEditedJob] = useState<CommunicationJob>(job);
  const allDays: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 0]; // Lun-Dim

  const handleDayToggle = (day: DayOfWeek) => {
    const newDays = editedJob.daysOfWeek.includes(day)
      ? editedJob.daysOfWeek.filter(d => d !== day)
      : [...editedJob.daysOfWeek, day].sort((a, b) => a - b);

    setEditedJob(prev => ({ ...prev, daysOfWeek: newDays }));
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

  const emailTypes: { value: CommunicationEmailType; label: string }[] = [
    { value: 'pending_demands_reminder', label: 'Rappel demandes en attente' },
    { value: 'accounting_codes_daily', label: 'Codes comptables quotidiens' },
    { value: 'weekly_summary', label: 'Résumé hebdomadaire' },
    { value: 'monthly_report', label: 'Rapport mensuel' },
  ];

  const roles: ('superadmin' | 'admin' | 'validateur' | 'user')[] = ['superadmin', 'admin', 'validateur', 'user'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between border-b pb-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {job.id.startsWith('job-') && !job.lastRun ? 'Nouveau job' : 'Modifier le job'}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Job name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nom du job *
            </label>
            <input
              type="text"
              value={editedJob.name}
              onChange={(e) => setEditedJob(prev => ({ ...prev, name: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description *
            </label>
            <textarea
              value={editedJob.description}
              onChange={(e) => setEditedJob(prev => ({ ...prev, description: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              required
            />
          </div>

          {/* Email type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type d'email *
            </label>
            <select
              value={editedJob.emailType}
              onChange={(e) => {
                const emailType = e.target.value as CommunicationEmailType;
                setEditedJob(prev => ({
                  ...prev,
                  emailType,
                  description: getDefaultJobDescription(emailType),
                }));
              }}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {getDayShortName(day)}
                </button>
              ))}
            </div>
            {editedJob.daysOfWeek.length === 0 && (
              <p className="mt-1 text-sm text-red-600">Au moins un jour doit être sélectionné</p>
            )}
          </div>

          {/* Time */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Heure d'exécution (Europe/Brussels) *
            </label>
            <input
              type="time"
              value={editedJob.timeOfDay}
              onChange={(e) => setEditedJob(prev => ({ ...prev, timeOfDay: e.target.value }))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          {/* Recipients - Roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
            {editedJob.recipients.roles.length === 0 && (
              <p className="mt-1 text-sm text-red-600">Au moins un rôle doit être sélectionné</p>
            )}
          </div>

          {/* Template selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template d'email
            </label>
            <select
              value={editedJob.templateId || ''}
              onChange={(e) => setEditedJob(prev => ({ ...prev, templateId: e.target.value || undefined }))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">(Template par défaut - hardcodé)</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} - {template.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {editedJob.templateId
                ? '✓ Template personnalisé sélectionné'
                : '💡 Aucun template sélectionné - le système utilisera le template hardcodé'}
            </p>
          </div>

          {/* Include details */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="includeDetails"
              checked={editedJob.includeDetails}
              onChange={(e) => setEditedJob(prev => ({ ...prev, includeDetails: e.target.checked }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="includeDetails" className="ml-2 block text-sm text-gray-700">
              Inclure les détails (tableau) dans l'email
            </label>
          </div>

          {/* Minimum count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre minimum d'items pour envoyer
            </label>
            <input
              type="number"
              min="0"
              value={editedJob.minimumCount || 0}
              onChange={(e) => setEditedJob(prev => ({ ...prev, minimumCount: parseInt(e.target.value, 10) }))}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              L'email ne sera pas envoyé s'il y a moins de {editedJob.minimumCount || 0} item(s)
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
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
