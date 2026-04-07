/**
 * SMS Service
 * Service pour gérer les SMS via Twilio
 */

import type {
  SMSJob,
  SMSMessageType,
  SMSSendResult,
  SMSHistory,
  MemberSMSPreferences,
} from '@/types/sms';
import {
  generateSMSJobId,
  normalizePhoneNumber,
  calculateSMSSegments,
} from '@/types/sms';

/**
 * Générer un ID unique pour un job SMS
 */
export function generateJobId(): string {
  return generateSMSJobId();
}

/**
 * Créer un nouveau job SMS avec valeurs par défaut
 */
export function createNewSMSJob(
  messageType: SMSMessageType = 'payment_reminder'
): SMSJob {
  const now = new Date();

  return {
    id: generateJobId(),
    name: 'Nouveau job SMS',
    description: 'Description du job SMS',
    messageType,
    enabled: false,
    daysOfWeek: [1], // Lundi par défaut
    timesOfDay: ['09:00'],
    recipients: {
      roles: ['admin', 'validateur'],
    },
    messageTemplate: getDefaultTemplate(messageType),
    minimumCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Dupliquer un job SMS existant
 */
export function duplicateSMSJob(job: SMSJob): SMSJob {
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
 * Valider la configuration d'un job SMS
 */
export function validateSMSJob(job: SMSJob): { valid: boolean; errors: string[] } {
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

  const times = job.timesOfDay || [];
  const validTimes = times.filter(t => t && /^\d{2}:\d{2}$/.test(t));

  if (validTimes.length === 0) {
    errors.push('Au moins une heure d\'exécution doit être définie (format HH:MM)');
  }

  if (validTimes.length > 4) {
    errors.push('Maximum 4 heures d\'exécution par jour');
  }

  if (job.recipients.roles.length === 0 && (!job.recipients.additionalPhoneNumbers || job.recipients.additionalPhoneNumbers.length === 0)) {
    errors.push('Au moins un destinataire (rôle ou numéro) doit être défini');
  }

  if (!job.messageTemplate || job.messageTemplate.trim().length === 0) {
    errors.push('Le template du message est obligatoire');
  }

  // Vérifier la longueur du message (max recommandé: 160 chars pour 1 segment)
  const segments = calculateSMSSegments(job.messageTemplate);
  if (segments > 3) {
    errors.push(`Message trop long: ${segments} segments SMS (max recommandé: 3)`);
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
 * Obtenir le template par défaut pour un type de message
 */
export function getDefaultTemplate(messageType: SMSMessageType): string {
  switch (messageType) {
    case 'payment_reminder':
      return 'Calypso: Rappel - {{amount}} EUR en attente pour {{description}}. Merci de regulariser.';
    case 'invoice_notification':
      return 'Calypso: Nouvelle facture de {{amount}} EUR. Ref: {{reference}}.';
    case 'expense_alert':
      return 'Calypso: {{count}} demande(s) de remboursement en attente ({{amount}} EUR). Validation requise.';
    case 'transaction_confirmation':
      return 'Calypso: Transaction de {{amount}} EUR confirmee. Ref: {{reference}}. Merci!';
    case 'activity_notification':
      return 'Calypso: Nouvelle activite "{{title}}" le {{date}}. Inscription ouverte!';
    case 'custom':
      return '';
    default:
      return '';
  }
}

/**
 * Obtenir le nom d'un type de message SMS
 */
export function getMessageTypeName(messageType: SMSMessageType): string {
  switch (messageType) {
    case 'payment_reminder':
      return 'Rappel de paiement';
    case 'invoice_notification':
      return 'Notification de facture';
    case 'expense_alert':
      return 'Alerte de dépense';
    case 'transaction_confirmation':
      return 'Confirmation de transaction';
    case 'activity_notification':
      return 'Notification d\'activité';
    case 'custom':
      return 'Message personnalisé';
    default:
      return messageType;
  }
}

/**
 * Obtenir la description par défaut pour un type de message SMS
 */
export function getDefaultJobDescription(messageType: SMSMessageType): string {
  switch (messageType) {
    case 'payment_reminder':
      return 'Envoie un SMS de rappel aux membres avec des paiements en attente';
    case 'invoice_notification':
      return 'Envoie un SMS de notification pour les nouvelles factures';
    case 'expense_alert':
      return 'Envoie un SMS aux validateurs pour les demandes de remboursement en attente';
    case 'transaction_confirmation':
      return 'Envoie un SMS de confirmation après une transaction';
    case 'activity_notification':
      return 'Envoie un SMS pour notifier d\'une nouvelle activité ou événement';
    case 'custom':
      return 'Message SMS personnalisé';
    default:
      return 'Description du job SMS';
  }
}

/**
 * Remplacer les variables dans un template SMS
 * @param template Template avec {{variables}}
 * @param data Données pour remplacer les variables
 * @returns Message avec variables remplacées
 */
export function renderSMSTemplate(
  template: string,
  data: Record<string, string | number | undefined>
): string {
  let message = template;

  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    message = message.replace(regex, String(value ?? ''));
  }

  return message;
}

/**
 * Préparer un numéro de téléphone pour l'envoi
 * @param phone Numéro de téléphone brut
 * @param defaultCountryCode Code pays par défaut
 * @returns Numéro normalisé ou null si invalide
 */
export function preparePhoneNumber(
  phone: string,
  defaultCountryCode: string = '+32'
): string | null {
  return normalizePhoneNumber(phone, defaultCountryCode);
}

/**
 * Vérifier si un membre a accepté de recevoir des SMS
 */
export function canReceiveSMS(preferences: MemberSMSPreferences | null): boolean {
  if (!preferences) return false;

  return (
    preferences.smsOptIn &&
    preferences.phoneNumberVerified &&
    !!preferences.phoneNumber
  );
}

/**
 * Vérifier si c'est actuellement les heures calmes pour un membre
 */
export function isQuietHours(preferences: MemberSMSPreferences): boolean {
  if (!preferences.quietHoursEnabled) return false;
  if (!preferences.quietHoursStart || !preferences.quietHoursEnd) return false;

  const now = new Date();
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const start = preferences.quietHoursStart;
  const end = preferences.quietHoursEnd;

  // Gérer le cas où les heures calmes traversent minuit (ex: 22:00 à 08:00)
  if (start > end) {
    // Heures calmes traversent minuit
    return currentTime >= start || currentTime < end;
  } else {
    // Heures calmes normales (ex: 23:00 à 07:00)
    return currentTime >= start && currentTime < end;
  }
}

/**
 * Formater un numéro de téléphone pour l'affichage
 */
export function formatPhoneForDisplay(phone: string): string {
  if (!phone) return '';

  // Format belge: +32 470 12 34 56
  if (phone.startsWith('+32')) {
    const national = phone.substring(3);
    if (national.length === 9) {
      return `+32 ${national.substring(0, 3)} ${national.substring(3, 5)} ${national.substring(5, 7)} ${national.substring(7)}`;
    }
  }

  // Format français: +33 6 12 34 56 78
  if (phone.startsWith('+33')) {
    const national = phone.substring(3);
    if (national.length === 9) {
      return `+33 ${national.substring(0, 1)} ${national.substring(1, 3)} ${national.substring(3, 5)} ${national.substring(5, 7)} ${national.substring(7)}`;
    }
  }

  // Format par défaut: grouper par 2 ou 3 chiffres
  return phone;
}

/**
 * Masquer un numéro de téléphone pour l'affichage sécurisé
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return phone;

  // Garder le début (+32) et les 2 derniers chiffres
  const start = phone.substring(0, 3);
  const end = phone.substring(phone.length - 2);
  const masked = '*'.repeat(phone.length - 5);

  return `${start}${masked}${end}`;
}

/**
 * Estimer le coût d'envoi d'un SMS (prix Twilio approximatif)
 * Note: Les prix varient selon les pays et types de numéros
 */
export function estimateSMSCost(
  message: string,
  recipientCount: number,
  countryCode: string = '+32'
): { segments: number; costPerSMS: number; totalCost: number } {
  const segments = calculateSMSSegments(message);

  // Prix approximatifs par segment (USD)
  const pricePerSegment: Record<string, number> = {
    '+32': 0.0723,  // Belgique
    '+33': 0.0679,  // France
    '+31': 0.0748,  // Pays-Bas
    '+49': 0.0659,  // Allemagne
    '+1': 0.0079,   // USA/Canada
    'default': 0.08,
  };

  const segmentPrice = pricePerSegment[countryCode] || pricePerSegment['default'];
  const costPerSMS = segments * segmentPrice;
  const totalCost = costPerSMS * recipientCount;

  return {
    segments,
    costPerSMS: Math.round(costPerSMS * 10000) / 10000,
    totalCost: Math.round(totalCost * 100) / 100,
  };
}

/**
 * Générer un résumé de l'historique SMS
 */
export function generateSMSSummary(history: SMSHistory[]): {
  total: number;
  delivered: number;
  failed: number;
  pending: number;
  totalSegments: number;
  totalCost: number;
} {
  const summary = {
    total: history.length,
    delivered: 0,
    failed: 0,
    pending: 0,
    totalSegments: 0,
    totalCost: 0,
  };

  for (const sms of history) {
    if (sms.twilioStatus === 'delivered') {
      summary.delivered++;
    } else if (['failed', 'undelivered'].includes(sms.twilioStatus)) {
      summary.failed++;
    } else {
      summary.pending++;
    }

    summary.totalSegments += sms.segmentCount || 1;
    summary.totalCost += sms.price || 0;
  }

  return summary;
}

/**
 * Créer les préférences SMS par défaut pour un membre
 */
export function createDefaultSMSPreferences(memberId: string): MemberSMSPreferences {
  return {
    memberId,
    smsOptIn: false,
    phoneNumberVerified: false,
    receivePaymentReminders: true,
    receiveActivityNotifications: true,
    receiveTransactionAlerts: true,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    updatedAt: new Date(),
  };
}

/**
 * Générer l'expression cron depuis DayOfWeek[] et timesOfDay
 * (Réutilise le même format que les jobs email pour cohérence)
 */
export function generateCronExpression(
  days: (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
  times: string | string[]
): string {
  const timesArray = Array.isArray(times) ? times : [times];
  const validTimes = timesArray.filter(t => t && t.trim() !== '');

  if (validTimes.length === 0) {
    return '0 9 * * *'; // Default fallback
  }

  const parsedTimes = validTimes.map(t => {
    const [hours, minutes] = t.split(':');
    return { hours: parseInt(hours, 10), minutes: parseInt(minutes, 10) };
  });

  const allSameMinute = parsedTimes.every(t => t.minutes === parsedTimes[0].minutes);
  const daysStr = days.join(',');

  if (allSameMinute) {
    const hoursStr = parsedTimes.map(t => t.hours.toString().padStart(2, '0')).join(',');
    const minutesStr = parsedTimes[0].minutes.toString().padStart(2, '0');
    return `${minutesStr} ${hoursStr} * * ${daysStr}`;
  }

  const [hours, minutes] = validTimes[0].split(':');
  return `${minutes} ${hours} * * ${daysStr}`;
}
