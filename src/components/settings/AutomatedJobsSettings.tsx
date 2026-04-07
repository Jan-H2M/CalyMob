import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from './SettingsHeader';
import {
  Clock,
  Plus,
  Trash2,
  Copy,
  Edit,
  Play,
  Calendar,
  Settings as SettingsIcon,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Link,
  Unlink,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getAutomatedJobsSettings,
  saveAutomatedJobsSettings,
  addAutomatedJob,
  updateAutomatedJob,
  deleteAutomatedJob,
  duplicateAutomatedJob,
  toggleAutomatedJobs,
  toggleAutomatedJob,
  initializeAutomatedJobsSettings
} from '@/services/automatedJobsService';
import type {
  AutomatedJobsSettings as AutomatedJobsSettingsType,
  AutomatedJob,
  AutomatedJobType,
  DayOfWeek,
  AutoCloseEventsOptions,
  PontoSyncOptions
} from '@/types/automatedJobs.types';
import {
  getDefaultJobName,
  getDefaultJobDescription,
  getDefaultJobOptions,
  generateCronExpression
} from '@/types/automatedJobs.types';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export function AutomatedJobsSettings() {
  const { clubId } = useAuth();
  const [settings, setSettings] = useState<AutomatedJobsSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingJob, setEditingJob] = useState<AutomatedJob | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [showTestResult, setShowTestResult] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showJobTypeSelector, setShowJobTypeSelector] = useState(false);

  // Load settings
  useEffect(() => {
    loadSettings();
  }, [clubId]);

  async function loadSettings() {
    if (!clubId) return;

    try {
      setLoading(true);
      let data = await getAutomatedJobsSettings(clubId);

      if (!data) {
        // Initialize if doesn't exist
        data = await initializeAutomatedJobsSettings(clubId);
      }

      setSettings(data);
    } catch (error) {
      logger.error('Error loading automated jobs settings:', error);
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  }

  // Toggle global enable/disable
  async function handleToggleGlobal(enabled: boolean) {
    if (!clubId) return;

    try {
      await toggleAutomatedJobs(clubId, enabled);
      setSettings(prev => prev ? { ...prev, enabled } : null);
      toast.success(enabled ? 'Tâches automatisées activées' : 'Tâches automatisées désactivées');
    } catch (error) {
      logger.error('Error toggling automated jobs:', error);
      toast.error('Erreur lors de la modification');
    }
  }

  // Toggle individual job
  async function handleToggleJob(jobId: string, enabled: boolean) {
    if (!clubId) return;

    try {
      await toggleAutomatedJob(clubId, jobId, enabled);
      setSettings(prev => {
        if (!prev) return null;
        return {
          ...prev,
          jobs: prev.jobs.map(j => j.id === jobId ? { ...j, enabled } : j)
        };
      });
      toast.success(enabled ? 'Job activé' : 'Job désactivé');
    } catch (error) {
      logger.error('Error toggling job:', error);
      toast.error('Erreur lors de la modification');
    }
  }

  // Create new job
  function handleCreateJob(jobType: AutomatedJobType = 'auto_close_events') {
    const newJob: AutomatedJob = {
      id: `temp_${Date.now()}`,
      name: '',
      description: '',
      jobType,
      enabled: true,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      timeOfDay: '03:00',
      options: getDefaultJobOptions(jobType),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setEditingJob(newJob);
    setShowJobModal(true);
  }

  // Edit existing job
  function handleEditJob(job: AutomatedJob) {
    setEditingJob({ ...job });
    setShowJobModal(true);
  }

  // Save job (create or update)
  async function handleSaveJob() {
    if (!clubId || !editingJob) return;

    try {
      if (editingJob.id.startsWith('temp_')) {
        // Create new job
        await addAutomatedJob(
          clubId,
          editingJob.jobType,
          editingJob.name || getDefaultJobName(editingJob.jobType),
          editingJob.description || getDefaultJobDescription(editingJob.jobType)
        );
      } else {
        // Update existing job
        await updateAutomatedJob(clubId, editingJob.id, editingJob);
      }

      await loadSettings();
      setShowJobModal(false);
      setEditingJob(null);
      toast.success('Job enregistré avec succès');
    } catch (error) {
      logger.error('Error saving job:', error);
      toast.error('Erreur lors de l\'enregistrement');
    }
  }

  // Delete job
  async function handleDeleteJob(jobId: string) {
    if (!clubId) return;

    try {
      await deleteAutomatedJob(clubId, jobId);
      await loadSettings();
      setShowDeleteConfirm(null);
      toast.success('Job supprimé');
    } catch (error) {
      logger.error('Error deleting job:', error);
      toast.error('Erreur lors de la suppression');
    }
  }

  // Duplicate job
  async function handleDuplicateJob(jobId: string) {
    if (!clubId) return;

    try {
      await duplicateAutomatedJob(clubId, jobId);
      await loadSettings();
      toast.success('Job dupliqué');
    } catch (error) {
      logger.error('Error duplicating job:', error);
      toast.error('Erreur lors de la duplication');
    }
  }

  // Dry run / Test job
  async function handleTestJob(job: AutomatedJob) {
    if (!clubId) return;

    setTesting(true);

    try {
      // Check if API is available (production/deployed) or use local simulation
      const isDevelopment = window.location.hostname === 'localhost';

      if (isDevelopment) {
        // Local simulation for development
        toast.success('Simulation locale du test...');

        const simulatedResult = {
          success: true,
          jobName: job.name,
          jobType: job.jobType,
          dryRun: true,
          duration: 123,
          wouldProcess: 0,
          stats: {
            totalScanned: 5,
            wouldClose: 0,
            alreadyClosed: 2,
            skipped: 3
          },
          preview: [],
          config: job.options,
          message: 'Simulation locale - déployez sur Vercel pour tester avec de vraies données'
        };

        setTestResult(simulatedResult);
        setShowTestResult(true);
        toast.success('Simulation terminée (mode développement)');
      } else {
        // Production: call real API
        const response = await fetch('/api/test-automated-job', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clubId,
            jobId: job.id
          })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erreur lors du test');
        }

        setTestResult(result);
        setShowTestResult(true);
        toast.success(`Test du job "${job.name}" terminé`);
      }
    } catch (error) {
      logger.error('Error testing job:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors du test');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-7xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Tâches Automatisées', 'Configuration']}
            title="Configuration des Jobs"
          />
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-calypso-blue"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-7xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Tâches Automatisées', 'Configuration']}
            title="Configuration des Jobs"
          />
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-red-800 dark:text-red-200">Erreur lors du chargement des paramètres</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Tâches Automatisées', 'Configuration']}
          title="Configuration des Jobs"
          description="Créez et gérez les tâches automatisées planifiées"
        />

        {/* Master Toggle */}
        <div className="mb-6 bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Tâches Automatisées
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  Activer ou désactiver tous les jobs planifiés
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggleGlobal(!settings.enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.enabled
                  ? 'bg-calypso-blue dark:bg-calypso-aqua'
                  : 'bg-gray-200 dark:bg-gray-700'
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

        {/* Jobs List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
              Jobs configurés ({settings.jobs.length})
            </h3>
            <div className="relative">
              <button
                onClick={() => setShowJobTypeSelector(!showJobTypeSelector)}
                className="flex items-center gap-2 px-4 py-2 bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:bg-opacity-90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Nouveau job</span>
              </button>
              {showJobTypeSelector && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl border border-gray-200 dark:border-dark-border z-50">
                  <div className="py-2">
                    <button
                      onClick={() => {
                        handleCreateJob('auto_close_events');
                        setShowJobTypeSelector(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50"
                    >
                      <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                        Fermeture événements
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Ferme automatiquement les événements passés
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        handleCreateJob('ponto_sync');
                        setShowJobTypeSelector(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50"
                    >
                      <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                        Synchronisation Ponto
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Importe les transactions bancaires via Ponto
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        handleCreateJob('data_cleanup');
                        setShowJobTypeSelector(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                        Nettoyage données
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Bientôt disponible
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        handleCreateJob('backup');
                        setShowJobTypeSelector(false);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                        Sauvegarde
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                        Bientôt disponible
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {settings.jobs.length === 0 ? (
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-8 text-center">
              <Clock className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mx-auto mb-3" />
              <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
                Aucun job configuré
              </p>
              <button
                onClick={() => setShowJobTypeSelector(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:bg-opacity-90 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Créer votre premier job</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {settings.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  globalEnabled={settings.enabled}
                  onToggle={(enabled) => handleToggleJob(job.id, enabled)}
                  onEdit={() => handleEditJob(job)}
                  onDelete={() => setShowDeleteConfirm(job.id)}
                  onDuplicate={() => handleDuplicateJob(job.id)}
                  onTest={() => handleTestJob(job)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Job Edit Modal */}
        {showJobModal && editingJob && (
          <JobEditModal
            job={editingJob}
            onSave={handleSaveJob}
            onCancel={() => {
              setShowJobModal(false);
              setEditingJob(null);
            }}
            onChange={setEditingJob}
          />
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <DeleteConfirmModal
            jobName={settings.jobs.find(j => j.id === showDeleteConfirm)?.name || ''}
            onConfirm={() => handleDeleteJob(showDeleteConfirm)}
            onCancel={() => setShowDeleteConfirm(null)}
          />
        )}

        {/* Test Result Modal */}
        {showTestResult && testResult && (
          <TestResultModal
            result={testResult}
            onClose={() => {
              setShowTestResult(false);
              setTestResult(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

// Job Card Component
interface JobCardProps {
  job: AutomatedJob;
  globalEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTest: () => void;
}

function JobCard({ job, globalEnabled, onToggle, onEdit, onDelete, onDuplicate, onTest }: JobCardProps) {
  const isActive = globalEnabled && job.enabled;
  const cronExpression = generateCronExpression(job);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
              {job.name || getDefaultJobName(job.jobType)}
            </h4>
            <span className={`px-2 py-1 text-xs rounded-full ${
              isActive
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-700 dark:text-dark-text-primary dark:text-gray-300'
            }`}>
              {isActive ? 'Actif' : 'Inactif'}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-3">
            {job.description || getDefaultJobDescription(job.jobType)}
          </p>

          {/* Schedule Info */}
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dark-text-secondary">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>
                {job.daysOfWeek.length === 7
                  ? 'Tous les jours'
                  : job.daysOfWeek.map(d => DAY_LABELS[d]).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{job.timeOfDay}</span>
            </div>
          </div>

          {/* Last Run Info */}
          {job.lastRun && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-text-muted">
              {job.lastRunSuccess ? (
                <CheckCircle2 className="h-3 w-3 text-green-600" />
              ) : (
                <XCircle className="h-3 w-3 text-red-600" />
              )}
              <span>
                Dernière exécution: {new Date(job.lastRun).toLocaleString('fr-BE')}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onToggle(!job.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              job.enabled
                ? 'bg-calypso-blue dark:bg-calypso-aqua'
                : 'bg-gray-200 dark:bg-gray-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                job.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-dark-border">
        <button
          onClick={onTest}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <Play className="h-4 w-4" />
          <span>Test</span>
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 rounded-lg transition-colors"
        >
          <Edit className="h-4 w-4" />
          <span>Modifier</span>
        </button>
        <button
          onClick={onDuplicate}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 rounded-lg transition-colors"
        >
          <Copy className="h-4 w-4" />
          <span>Dupliquer</span>
        </button>
        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors ml-auto"
        >
          <Trash2 className="h-4 w-4" />
          <span>Supprimer</span>
        </button>
      </div>
    </div>
  );
}

// Job Edit Modal Component
interface JobEditModalProps {
  job: AutomatedJob;
  onSave: () => void;
  onCancel: () => void;
  onChange: (job: AutomatedJob) => void;
}

function JobEditModal({ job, onSave, onCancel, onChange }: JobEditModalProps) {
  const isNew = job.id.startsWith('temp_');

  function toggleDay(day: DayOfWeek) {
    const newDays = job.daysOfWeek.includes(day)
      ? job.daysOfWeek.filter(d => d !== day)
      : [...job.daysOfWeek, day].sort((a, b) => a - b);

    onChange({ ...job, daysOfWeek: newDays as DayOfWeek[] });
  }

  function updateAutoCloseOptions(updates: Partial<AutoCloseEventsOptions>) {
    onChange({
      ...job,
      options: { ...job.options, ...updates } as AutoCloseEventsOptions
    });
  }

  function updatePontoOptions(updates: Partial<PontoSyncOptions>) {
    onChange({
      ...job,
      options: { ...job.options, ...updates } as PontoSyncOptions
    });
  }

  const autoCloseOptions = job.options as AutoCloseEventsOptions;
  const pontoOptions = job.options as PontoSyncOptions;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-6">
            {isNew ? 'Nouveau Job' : 'Modifier le Job'}
          </h2>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Nom du job
            </label>
            <input
              type="text"
              value={job.name}
              onChange={(e) => onChange({ ...job, name: e.target.value })}
              placeholder={getDefaultJobName(job.jobType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Description
            </label>
            <textarea
              value={job.description}
              onChange={(e) => onChange({ ...job, description: e.target.value })}
              placeholder={getDefaultJobDescription(job.jobType)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Days of Week */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Jours d'exécution
            </label>
            <div className="flex gap-2">
              {DAY_LABELS.map((label, index) => (
                <button
                  key={index}
                  onClick={() => toggleDay(index as DayOfWeek)}
                  className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
                    job.daysOfWeek.includes(index as DayOfWeek)
                      ? 'bg-calypso-blue dark:bg-calypso-aqua text-white'
                      : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-700 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Time of Day */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              Heure d'exécution (Europe/Brussels)
            </label>
            <input
              type="time"
              value={job.timeOfDay}
              onChange={(e) => onChange({ ...job, timeOfDay: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Job-Specific Options */}
          {job.jobType === 'auto_close_events' && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Options spécifiques
              </h3>

              {/* Grace Period */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Période de grâce (jours après la date de fin)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={autoCloseOptions.gracePeriodDays}
                  onChange={(e) => updateAutoCloseOptions({ gracePeriodDays: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary"
                />
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                  0 = fermer immédiatement après la date de fin
                </p>
              </div>

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoCloseOptions.migrateStatusNames}
                    onChange={(e) => updateAutoCloseOptions({ migrateStatusNames: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Migrer les noms de statut (FR → EN)
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoCloseOptions.notifyAdmins}
                    onChange={(e) => updateAutoCloseOptions({ notifyAdmins: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Notifier les admins par email
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoCloseOptions.onlyCloseEventType}
                    onChange={(e) => updateAutoCloseOptions({ onlyCloseEventType: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Uniquement les événements (type='evenement')
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Ponto Sync Options */}
          {job.jobType === 'ponto_sync' && (
            <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
              <h3 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Options Ponto
              </h3>

              {/* Ponto Connection Status */}
              <PontoConnectionCard />

              {/* Checkboxes */}
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pontoOptions.syncAllAccounts}
                    onChange={(e) => updatePontoOptions({ syncAllAccounts: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Synchroniser tous les comptes connectés
                  </span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pontoOptions.importNewOnly}
                    onChange={(e) => updatePontoOptions({ importNewOnly: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Importer uniquement les nouvelles transactions
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted ml-6">
                  Les transactions déjà importées seront ignorées (déduplication par hash)
                </p>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pontoOptions.triggerMatching}
                    onChange={(e) => updatePontoOptions({ triggerMatching: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                    Lancer le matching automatique après import
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted ml-6">
                  Tente de relier automatiquement les transactions aux opérations
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={onSave}
              disabled={job.daysOfWeek.length === 0}
              className="flex-1 px-4 py-2 bg-calypso-blue dark:bg-calypso-aqua text-white rounded-lg hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Delete Confirmation Modal
interface DeleteConfirmModalProps {
  jobName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmModal({ jobName, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-full">
            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
            Supprimer le job
          </h3>
        </div>

        <p className="text-gray-600 dark:text-dark-text-secondary mb-6">
          Êtes-vous sûr de vouloir supprimer le job <strong>{jobName}</strong> ? Cette action est irréversible.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// Ponto Connection Card Component
function PontoConnectionCard() {
  const { clubId } = useAuth();
  const [status, setStatus] = useState<{
    connected: boolean;
    status: string;
    message: string;
    connectedAt?: string;
    daysUntilExpiration?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkPontoStatus();
  }, [clubId]);

  async function checkPontoStatus() {
    if (!clubId) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/ponto/status?clubId=${clubId}`);
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      logger.error('Error checking Ponto status:', error);
      setStatus({
        connected: false,
        status: 'error',
        message: 'Erreur lors de la vérification du statut'
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    if (!clubId) return;

    try {
      setConnecting(true);

      // Get authorization URL
      const response = await fetch(`/api/ponto/authorize?clubId=${clubId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la génération du lien');
      }

      // Store code verifier in sessionStorage for callback
      sessionStorage.setItem('ponto_code_verifier', data.codeVerifier);
      sessionStorage.setItem('ponto_state', data.state);

      // Open Ponto authorization in new window
      window.open(data.authorizationUrl, '_blank', 'width=600,height=700');

      toast.success('Fenêtre d\'autorisation ouverte. Suivez les instructions.');

    } catch (error) {
      logger.error('Error connecting to Ponto:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur de connexion');
    } finally {
      setConnecting(false);
    }
  }

  async function handleCompleteConnection() {
    // Check URL for callback parameters
    const urlParams = new URLSearchParams(window.location.search);
    const pontoCode = urlParams.get('ponto_code');
    const pontoState = urlParams.get('ponto_state');
    const pontoConnected = urlParams.get('ponto_connected');
    const pontoError = urlParams.get('ponto_error');

    if (pontoError) {
      toast.error(`Erreur Ponto: ${pontoError}`);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (pontoConnected === 'true') {
      toast.success('Compte Ponto connecté avec succès!');
      checkPontoStatus();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (pontoCode && pontoState) {
      // Complete the OAuth flow
      const codeVerifier = sessionStorage.getItem('ponto_code_verifier');

      if (!codeVerifier) {
        toast.error('Session expirée. Veuillez réessayer.');
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }

      try {
        setConnecting(true);
        const response = await fetch('/api/ponto/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: pontoCode,
            state: pontoState,
            codeVerifier
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Erreur lors de la connexion');
        }

        toast.success('Compte Ponto connecté avec succès!');
        sessionStorage.removeItem('ponto_code_verifier');
        sessionStorage.removeItem('ponto_state');
        checkPontoStatus();

      } catch (error) {
        logger.error('Error completing Ponto connection:', error);
        toast.error(error instanceof Error ? error.message : 'Erreur de connexion');
      } finally {
        setConnecting(false);
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }

  // Check for callback parameters on mount
  useEffect(() => {
    handleCompleteConnection();
  }, []);

  if (loading) {
    return (
      <div className="mb-4 p-4 bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 rounded-lg">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 text-gray-400 dark:text-dark-text-muted animate-spin" />
          <span className="text-sm text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">
            Vérification de la connexion Ponto...
          </span>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  // Connected state
  if (status.connected && status.status === 'connected') {
    return (
      <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/40 rounded-full">
              <Link className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-medium text-green-800 dark:text-green-300">
                Ponto connecté
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {status.daysUntilExpiration !== undefined && status.daysUntilExpiration > 0
                  ? `Token expire dans ${status.daysUntilExpiration} jours`
                  : status.message
                }
              </p>
            </div>
          </div>
          <button
            onClick={checkPontoStatus}
            className="p-2 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 rounded-lg"
            title="Actualiser"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  // Token expired but can refresh
  if (status.status === 'token_expired') {
    return (
      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded-full">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-300">
                Token expiré
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Le token sera rafraîchi automatiquement lors de la prochaine synchronisation.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Authorization expired - needs reconnect
  if (status.status === 'expired') {
    return (
      <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/40 rounded-full">
              <Unlink className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">
                Autorisation expirée
              </p>
              <p className="text-sm text-red-600 dark:text-red-400">
                Veuillez reconnecter votre compte bancaire.
              </p>
            </div>
          </div>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {connecting ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            <span>Reconnecter</span>
          </button>
        </div>
      </div>
    );
  }

  // Not connected
  return (
    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-full">
            <Unlink className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-blue-800 dark:text-blue-300">
              Ponto non connecté
            </p>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Connectez votre compte bancaire pour activer la synchronisation automatique.
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {connecting ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          <span>Connecter Ponto</span>
        </button>
      </div>
    </div>
  );
}

// Test Result Modal
interface TestResultModalProps {
  result: any;
  onClose: () => void;
}

function TestResultModal({ result, onClose }: TestResultModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                <Play className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Résultat du Test (Simulation)
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  {result.jobName} - Mode DRY RUN (aucune modification)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-gray-300"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Stats - Auto Close Events */}
          {result.jobType === 'auto_close_events' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Durée</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {result.duration}ms
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Serait fermé</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {result.wouldProcess || 0}
                </p>
              </div>
              {result.stats?.totalScanned !== undefined && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Scanné</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {result.stats.totalScanned}
                  </p>
                </div>
              )}
              {result.stats?.alreadyClosed !== undefined && (
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Déjà fermé</p>
                  <p className="text-2xl font-bold text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                    {result.stats.alreadyClosed}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Summary Stats - Ponto Sync */}
          {result.jobType === 'ponto_sync' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Durée</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {result.duration}ms
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Serait importé</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {result.wouldProcess || 0}
                </p>
              </div>
              {result.stats?.transactionsFound !== undefined && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Transactions trouvées</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                    {result.stats.transactionsFound}
                  </p>
                </div>
              )}
              {result.stats?.existingTransactions !== undefined && (
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Déjà existants</p>
                  <p className="text-2xl font-bold text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
                    {result.stats.existingTransactions}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Generic Stats (fallback) */}
          {result.jobType !== 'auto_close_events' && result.jobType !== 'ponto_sync' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Durée</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {result.duration}ms
                </p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Serait traité</p>
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {result.wouldProcess || 0}
                </p>
              </div>
            </div>
          )}

          {/* Configuration - Auto Close */}
          {result.config && result.jobType === 'auto_close_events' && (
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Configuration testée
              </h4>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Période de grâce</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.gracePeriodDays} jours
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Type événement uniquement</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.onlyCloseEventType ? 'Oui' : 'Non'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Configuration - Ponto */}
          {result.config && result.jobType === 'ponto_sync' && (
            <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
              <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Configuration testée
              </h4>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Tous les comptes</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.syncAllAccounts ? 'Oui' : 'Non'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Nouvelles seulement</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.importNewOnly ? 'Oui' : 'Non'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Matching automatique</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.triggerMatching ? 'Oui' : 'Non'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-600 dark:text-dark-text-secondary">Mode</dt>
                  <dd className="font-medium text-gray-900 dark:text-dark-text-primary">
                    {result.config.isSandbox ? 'Sandbox (test)' : 'Production'}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          {/* Preview of events that would be closed */}
          {result.preview && result.preview.length > 0 && result.jobType === 'auto_close_events' && (
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Aperçu des événements qui seraient fermés ({result.preview.length} premiers)
              </h4>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Titre</th>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Statut actuel</th>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Date fin</th>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Jours dépassés</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {result.preview.map((event: any, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-gray-900 dark:text-dark-text-primary font-medium">
                          {event.titre}
                        </td>
                        <td className="px-4 py-2">
                          <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                            {event.currentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary">
                          {event.endDate}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary">
                          {event.daysOverdue} jours
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Preview of transactions that would be imported */}
          {result.preview && result.preview.length > 0 && result.jobType === 'ponto_sync' && (
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-dark-text-primary mb-3">
                Aperçu des transactions qui seraient importées ({result.preview.length} premières)
              </h4>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Date</th>
                      <th className="px-4 py-2 text-right text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Montant</th>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Contrepartie</th>
                      <th className="px-4 py-2 text-left text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted">Communication</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {result.preview.map((tx: any, index: number) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary">
                          {tx.date}
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${
                          tx.amount >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} €
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-dark-text-primary">
                          {tx.counterpart || '-'}
                        </td>
                        <td className="px-4 py-2 text-gray-600 dark:text-dark-text-secondary text-xs">
                          {tx.communication || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Message if nothing would be processed */}
          {result.wouldProcess === 0 && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                <p className="text-green-700 dark:text-green-400 font-medium">
                  {result.jobType === 'ponto_sync'
                    ? 'Aucune nouvelle transaction à importer.'
                    : 'Aucun élément ne serait traité avec cette configuration.'
                  }
                </p>
              </div>
              {result.message && (
                <p className="text-sm text-green-600 dark:text-green-500 mt-2">
                  {result.message}
                </p>
              )}
              {result.error && (
                <p className="text-sm text-red-600 dark:text-red-500 mt-2">
                  Erreur: {result.error}
                </p>
              )}
            </div>
          )}

          {/* Error message for Ponto */}
          {result.success === false && result.error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <p className="text-red-700 dark:text-red-400 font-medium">
                  Erreur lors du test
                </p>
              </div>
              <p className="text-sm text-red-600 dark:text-red-500 mt-2">
                {result.error}
              </p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-50 dark:bg-dark-bg-tertiary border-t border-gray-200 dark:border-dark-border p-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
