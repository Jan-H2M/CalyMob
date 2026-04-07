import { logger } from '@/utils/logger';
/**
 * Automated Jobs Service
 *
 * Firestore CRUD operations for automated jobs settings and logs
 */

import { doc, getDoc, setDoc, updateDoc, Timestamp, collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  AutomatedJobsSettings,
  AutomatedJob,
  AutomatedJobType,
  AutomatedJobLog,
  DayOfWeek,
  getDefaultJobName,
  getDefaultJobDescription,
  getDefaultJobOptions
} from '@/types/automatedJobs.types';

// Import helper functions
import {
  getDefaultJobName as _getDefaultJobName,
  getDefaultJobDescription as _getDefaultJobDescription,
  getDefaultJobOptions as _getDefaultJobOptions
} from '@/types/automatedJobs.types';

/**
 * Get automated jobs settings for a club
 */
export async function getAutomatedJobsSettings(clubId: string): Promise<AutomatedJobsSettings | null> {
  try {
    const settingsRef = doc(db, 'clubs', clubId, 'settings', 'automated_jobs');
    const settingsSnap = await getDoc(settingsRef);

    if (!settingsSnap.exists()) {
      return null;
    }

    const data = settingsSnap.data();

    return {
      enabled: data.enabled ?? true,
      jobs: data.jobs?.map((job: any) => convertFirestoreToJob(job)) ?? [],
      updatedAt: data.updatedAt?.toDate() ?? new Date()
    };
  } catch (error) {
    logger.error('Error fetching automated jobs settings:', error);
    throw error;
  }
}

/**
 * Save automated jobs settings
 */
export async function saveAutomatedJobsSettings(
  clubId: string,
  settings: AutomatedJobsSettings
): Promise<void> {
  try {
    const settingsRef = doc(db, 'clubs', clubId, 'settings', 'automated_jobs');

    const dataToSave = {
      enabled: settings.enabled,
      jobs: settings.jobs.map(job => convertJobToFirestore(job)),
      updatedAt: Timestamp.now()
    };

    await setDoc(settingsRef, dataToSave);
  } catch (error) {
    logger.error('Error saving automated jobs settings:', error);
    throw error;
  }
}

/**
 * Initialize default automated jobs settings
 */
export async function initializeAutomatedJobsSettings(clubId: string): Promise<AutomatedJobsSettings> {
  const defaultSettings: AutomatedJobsSettings = {
    enabled: false, // Disabled by default
    jobs: [],
    updatedAt: new Date()
  };

  await saveAutomatedJobsSettings(clubId, defaultSettings);
  return defaultSettings;
}

/**
 * Add a new automated job
 */
export async function addAutomatedJob(
  clubId: string,
  jobType: AutomatedJobType,
  customName?: string,
  customDescription?: string
): Promise<AutomatedJob> {
  const settings = await getAutomatedJobsSettings(clubId) || await initializeAutomatedJobsSettings(clubId);

  const newJob: AutomatedJob = {
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: customName || _getDefaultJobName(jobType),
    description: customDescription || _getDefaultJobDescription(jobType),
    jobType,
    enabled: true,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6] as DayOfWeek[], // Every day by default
    timeOfDay: '03:00', // 3 AM by default
    options: _getDefaultJobOptions(jobType),
    createdAt: new Date(),
    updatedAt: new Date()
  };

  settings.jobs.push(newJob);
  settings.updatedAt = new Date();

  await saveAutomatedJobsSettings(clubId, settings);

  return newJob;
}

/**
 * Update an existing automated job
 */
export async function updateAutomatedJob(
  clubId: string,
  jobId: string,
  updates: Partial<AutomatedJob>
): Promise<void> {
  const settings = await getAutomatedJobsSettings(clubId);

  if (!settings) {
    throw new Error('Automated jobs settings not found');
  }

  const jobIndex = settings.jobs.findIndex(j => j.id === jobId);

  if (jobIndex === -1) {
    throw new Error(`Job with ID ${jobId} not found`);
  }

  settings.jobs[jobIndex] = {
    ...settings.jobs[jobIndex],
    ...updates,
    updatedAt: new Date()
  };

  settings.updatedAt = new Date();

  await saveAutomatedJobsSettings(clubId, settings);
}

/**
 * Delete an automated job
 */
export async function deleteAutomatedJob(clubId: string, jobId: string): Promise<void> {
  const settings = await getAutomatedJobsSettings(clubId);

  if (!settings) {
    throw new Error('Automated jobs settings not found');
  }

  settings.jobs = settings.jobs.filter(j => j.id !== jobId);
  settings.updatedAt = new Date();

  await saveAutomatedJobsSettings(clubId, settings);
}

/**
 * Duplicate an automated job
 */
export async function duplicateAutomatedJob(clubId: string, jobId: string): Promise<AutomatedJob> {
  const settings = await getAutomatedJobsSettings(clubId);

  if (!settings) {
    throw new Error('Automated jobs settings not found');
  }

  const originalJob = settings.jobs.find(j => j.id === jobId);

  if (!originalJob) {
    throw new Error(`Job with ID ${jobId} not found`);
  }

  const duplicatedJob: AutomatedJob = {
    ...originalJob,
    id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `${originalJob.name} (Copie)`,
    enabled: false, // Disabled by default for safety
    createdAt: new Date(),
    updatedAt: new Date(),
    lastRun: undefined,
    lastRunSuccess: undefined,
    lastRunStats: undefined
  };

  settings.jobs.push(duplicatedJob);
  settings.updatedAt = new Date();

  await saveAutomatedJobsSettings(clubId, settings);

  return duplicatedJob;
}

/**
 * Toggle global enable/disable for all jobs
 */
export async function toggleAutomatedJobs(clubId: string, enabled: boolean): Promise<void> {
  const settingsRef = doc(db, 'clubs', clubId, 'settings', 'automated_jobs');

  await updateDoc(settingsRef, {
    enabled,
    updatedAt: Timestamp.now()
  });
}

/**
 * Toggle enable/disable for a specific job
 */
export async function toggleAutomatedJob(clubId: string, jobId: string, enabled: boolean): Promise<void> {
  await updateAutomatedJob(clubId, jobId, { enabled });
}

/**
 * Get automated jobs execution logs
 */
export async function getAutomatedJobsLogs(
  clubId: string,
  options?: {
    jobId?: string;
    jobType?: AutomatedJobType;
    limit?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<AutomatedJobLog[]> {
  try {
    const logsRef = collection(db, 'clubs', clubId, 'automated_jobs_logs');
    let q = query(logsRef, orderBy('timestamp', 'desc'));

    // Apply filters
    if (options?.jobId) {
      q = query(q, where('jobId', '==', options.jobId));
    }

    if (options?.jobType) {
      q = query(q, where('jobType', '==', options.jobType));
    }

    if (options?.startDate) {
      q = query(q, where('timestamp', '>=', Timestamp.fromDate(options.startDate)));
    }

    if (options?.endDate) {
      q = query(q, where('timestamp', '<=', Timestamp.fromDate(options.endDate)));
    }

    // Apply limit
    if (options?.limit) {
      q = query(q, limit(options.limit));
    }

    const logsSnap = await getDocs(q);

    return logsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        jobId: data.jobId,
        jobType: data.jobType,
        timestamp: data.timestamp?.toDate() ?? new Date(),
        success: data.success ?? false,
        itemCount: data.itemCount ?? 0,
        errorMessage: data.errorMessage,
        details: data.details,
        durationMs: data.durationMs
      };
    });
  } catch (error) {
    logger.error('Error fetching automated jobs logs:', error);
    throw error;
  }
}

/**
 * Get recent logs summary (last 24 hours)
 */
export async function getRecentLogsSummary(clubId: string): Promise<{
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastExecution?: Date;
}> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const logs = await getAutomatedJobsLogs(clubId, {
    startDate: yesterday,
    limit: 100
  });

  return {
    totalExecutions: logs.length,
    successfulExecutions: logs.filter(l => l.success).length,
    failedExecutions: logs.filter(l => !l.success).length,
    lastExecution: logs[0]?.timestamp
  };
}

// ========== HELPER FUNCTIONS ==========

/**
 * Convert Firestore data to AutomatedJob
 */
function convertFirestoreToJob(data: any): AutomatedJob {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    jobType: data.jobType,
    enabled: data.enabled ?? true,
    daysOfWeek: data.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: data.timeOfDay ?? '03:00',
    options: data.options ?? {},
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
    lastRun: data.lastRun?.toDate(),
    lastRunSuccess: data.lastRunSuccess,
    lastRunStats: data.lastRunStats
  };
}

/**
 * Convert AutomatedJob to Firestore data
 */
function convertJobToFirestore(job: AutomatedJob): any {
  const data: any = {
    id: job.id,
    name: job.name,
    description: job.description,
    jobType: job.jobType,
    enabled: job.enabled,
    daysOfWeek: job.daysOfWeek,
    timeOfDay: job.timeOfDay,
    options: job.options,
    createdAt: Timestamp.fromDate(job.createdAt),
    updatedAt: Timestamp.fromDate(job.updatedAt)
  };

  // Only include optional fields if they have values (not undefined)
  if (job.lastRun) {
    data.lastRun = Timestamp.fromDate(job.lastRun);
  }

  if (job.lastRunSuccess !== undefined) {
    data.lastRunSuccess = job.lastRunSuccess;
  }

  if (job.lastRunStats !== undefined) {
    data.lastRunStats = job.lastRunStats;
  }

  return data;
}
