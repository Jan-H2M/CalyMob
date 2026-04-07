/**
 * Communication Module Types
 * Types pour la gestion des jobs de communication planifiés
 */

/**
 * Type d'email de communication
 */
export type CommunicationEmailType =
  | 'pending_demands'              // Rappel pour demandes en attente (matches EmailTemplateType)
  | 'accounting_codes'             // Codes comptables quotidiens (matches EmailTemplateType)
  | 'weekly_summary'               // Résumé hebdomadaire
  | 'monthly_report'               // Rapport mensuel
  | 'bank_validation_pending';     // Rappel validations bancaires

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
  timesOfDay: string[];            // Array of times in format "HH:MM" (24h, Brussels time), max 4
  timeOfDay?: string;              // @deprecated - Use timesOfDay instead. Kept for backwards compatibility

  // Email configuration
  recipients: {
    roles: ('superadmin' | 'admin' | 'validateur' | 'user')[];  // Rôles qui reçoivent l'email
    clubFunctions?: string[];      // Fonctions club (ex: 'CA', 'Encadrants') - filtre sur clubStatuten
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

  // Execution tracking (added to prevent duplicate emails within same time slot)
  executedTimeSlots?: Record<string, string[]>; // { "2026-01-08": ["07:00", "12:00"] }
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
      emailType: 'pending_demands',
      enabled: false,
      daysOfWeek: [4], // Jeudi
      timesOfDay: ['09:00'],
      recipients: {
        roles: ['validateur', 'admin', 'superadmin'],
      },
      includeDetails: true,
      minimumCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'bank-validation-reminder',
      name: 'Rappel validations bancaires',
      description: 'Envoie un email aux validateurs avec la liste des paiements à valider dans l\'application bancaire',
      emailType: 'bank_validation_pending',
      enabled: false,
      daysOfWeek: [1, 3, 5], // Lundi, Mercredi, Vendredi
      timesOfDay: ['09:00'],
      recipients: {
        roles: ['superadmin', 'admin', 'validateur'],
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
 * Helper: Générer cron expression depuis DayOfWeek[] et timesOfDay
 * @param days Jours de la semaine (0-6)
 * @param times Array of times in format "HH:MM" (or single time string for backwards compat)
 * @returns Cron expression (ex: "0 7,12,17 * * 1,4" pour lundi et jeudi à 7h, 12h et 17h)
 */
export function generateCronExpression(days: DayOfWeek[], times: string | string[]): string {
  const timesArray = Array.isArray(times) ? times : [times];
  const validTimes = timesArray.filter(t => t && t.trim() !== '');

  if (validTimes.length === 0) {
    return '0 9 * * *'; // Default fallback
  }

  // Group times by minute to create compact cron expressions
  // For simplicity, if all times have the same minute, we can combine hours
  const parsedTimes = validTimes.map(t => {
    const [hours, minutes] = t.split(':');
    return { hours: parseInt(hours, 10), minutes: parseInt(minutes, 10) };
  });

  // Check if all minutes are the same
  const allSameMinute = parsedTimes.every(t => t.minutes === parsedTimes[0].minutes);
  const daysStr = days.join(',');

  if (allSameMinute) {
    const hoursStr = parsedTimes.map(t => t.hours.toString().padStart(2, '0')).join(',');
    const minutesStr = parsedTimes[0].minutes.toString().padStart(2, '0');
    return `${minutesStr} ${hoursStr} * * ${daysStr}`;
  }

  // If minutes differ, show first time (cron would need multiple entries)
  const [hours, minutes] = validTimes[0].split(':');
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

// ============================================
// Event Messages Types
// ============================================

/**
 * Attachment for messages (images or PDFs)
 */
export interface MessageAttachment {
  type: 'image' | 'pdf';
  url: string;
  filename: string;
  size: number;
}

/**
 * Reply preview for threaded messages
 */
export interface ReplyPreview {
  sender_name: string;
  message_preview: string;
}

/**
 * Message posted in an event by a participant
 */
export interface EventMessage {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: Date;
  read_by?: string[];
  reply_to_id?: string | null;
  reply_to_preview?: ReplyPreview | null;
  attachments?: MessageAttachment[];
}

/**
 * Event message with operation context (for overview page)
 */
export interface EventMessageWithContext extends EventMessage {
  operation_id: string;
  operation_titre: string;
  club_id: string;
}

// ============================================
// Announcement Types
// ============================================

/**
 * Announcement type
 */
export type AnnonceType = 'info' | 'warning' | 'urgent';

/**
 * Club announcement
 */
export interface Annonce {
  id: string;
  title: string;
  message: string;
  type: AnnonceType;
  sender_id: string;
  sender_name: string;
  created_at: Date;
  read_by?: string[];
  attachments?: MessageAttachment[];
  reply_count?: number;
}

/**
 * Reply to an announcement
 */
export interface AnnouncementReply {
  id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  created_at: Date;
  read_by?: string[];
  reply_to_id?: string | null;
  reply_to_preview?: ReplyPreview | null;
  attachments?: MessageAttachment[];
}

// ============================================
// Push Notifications Types
// ============================================

/**
 * Push notification status
 */
export type PushNotificationStatus = 'brouillon' | 'planifie' | 'envoye' | 'annule';

/**
 * Target audience for push notifications
 */
export type PushNotificationAudience = 'all' | 'admins' | 'members' | 'custom';

/**
 * Push notification document stored in Firestore
 */
export interface PushNotification {
  id: string;

  // Content
  title: string;
  body: string;
  imageUrl?: string;

  // Targeting
  audience: PushNotificationAudience;
  targetRoles?: ('superadmin' | 'admin' | 'validateur' | 'user')[];
  targetMemberIds?: string[];

  // Scheduling
  status: PushNotificationStatus;
  scheduledAt?: Date;
  sentAt?: Date;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName?: string;

  // Stats (updated after sending)
  recipientCount?: number;
  successCount?: number;
  failureCount?: number;
}
