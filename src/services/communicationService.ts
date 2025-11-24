/**
 * Communication Service
 * Service pour gérer les jobs de communication automatisée
 */

import type { CommunicationJob, CommunicationEmailType, DayOfWeek } from '@/types/communication';

/**
 * Générer un ID unique pour un job
 */
export function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Créer un nouveau job avec valeurs par défaut
 */
export function createNewJob(
  emailType: CommunicationEmailType = 'pending_demands_reminder'
): CommunicationJob {
  const now = new Date();

  return {
    id: generateJobId(),
    name: 'Nouveau job',
    description: 'Description du job',
    emailType,
    enabled: false,
    daysOfWeek: [1], // Lundi par défaut
    timeOfDay: '09:00',
    recipients: {
      roles: ['admin', 'validateur'],
    },
    includeDetails: true,
    minimumCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Dupliquer un job existant
 */
export function duplicateJob(job: CommunicationJob): CommunicationJob {
  const now = new Date();

  return {
    ...job,
    id: generateJobId(),
    name: `${job.name} (copie)`,
    enabled: false, // Désactivé par défaut
    createdAt: now,
    updatedAt: now,
    lastRun: undefined,
    lastRunSuccess: undefined,
  };
}

/**
 * Valider la configuration d'un job
 */
export function validateJob(job: CommunicationJob): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!job.name || job.name.trim().length === 0) {
    errors.push('Le nom du job est obligatoire');
  }

  if (!job.description || job.description.trim().length === 0) {
    errors.push('La description du job est obligatoire');
  }

  if (job.daysOfWeek.length === 0) {
    errors.push('Au moins un jour de la semaine doit être sélectionné');
  }

  if (!job.timeOfDay || !/^\d{2}:\d{2}$/.test(job.timeOfDay)) {
    errors.push('L\'heure doit être au format HH:MM');
  }

  if (job.recipients.roles.length === 0 && (!job.recipients.additionalEmails || job.recipients.additionalEmails.length === 0)) {
    errors.push('Au moins un destinataire (rôle ou email) doit être défini');
  }

  if (job.minimumCount !== undefined && job.minimumCount < 0) {
    errors.push('Le nombre minimum d\'items doit être positif');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper pour obtenir le nom d'un type d'email
 */
export function getEmailTypeName(emailType: CommunicationEmailType): string {
  switch (emailType) {
    case 'pending_demands_reminder':
      return 'Rappel demandes en attente';
    case 'accounting_codes_daily':
      return 'Codes comptables quotidiens';
    case 'weekly_summary':
      return 'Résumé hebdomadaire';
    case 'monthly_report':
      return 'Rapport mensuel';
    default:
      return emailType;
  }
}

/**
 * Helper pour obtenir la description par défaut d'un type d'email
 */
export function getDefaultJobDescription(emailType: CommunicationEmailType): string {
  switch (emailType) {
    case 'pending_demands_reminder':
      return 'Envoie un email aux validateurs avec la liste des demandes de remboursement à approuver';
    case 'accounting_codes_daily':
      return 'Envoie un rapport quotidien des codes comptables utilisés avec leurs transactions';
    case 'weekly_summary':
      return 'Envoie un résumé hebdomadaire des activités du club';
    case 'monthly_report':
      return 'Envoie un rapport mensuel avec les statistiques financières';
    default:
      return 'Description du job';
  }
}
