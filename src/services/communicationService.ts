/**
 * Communication Service
 * Service pour gérer les jobs de communication automatisée
 */

import type { CommunicationJob, CommunicationEmailType } from '@/types/communication';

const LEGACY_COMMUNICATION_EMAIL_TYPE_MAPPING: Record<string, CommunicationEmailType> = {
  pending_demands_reminder: 'pending_demands',
  accounting_codes_daily: 'accounting_codes',
};

export const IMPLEMENTED_COMMUNICATION_EMAIL_TYPES: CommunicationEmailType[] = [
  'pending_demands',
  'accounting_codes',
  'bank_validation_pending',
];

export function normalizeCommunicationEmailType(emailType: string | null | undefined): CommunicationEmailType {
  const normalized = LEGACY_COMMUNICATION_EMAIL_TYPE_MAPPING[String(emailType || '')];
  return normalized || (emailType as CommunicationEmailType) || 'pending_demands';
}

export function isImplementedCommunicationEmailType(emailType: CommunicationEmailType): boolean {
  return IMPLEMENTED_COMMUNICATION_EMAIL_TYPES.includes(emailType);
}

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
  emailType: CommunicationEmailType = 'pending_demands'
): CommunicationJob {
  const now = new Date();

  return {
    id: generateJobId(),
    name: getEmailTypeName(emailType),
    description: getDefaultJobDescription(emailType),
    emailType,
    enabled: false,
    daysOfWeek: [1], // Lundi par défaut
    timesOfDay: ['09:00'], // Single time by default, can add up to 4
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
  const normalizedEmailType = normalizeCommunicationEmailType(job.emailType);

  if (!job.name || job.name.trim().length === 0) {
    errors.push('Le nom du job est obligatoire');
  }

  if (!job.description || job.description.trim().length === 0) {
    errors.push('La description du job est obligatoire');
  }

  if (!isImplementedCommunicationEmailType(normalizedEmailType)) {
    errors.push(`Le type d'email "${job.emailType}" n'est pas encore pris en charge par les envois automatiques`);
  }

  if (job.daysOfWeek.length === 0) {
    errors.push('Au moins un jour de la semaine doit être sélectionné');
  }

  // Validate timesOfDay array (new format) or timeOfDay string (legacy)
  const times = job.timesOfDay || (job.timeOfDay ? [job.timeOfDay] : []);
  const validTimes = times.filter(t => t && /^\d{2}:\d{2}$/.test(t));

  if (validTimes.length === 0) {
    errors.push('Au moins une heure d\'exécution doit être définie (format HH:MM)');
  }

  if (validTimes.length > 4) {
    errors.push('Maximum 4 heures d\'exécution par jour');
  }

  const hasRoles = job.recipients.roles.length > 0;
  const hasClubFunctions = job.recipients.clubFunctions && job.recipients.clubFunctions.length > 0;
  const hasAdditionalEmails = job.recipients.additionalEmails && job.recipients.additionalEmails.length > 0;

  if (!hasRoles && !hasClubFunctions && !hasAdditionalEmails) {
    errors.push('Au moins un destinataire (rôle, fonction ou email) doit être défini');
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
    case 'pending_demands':
      return 'Rappel demandes en attente';
    case 'accounting_codes':
      return 'Codes comptables quotidiens';
    case 'weekly_summary':
      return 'Résumé hebdomadaire';
    case 'monthly_report':
      return 'Rapport mensuel';
    case 'bank_validation_pending':
      return 'Rappel validations bancaires';
    default:
      return emailType;
  }
}

/**
 * Helper pour obtenir la description par défaut d'un type d'email
 */
export function getDefaultJobDescription(emailType: CommunicationEmailType): string {
  switch (emailType) {
    case 'pending_demands':
      return 'Envoie un email aux validateurs avec la liste des demandes de remboursement à approuver';
    case 'accounting_codes':
      return 'Envoie un rapport quotidien des codes comptables utilisés avec leurs transactions';
    case 'weekly_summary':
      return 'Envoie un résumé hebdomadaire des activités du club';
    case 'monthly_report':
      return 'Envoie un rapport mensuel avec les statistiques financières';
    case 'bank_validation_pending':
      return 'Envoie un email aux validateurs avec la liste des paiements à valider dans l\'application bancaire';
    default:
      return 'Description du job';
  }
}
