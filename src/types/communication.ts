/**
 * Communication Module Types
 * Types pour la gestion des jobs de communication planifiés
 */

/**
 * Type d'email de communication
 */
export type CommunicationEmailType =
  | 'pending_demands_reminder'    // Rappel pour demandes en attente
  | 'accounting_codes_daily'       // Codes comptables quotidiens
  | 'weekly_summary'               // Résumé hebdomadaire
  | 'monthly_report';              // Rapport mensuel

/**
 * Jour de la semaine pour scheduling
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi

/**
 * Configuration d'un job de communication planifié
 */
export interface CommunicationJob {
  id: string;
  name: string;
  description: string;
  emailType: CommunicationEmailType;
  enabled: boolean;

  // Schedule configuration
  daysOfWeek: DayOfWeek[];        // Jours où le job doit s'exécuter
  timeOfDay: string;               // Format "HH:MM" (24h, Brussels time)

  // Email configuration
  recipients: {
    roles: ('superadmin' | 'admin' | 'validateur' | 'user')[];  // Rôles qui reçoivent l'email
    additionalEmails?: string[];   // Emails supplémentaires (optionnel)
  };

  // Template configuration
  templateId?: string;             // ID du template d'email à utiliser (optionnel, sinon hardcoded)

  // Options
  includeDetails: boolean;         // Inclure détails (tableau) ou juste résumé
  minimumCount?: number;           // Nombre minimum d'items pour envoyer (optionnel)

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastRun?: Date;
  lastRunSuccess?: boolean;
}

/**
 * Paramètres de communication globaux
 */
export interface CommunicationSettings {
  enabled: boolean;                // Master toggle pour tous les jobs

  // Email sender configuration
  senderName: string;              // Nom affiché (ex: "Calypso Compta")
  senderEmail?: string;            // Email from (optionnel, sinon default Google Mail)

  // Jobs configurés
  jobs: CommunicationJob[];

  // Options globales
  enableTestMode: boolean;         // Mode test (envoie uniquement à l'admin qui teste)
  testEmail?: string;              // Email pour le mode test

  // Branding
  includeLogo: boolean;            // Inclure logo Calypso dans les emails
  primaryColor?: string;           // Couleur principale pour branding (hex)

  // Metadata
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Log d'un email envoyé
 */
export interface CommunicationLog {
  id: string;
  jobId: string;
  emailType: CommunicationEmailType;

  // Execution info
  timestamp: Date;
  scheduledTime?: string;          // Heure prévue (HH:MM)
  actualTime: string;              // Heure réelle d'envoi (HH:MM)

  // Recipients
  recipientCount: number;
  recipientEmails: string[];

  // Content info
  subject: string;
  itemCount?: number;              // Nombre d'items inclus (ex: nombre de demandes)

  // Result
  success: boolean;
  error?: string;

  // Metadata
  clubId: string;
}

/**
 * Données pour l'email de rappel des demandes en attente
 */
export interface PendingDemandsEmailData {
  recipientName: string;
  recipientEmail: string;

  demandes: {
    id: string;
    date_depense: Date;
    demandeur_nom: string;
    description: string;
    montant: number;
    statut: string;
    daysWaiting: number;           // Nombre de jours depuis soumission
    isUrgent: boolean;             // True si > 7 jours
  }[];

  totalAmount: number;             // Montant total des demandes
  urgentCount: number;             // Nombre de demandes urgentes

  clubName: string;
  appUrl: string;                  // URL vers l'app (pour CTA button)
}

/**
 * Template d'email
 */
export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody?: string;               // Version texte (fallback)
}

/**
 * Résultat de l'envoi d'email
 */
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Configuration par défaut pour les settings de communication
 */
export const DEFAULT_COMMUNICATION_SETTINGS: CommunicationSettings = {
  enabled: false,
  senderName: 'Calypso Compta',
  jobs: [
    {
      id: 'pending-demands-reminder',
      name: 'Rappel demandes en attente',
      description: 'Envoie un email aux validateurs avec la liste des demandes de remboursement à approuver',
      emailType: 'pending_demands_reminder',
      enabled: false,
      daysOfWeek: [4], // Jeudi
      timeOfDay: '09:00',
      recipients: {
        roles: ['validateur', 'admin', 'superadmin'],
      },
      includeDetails: true,
      minimumCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  enableTestMode: false,
  includeLogo: true,
  updatedAt: new Date(),
};

/**
 * Helper: Convertir DayOfWeek en nom français
 */
export function getDayName(day: DayOfWeek): string {
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[day];
}

/**
 * Helper: Convertir DayOfWeek en nom court français
 */
export function getDayShortName(day: DayOfWeek): string {
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[day];
}

/**
 * Helper: Générer cron expression depuis DayOfWeek[] et timeOfDay
 * @param days Jours de la semaine (0-6)
 * @param time Heure au format "HH:MM"
 * @returns Cron expression (ex: "0 9 * * 1,4" pour lundi et jeudi à 9h)
 */
export function generateCronExpression(days: DayOfWeek[], time: string): string {
  const [hours, minutes] = time.split(':');
  const daysStr = days.join(',');
  return `${minutes} ${hours} * * ${daysStr}`;
}

/**
 * Helper: Parser cron expression vers DayOfWeek[] et timeOfDay
 * @param cron Cron expression (ex: "0 9 * * 1,4")
 * @returns { days, time } ou null si invalid
 */
export function parseCronExpression(cron: string): { days: DayOfWeek[]; time: string } | null {
  const parts = cron.split(' ');
  if (parts.length !== 5) return null;

  const [minutes, hours, , , daysStr] = parts;

  const days = daysStr.split(',').map(d => parseInt(d, 10) as DayOfWeek);
  const time = `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;

  return { days, time };
}
