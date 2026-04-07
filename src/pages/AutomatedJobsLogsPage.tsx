import { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { useAuth } from '@/contexts/AuthContext';
import { SettingsHeader } from '@/components/settings/SettingsHeader';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Filter,
  Download
} from 'lucide-react';
import {
  getAutomatedJobsLogs,
  getRecentLogsSummary,
  getAutomatedJobsSettings
} from '@/services/automatedJobsService';
import type {
  AutomatedJobLog,
  AutomatedJobType,
  AutomatedJob
} from '@/types/automatedJobs.types';
import { getDefaultJobName } from '@/types/automatedJobs.types';

export function AutomatedJobsLogsPage() {
  const { clubId } = useAuth();
  const [logs, setLogs] = useState<AutomatedJobLog[]>([]);
  const [jobs, setJobs] = useState<AutomatedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterJobType, setFilterJobType] = useState<AutomatedJobType | 'all'>('all');
  const [filterSuccess, setFilterSuccess] = useState<'all' | 'success' | 'failure'>('all');
  const [summary, setSummary] = useState({
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    lastExecution: undefined as Date | undefined
  });

  useEffect(() => {
    loadData();
  }, [clubId]);

  async function loadData() {
    if (!clubId) return;

    try {
      setLoading(true);
      const [logsData, summaryData, settingsData] = await Promise.all([
        getAutomatedJobsLogs(clubId, { limit: 100 }),
        getRecentLogsSummary(clubId),
        getAutomatedJobsSettings(clubId)
      ]);

      setLogs(logsData);
      setSummary(summaryData);
      setJobs(settingsData?.jobs || []);
    } catch (error) {
      logger.error('Error loading logs:', error);
    } finally {
      setLoading(false);
    }
  }

  // Filter logs
  const filteredLogs = logs.filter(log => {
    if (filterJobType !== 'all' && log.jobType !== filterJobType) return false;
    if (filterSuccess === 'success' && !log.success) return false;
    if (filterSuccess === 'failure' && log.success) return false;
    return true;
  });

  // Get job name from ID
  function getJobName(jobId: string): string {
    const job = jobs.find(j => j.id === jobId);
    return job?.name || jobId;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-7xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Tâches Automatisées', 'Historique']}
            title="Historique d'Exécution"
          />
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-calypso-blue"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Tâches Automatisées', 'Historique']}
          title="Historique d'Exécution"
          description="Consultez les logs et statistiques des jobs exécutés"
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total (24h)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {summary.totalExecutions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Succès</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {summary.successfulExecutions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Échecs</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                  {summary.failedExecutions}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Dernière exec.</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary">
                  {summary.lastExecution
                    ? new Date(summary.lastExecution).toLocaleTimeString('fr-BE', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-4 mb-6">
          <div className="flex items-center gap-4">
            <Filter className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary dark:text-dark-text-muted" />
            <div className="flex-1 flex gap-4">
              <div>
                <label className="text-sm text-gray-600 dark:text-dark-text-secondary mr-2">
                  Type de job:
                </label>
                <select
                  value={filterJobType}
                  onChange={(e) => setFilterJobType(e.target.value as AutomatedJobType | 'all')}
                  className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary text-sm"
                >
                  <option value="all">Tous</option>
                  <option value="auto_close_events">Fermeture événements</option>
                  <option value="data_cleanup">Nettoyage données</option>
                  <option value="backup">Sauvegarde</option>
                </select>
              </div>

              <div>
                <label className="text-sm text-gray-600 dark:text-dark-text-secondary mr-2">
                  Statut:
                </label>
                <select
                  value={filterSuccess}
                  onChange={(e) => setFilterSuccess(e.target.value as 'all' | 'success' | 'failure')}
                  className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg-tertiary text-gray-900 dark:text-dark-text-primary text-sm"
                >
                  <option value="all">Tous</option>
                  <option value="success">Succès uniquement</option>
                  <option value="failure">Échecs uniquement</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-gray-600 dark:text-dark-text-secondary">
              Aucun log trouvé
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Date/Heure
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Job
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Items
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Durée
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {filteredLogs.map((log, index) => (
                    <LogRow key={index} log={log} jobName={getJobName(log.jobId)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Log Row Component
interface LogRowProps {
  log: AutomatedJobLog;
  jobName: string;
}

function LogRow({ log, jobName }: LogRowProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-gray-700/50 cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">
          {new Date(log.timestamp).toLocaleString('fr-BE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">
          {jobName}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-text-secondary">
          {log.jobType === 'auto_close_events' && 'Fermeture événements'}
          {log.jobType === 'data_cleanup' && 'Nettoyage données'}
          {log.jobType === 'backup' && 'Sauvegarde'}
        </td>
        <td className="px-4 py-3">
          {log.success ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3" />
              Succès
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
              <XCircle className="h-3 w-3" />
              Échec
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-gray-900 dark:text-dark-text-primary">
          {log.itemCount}
        </td>
        <td className="px-4 py-3 text-sm text-gray-600 dark:text-dark-text-secondary">
          {log.durationMs ? `${(log.durationMs / 1000).toFixed(2)}s` : '-'}
        </td>
      </tr>

      {/* Details Row */}
      {showDetails && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50 dark:bg-dark-bg-tertiary">
            <div className="text-sm">
              {log.errorMessage && (
                <div className="mb-2">
                  <span className="font-semibold text-red-600 dark:text-red-400">Erreur: </span>
                  <span className="text-gray-900 dark:text-dark-text-primary">{log.errorMessage}</span>
                </div>
              )}

              {log.details && (
                <div>
                  <span className="font-semibold text-gray-700 dark:text-dark-text-primary dark:text-gray-300">Détails: </span>
                  <pre className="mt-2 p-2 bg-white dark:bg-dark-bg-secondary rounded border border-gray-200 dark:border-dark-border text-xs overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
