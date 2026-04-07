/**
 * Type definitions for Automated Jobs system
 *
 * Scheduled jobs for automated maintenance tasks (separate from communication jobs)
 * Examples: auto-close past events, data cleanup, backups
 *
 * @see docs/FIELD_NAMING_STANDARDIZATION.md
 */

/**
 * Available automated job types
 */
export type AutomatedJobType =
  | 'auto_close_events'   // Automatically close events with past end dates
  | 'data_cleanup'        // Clean up old data (future)
  | 'backup'              // Automated backups (future)
  | 'ponto_sync';         // Sync bank transactions via Ponto AIS

/**
 * Days of week for scheduling (0 = Sunday, 6 = Saturday)
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Options specific to auto-close events job
 */
export interface AutoCloseEventsOptions {
  /**
   * Number of days after end_date before auto-closing
   * 0 = close immediately after end date
   * 7 = wait 7 days after end date
   */
  gracePeriodDays: number;

  /**
   * Also migrate French status names to English
   * 'ouvert' → 'open', 'ferme' → 'closed', etc.
   */
  migrateStatusNames: boolean;

  /**
   * Send email notification to admins when events are closed
   */
  notifyAdmins: boolean;

  /**
   * Only close operations with type='evenement'
   * If false, closes all operation types
   */
  onlyCloseEventType: boolean;
}

/**
 * Options for future data cleanup job
 */
export interface DataCleanupOptions {
  retentionDays: number;
  includeDeletedItems: boolean;
}

/**
 * Options for future backup job
 */
export interface BackupOptions {
  includeDocuments: boolean;
  compressionEnabled: boolean;
}

/**
 * Options for Ponto AIS bank sync job
 */
export interface PontoSyncOptions {
  /**
   * Sync all connected accounts
   * If false, only sync accounts specified in accountIds
   */
  syncAllAccounts: boolean;

  /**
   * Specific account IDs to sync (used when syncAllAccounts is false)
   */
  accountIds?: string[];

  /**
   * Only import new transactions (not already in Firestore)
   */
  importNewOnly: boolean;

  /**
   * Trigger automatic matching after import
   */
  triggerMatching: boolean;
}

/**
 * Union type of all job options
 */
export type AutomatedJobOptions =
  | AutoCloseEventsOptions
  | DataCleanupOptions
  | BackupOptions
  | PontoSyncOptions;

/**
 * Automated job configuration
 * Stored in Firestore: clubs/{clubId}/settings/automated_jobs
 */
export interface AutomatedJob {
  /** Unique job identifier */
  id: string;

  /** Human-readable job name */
  name: string;

  /** Job description */
  description: string;

  /** Job type (determines which handler executes it) */
  jobType: AutomatedJobType;

  /** Enable/disable this specific job */
  enabled: boolean;

  // ========== SCHEDULE ==========
  /** Days of week to run (0-6, where 0=Sunday) */
  daysOfWeek: DayOfWeek[];

  /**
   * Time of day to run (24h format, Europe/Brussels timezone)
   * Format: "HH:MM" (e.g., "03:00", "14:30")
   */
  timeOfDay: string;

  // ========== JOB-SPECIFIC OPTIONS ==========
  /** Job-specific configuration options */
  options: AutomatedJobOptions;

  // ========== METADATA ==========
  createdAt: Date;
  updatedAt: Date;

  /** Last execution timestamp */
  lastRun?: Date;

  /** Whether last execution succeeded */
  lastRunSuccess?: boolean;

  /** Statistics from last run (items processed, errors, etc.) */
  lastRunStats?: Record<string, any>;
}

/**
 * Global automated jobs settings
 * Stored in Firestore: clubs/{clubId}/settings/automated_jobs
 */
export interface AutomatedJobsSettings {
  /** Master toggle - disable all automated jobs */
  enabled: boolean;

  /** Array of configured jobs */
  jobs: AutomatedJob[];

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Log entry for automated job execution
 * Stored in Firestore: clubs/{clubId}/automated_jobs_logs/{logId}
 *
 * Note: Logs are immutable (write-only by Cloud Functions)
 */
export interface AutomatedJobLog {
  /** Job ID that was executed */
  jobId: string;

  /** Type of job */
  jobType: AutomatedJobType;

  /** Execution timestamp */
  timestamp: Date;

  /** Whether execution succeeded */
  success: boolean;

  /** Number of items processed */
  itemCount: number;

  /** Error message if failed */
  errorMessage?: string;

  /** Detailed execution information */
  details?: Record<string, any>;

  /** Execution duration in milliseconds */
  durationMs?: number;
}

/**
 * Statistics for auto-close events job
 */
export interface AutoCloseEventsStats {
  /** Total operations scanned */
  totalScanned: number;

  /** Operations closed */
  closed: number;

  /** Operations already closed (skipped) */
  alreadyClosed: number;

  /** Operations skipped (cancelled, no end date, etc.) */
  skipped: number;

  /** Errors encountered */
  errors: number;

  /** Status names migrated (if enabled) */
  migrated?: number;

  /** List of closed event IDs and titles */
  closedEvents: Array<{ id: string; titre: string; endDate: string }>;
}

/**
 * Statistics for Ponto sync job
 */
export interface PontoSyncStats {
  /** Number of accounts synced */
  accountsSynced: number;

  /** Total transactions fetched from Ponto */
  transactionsFetched: number;

  /** New transactions imported */
  newTransactions: number;

  /** Transactions already existing (skipped) */
  existingTransactions: number;

  /** Errors encountered */
  errors: number;

  /** List of synced accounts */
  syncedAccounts: Array<{ id: string; iban: string; name: string }>;
}

/**
 * Helper function to get default job description
 */
export function getDefaultJobDescription(jobType: AutomatedJobType): string {
  switch (jobType) {
    case 'auto_close_events':
      return 'Ferme automatiquement les événements dont la date de fin est dépassée';
    case 'data_cleanup':
      return 'Nettoie les données anciennes selon la politique de rétention';
    case 'backup':
      return 'Crée des sauvegardes automatiques des données';
    case 'ponto_sync':
      return 'Importe automatiquement les transactions bancaires via Ponto';
    default:
      return 'Job automatisé';
  }
}

/**
 * Helper function to get default job name
 */
export function getDefaultJobName(jobType: AutomatedJobType): string {
  switch (jobType) {
    case 'auto_close_events':
      return 'Fermeture événements passés';
    case 'data_cleanup':
      return 'Nettoyage données';
    case 'backup':
      return 'Sauvegarde automatique';
    case 'ponto_sync':
      return 'Synchronisation Ponto';
    default:
      return 'Job automatisé';
  }
}

/**
 * Helper function to get default options for a job type
 */
export function getDefaultJobOptions(jobType: AutomatedJobType): AutomatedJobOptions {
  switch (jobType) {
    case 'auto_close_events':
      return {
        gracePeriodDays: 0,
        migrateStatusNames: true,
        notifyAdmins: false,
        onlyCloseEventType: true
      } as AutoCloseEventsOptions;

    case 'data_cleanup':
      return {
        retentionDays: 365,
        includeDeletedItems: true
      } as DataCleanupOptions;

    case 'backup':
      return {
        includeDocuments: true,
        compressionEnabled: true
      } as BackupOptions;

    case 'ponto_sync':
      return {
        syncAllAccounts: true,
        importNewOnly: true,
        triggerMatching: false
      } as PontoSyncOptions;

    default:
      return {} as AutomatedJobOptions;
  }
}

/**
 * Generate cron expression from job schedule
 * Format: "minutes hours * * daysOfWeek"
 */
export function generateCronExpression(job: Pick<AutomatedJob, 'timeOfDay' | 'daysOfWeek'>): string {
  const [hours, minutes] = job.timeOfDay.split(':');
  const daysStr = job.daysOfWeek.join(',');
  return `${minutes} ${hours} * * ${daysStr}`;
}

/**
 * Parse cron expression to job schedule
 */
export function parseCronExpression(cron: string): Pick<AutomatedJob, 'timeOfDay' | 'daysOfWeek'> {
  const parts = cron.split(' ');
  const [minutes, hours, , , daysStr] = parts;

  return {
    timeOfDay: `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`,
    daysOfWeek: daysStr.split(',').map(d => parseInt(d, 10) as DayOfWeek)
  };
}
