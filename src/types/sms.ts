/**
 * SMS Module Types
 * Types pour la gestion des SMS, WhatsApp et Email
 */

/**
 * Canal de messagerie (SMS, WhatsApp ou Email)
 */
export type MessagingChannel = 'sms' | 'whatsapp' | 'email';

/**
 * Type de message SMS
 */
export type SMSMessageType =
  | 'payment_reminder'       // Rappel de paiement
  | 'invoice_notification'   // Notification de facture
  | 'expense_alert'          // Alerte de dépense
  | 'transaction_confirmation' // Confirmation de transaction
  | 'activity_notification'  // Notification d'activité
  | 'custom';                // Message personnalisé

/**
 * Statut de livraison SMS
 */
export type SMSDeliveryStatus =
  | 'queued'      // En attente d'envoi
  | 'sending'     // En cours d'envoi
  | 'sent'        // Envoyé au réseau
  | 'delivered'   // Livré au destinataire
  | 'undelivered' // Non livré
  | 'failed';     // Échec d'envoi

/**
 * Configuration Twilio
 */
export interface TwilioConfig {
  accountSid: string;           // Twilio Account SID
  authToken: string;            // Twilio Auth Token (encrypted in storage)
  messagingServiceSid: string;  // Twilio Messaging Service SID
  fromPhoneNumber: string;      // Numéro d'envoi (format E.164: +13158873691)
}

/**
 * Configuration WhatsApp
 */
export interface WhatsAppConfig {
  enabled: boolean;             // WhatsApp activé
  sandboxMode: boolean;         // Mode sandbox pour testing
  fromNumber: string;           // Numéro WhatsApp (format: whatsapp:+14155238886)
}

/**
 * Paramètres SMS globaux
 */
export interface SMSSettings {
  enabled: boolean;             // Master toggle pour tous les SMS

  // Twilio configuration
  twilio: TwilioConfig;

  // WhatsApp configuration
  whatsapp: WhatsAppConfig;

  // Jobs SMS configurés
  jobs: SMSJob[];

  // Options globales
  testMode: boolean;            // Mode test (envoie uniquement aux numéros vérifiés)
  testPhoneNumber?: string;     // Numéro pour le mode test

  // Rate limiting
  maxSmsPerDay: number;         // Limite quotidienne d'envoi
  maxSmsPerMember: number;      // Limite par membre par jour

  // Préférences
  defaultCountryCode: string;   // Code pays par défaut (ex: "+32" pour Belgique)

  // Metadata
  updatedAt: Date;
  updatedBy?: string;
}

/**
 * Configuration d'un job SMS planifié
 */
export interface SMSJob {
  id: string;
  name: string;
  description: string;
  messageType: SMSMessageType;
  enabled: boolean;

  // Schedule configuration (same as CommunicationJob for consistency)
  daysOfWeek: (0 | 1 | 2 | 3 | 4 | 5 | 6)[]; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  timesOfDay: string[];          // Array of times in format "HH:MM" (24h, Brussels time), max 4

  // Recipients
  recipients: {
    roles: ('superadmin' | 'admin' | 'validateur' | 'user')[];
    additionalPhoneNumbers?: string[]; // Numéros supplémentaires
  };

  // Template
  templateId?: string;           // ID du template SMS à utiliser
  messageTemplate: string;       // Template du message (max 160 chars pour 1 segment)

  // Options
  minimumCount?: number;         // Nombre minimum d'items pour envoyer

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  lastRun?: Date;
  lastRunSuccess?: boolean;

  // Execution tracking
  executedTimeSlots?: Record<string, string[]>; // { "2026-01-10": ["07:00", "12:00"] }
}

/**
 * Historique d'envoi SMS
 */
export interface SMSHistory {
  id: string;

  // Message info
  jobId?: string;
  jobName?: string;
  messageType: SMSMessageType;
  message: string;

  // Recipient
  recipientId?: string;          // ID du membre
  recipientName?: string;        // Nom du destinataire
  recipientPhone: string;        // Numéro de téléphone (E.164)

  // Twilio response
  twilioMessageSid?: string;     // Twilio Message SID
  twilioStatus: SMSDeliveryStatus;
  twilioErrorCode?: number;
  twilioErrorMessage?: string;

  // Pricing (for monitoring)
  segmentCount?: number;         // Nombre de segments SMS
  price?: number;                // Coût en USD

  // Timestamps
  createdAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;

  // Context
  clubId: string;
  sendType: 'automated' | 'manual' | 'test';
  channel: MessagingChannel;     // 'sms' ou 'whatsapp'
}

/**
 * Context types pour les templates SMS
 * Chaque contexte a ses propres variables disponibles
 */
export type SMSTemplateContext = 'demandes' | 'evenements' | 'paiements' | 'general';

/**
 * Définition des variables disponibles par contexte
 */
export interface SMSContextVariable {
  key: string;
  label: string;
  example: string;
}

/**
 * Variables disponibles par contexte
 */
export const SMS_CONTEXT_VARIABLES: Record<SMSTemplateContext, SMSContextVariable[]> = {
  demandes: [
    { key: 'nom', label: 'Nom du demandeur', example: 'Jean Dupont' },
    { key: 'date', label: 'Date de la demande', example: '10/01/2026' },
    { key: 'montant', label: 'Montant', example: '750.00' },
    { key: 'reference', label: 'Référence', example: '2025-00175' },
    { key: 'description', label: 'Description', example: 'Achat matériel' },
  ],
  evenements: [
    { key: 'nom', label: 'Nom du membre', example: 'Jean Dupont' },
    { key: 'date', label: 'Date événement', example: '15/01/2026' },
    { key: 'titre', label: 'Titre événement', example: 'Plongée Zeebrugge' },
    { key: 'lieu', label: 'Lieu', example: 'Zeebrugge' },
    { key: 'heure', label: 'Heure', example: '09:00' },
  ],
  paiements: [
    { key: 'nom', label: 'Nom', example: 'Jean Dupont' },
    { key: 'date', label: 'Date', example: '10/01/2026' },
    { key: 'montant', label: 'Montant', example: '150.00' },
    { key: 'reference', label: 'Référence', example: 'COT-2026-001' },
  ],
  general: [
    { key: 'nom', label: 'Nom', example: 'Jean Dupont' },
    { key: 'date', label: 'Date', example: '10/01/2026' },
  ],
};

/**
 * Labels pour les contextes (affichage UI)
 */
export const SMS_CONTEXT_LABELS: Record<SMSTemplateContext, string> = {
  demandes: 'Demandes de remboursement',
  evenements: 'Événements / Plongées',
  paiements: 'Paiements',
  general: 'Général',
};

/**
 * Template SMS
 */
export interface SMSTemplate {
  id: string;
  name: string;
  description: string;

  // Context pour filtrage (NOUVEAU)
  context: SMSTemplateContext;

  // Legacy: messageType pour compatibilité avec anciens jobs
  messageType?: SMSMessageType;

  // Content
  template: string;              // Message template avec variables {variable}

  // Metadata
  isActive: boolean;
  isDefault: boolean;            // Template par défaut pour ce contexte
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/**
 * Context data pour SMS Sender Modal
 * Les valeurs sont passées pour remplacer les variables dans le template
 */
export type SMSContextData =
  | {
      type: 'demandes';
      nom: string;
      date: string;
      montant: number;
      reference: string;
      description?: string;
    }
  | {
      type: 'evenements';
      // Basic event info
      activityId: string;
      activityName: string;
      activityDate: string;
      activityLocation?: string;
      // Financial summary
      participantsCount: number;
      expectedPrice: number;
      totalCollected: number;
      totalExpenses: number;
      totalReimbursements: number;
      eventBalance: number;
      participantCollectedTotal?: number;
      linkedDemandsTotal?: number;
      participantBalance?: number;
      balanceStatus: 'positive' | 'neutral' | 'negative';
      // Pre-computed styling
      balanceColor: string;
      balanceBgColor: string;
      balanceBorderColor: string;
      balanceDisplay: string;
      // Common fields
      clubName: string;
      logoUrl?: string;
      appUrl: string;
      // Arrays for Handlebars templates
      participants: Array<{
        name: string;
        paidAmount: number;
        paymentMethod: string;
        expectedAmount: number;
        balance: number;
        balanceColor: string;
        balanceDisplay: string;
      }>;
      expenses: Array<{
        date: string;
        demandeur: string;
        description: string;
        montant: number;
        status: string;
        statusBgColor: string;
        statusTextColor: string;
      }>;
      // Legacy fields for backwards compatibility
      nom: string;
      date: string;
      titre: string;
      lieu?: string;
      heure?: string;
    }
  | {
      type: 'paiements';
      nom: string;
      date: string;
      montant: number;
      reference: string;
    }
  | {
      type: 'general';
      nom?: string;
      date?: string;
      message?: string;
    }
  | {
      type: 'transactions';
      // Transaction identification
      transactionId: string;
      // Transaction details
      dateTransaction: string;
      dateValeur?: string;
      montant: string;
      sens: string;
      iban?: string;
      contrepartie?: string;
      communication?: string;
      reference?: string;
      banque?: string;
      provider?: string;
      // Common fields
      nom: string;
      clubName: string;
      logoUrl?: string;
      appUrl: string;
    };

/**
 * Helper: Remplacer les variables dans un template
 * @param template Template avec {variables}
 * @param data Données pour remplacer les variables
 * @returns Message avec variables remplacées
 */
export function replaceTemplateVariables(
  template: string,
  data: Record<string, string | number | undefined>
): string {
  let result = template;

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      // Supporte à la fois {variable} et {{variable}}
      const regex = new RegExp(`\\{\\{?${key}\\}\\}?`, 'g');
      result = result.replace(regex, String(value));
    }
  }

  return result;
}

/**
 * Préférences SMS d'un membre
 */
export interface MemberSMSPreferences {
  memberId: string;

  // Opt-in/out
  smsOptIn: boolean;             // A accepté de recevoir des SMS
  smsOptInDate?: Date;           // Date d'acceptation
  smsOptOutDate?: Date;          // Date de désinscription

  // Preferences
  phoneNumber?: string;          // Numéro de téléphone (format E.164)
  phoneNumberVerified: boolean;  // Numéro vérifié

  // Message preferences
  receivePaymentReminders: boolean;
  receiveActivityNotifications: boolean;
  receiveTransactionAlerts: boolean;

  // Quiet hours
  quietHoursEnabled: boolean;
  quietHoursStart?: string;      // "22:00"
  quietHoursEnd?: string;        // "08:00"

  // Metadata
  updatedAt: Date;
}

/**
 * Résultat d'envoi SMS
 */
export interface SMSSendResult {
  success: boolean;
  messageSid?: string;           // Twilio Message SID
  status?: SMSDeliveryStatus;
  segmentCount?: number;
  price?: number;
  error?: string;
  errorCode?: number;
  timestamp: Date;
}

/**
 * Données pour l'envoi de SMS
 */
export interface SMSSendRequest {
  to: string;                    // Numéro destinataire (E.164)
  message: string;               // Contenu du message
  messageType?: SMSMessageType;
  recipientId?: string;
  recipientName?: string;
  jobId?: string;
  sendType?: 'automated' | 'manual' | 'test';
  channel?: MessagingChannel;    // 'sms' (défaut) ou 'whatsapp'
}

/**
 * Statistiques SMS
 */
export interface SMSStats {
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;

  // Counts
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalSegments: number;

  // Cost
  totalCost: number;
  currency: string;

  // By type
  byType: Record<SMSMessageType, number>;

  // By status
  byStatus: Record<SMSDeliveryStatus, number>;
}

/**
 * Configuration par défaut pour les settings SMS
 */
export const DEFAULT_SMS_SETTINGS: SMSSettings = {
  enabled: false,
  twilio: {
    accountSid: '',
    authToken: '',
    messagingServiceSid: '',
    fromPhoneNumber: '',
  },
  whatsapp: {
    enabled: false,
    sandboxMode: true,          // Par défaut en sandbox pour testing
    fromNumber: '',             // Format: whatsapp:+14155238886 (sandbox)
  },
  jobs: [],
  testMode: true,               // Par défaut en mode test pour la sécurité
  maxSmsPerDay: 100,            // Limite de 100 SMS/jour par défaut
  maxSmsPerMember: 3,           // Max 3 SMS/membre/jour
  defaultCountryCode: '+32',    // Belgique par défaut
  updatedAt: new Date(),
};

/**
 * Numéro sandbox WhatsApp de Twilio (pour testing)
 */
export const TWILIO_WHATSAPP_SANDBOX_NUMBER = 'whatsapp:+14155238886';

/**
 * Templates SMS par défaut (legacy - pour compatibilité avec jobs)
 */
export const DEFAULT_SMS_TEMPLATES: Partial<SMSTemplate>[] = [
  {
    name: 'Rappel de paiement',
    description: 'Rappel pour les paiements en attente',
    context: 'paiements',
    messageType: 'payment_reminder',
    template: 'Calypso: Rappel - {montant} EUR en attente. Ref: {reference}. Merci de regulariser.',
    isActive: true,
    isDefault: true,
  },
  {
    name: 'Confirmation de transaction',
    description: 'Confirmation après une transaction',
    context: 'paiements',
    messageType: 'transaction_confirmation',
    template: 'Calypso: Transaction de {montant} EUR confirmee. Ref: {reference}. Merci!',
    isActive: true,
    isDefault: false,
  },
  {
    name: 'Notification activite',
    description: 'Notification pour une nouvelle activite',
    context: 'evenements',
    messageType: 'activity_notification',
    template: 'Calypso: Nouvelle activite "{titre}" le {date} a {lieu}. Inscription ouverte!',
    isActive: true,
    isDefault: true,
  },
  {
    name: 'Alerte depense',
    description: 'Alerte pour les demandes de remboursement',
    context: 'demandes',
    messageType: 'expense_alert',
    template: 'Calypso: Demande de {montant} EUR en attente. Ref: {reference}. Validation requise.',
    isActive: true,
    isDefault: true,
  },
];

/**
 * Templates par défaut par contexte (pour initialisation)
 */
export const DEFAULT_CONTEXT_TEMPLATES: Record<SMSTemplateContext, Partial<SMSTemplate>[]> = {
  demandes: [
    {
      name: 'Approbation banque',
      description: 'Notification que la demande a été approuvée et le paiement est en cours',
      context: 'demandes',
      template: 'Calypso: {nom}, votre demande de {montant} EUR du {date} a ete approuvee. Paiement en cours. Ref: {reference}',
      isActive: true,
      isDefault: true,
    },
    {
      name: 'Demande information',
      description: 'Demander plus d\'informations sur une demande',
      context: 'demandes',
      template: 'Calypso: {nom}, nous avons besoin de plus d\'infos concernant votre demande de {montant} EUR ({description}). Merci de nous contacter.',
      isActive: true,
      isDefault: false,
    },
    {
      name: 'Refus demande',
      description: 'Notification de refus d\'une demande',
      context: 'demandes',
      template: 'Calypso: {nom}, votre demande de {montant} EUR du {date} n\'a pas ete approuvee. Ref: {reference}. Contactez-nous pour plus d\'infos.',
      isActive: true,
      isDefault: false,
    },
  ],
  evenements: [
    {
      name: 'Rappel inscription',
      description: 'Rappel pour s\'inscrire à un événement',
      context: 'evenements',
      template: 'Calypso: {nom}, n\'oubliez pas de vous inscrire pour {titre} le {date} a {lieu}. Places limitees!',
      isActive: true,
      isDefault: true,
    },
    {
      name: 'Annulation',
      description: 'Notification d\'annulation d\'un événement',
      context: 'evenements',
      template: 'Calypso: {nom}, l\'evenement {titre} prevu le {date} est annule. Nous vous tiendrons informe du report.',
      isActive: true,
      isDefault: false,
    },
    {
      name: 'Confirmation inscription',
      description: 'Confirmation d\'inscription à un événement',
      context: 'evenements',
      template: 'Calypso: {nom}, votre inscription pour {titre} le {date} a {heure} est confirmee. RDV a {lieu}!',
      isActive: true,
      isDefault: false,
    },
  ],
  paiements: [
    {
      name: 'Rappel paiement',
      description: 'Rappel pour un paiement en attente',
      context: 'paiements',
      template: 'Calypso: {nom}, rappel - {montant} EUR en attente. Ref: {reference}. Merci de regulariser.',
      isActive: true,
      isDefault: true,
    },
    {
      name: 'Confirmation paiement',
      description: 'Confirmation de réception d\'un paiement',
      context: 'paiements',
      template: 'Calypso: {nom}, votre paiement de {montant} EUR (Ref: {reference}) a bien ete recu. Merci!',
      isActive: true,
      isDefault: false,
    },
  ],
  general: [
    {
      name: 'Message libre',
      description: 'Template vide pour message personnalisé',
      context: 'general',
      template: 'Calypso: {nom}, ',
      isActive: true,
      isDefault: true,
    },
  ],
};

/**
 * Helper: Valider un numéro de téléphone au format E.164
 * @param phone Numéro de téléphone
 * @returns true si valide
 */
export function isValidE164(phone: string): boolean {
  // Format E.164: + suivi de 1 à 15 chiffres
  const e164Regex = /^\+[1-9]\d{1,14}$/;
  return e164Regex.test(phone);
}

/**
 * Helper: Normaliser un numéro de téléphone au format E.164
 * @param phone Numéro de téléphone
 * @param defaultCountryCode Code pays par défaut (ex: "+32")
 * @returns Numéro normalisé ou null si invalide
 */
export function normalizePhoneNumber(phone: string, defaultCountryCode: string = '+32'): string | null {
  if (!phone) return null;

  // Nettoyer le numéro (supprimer espaces, tirets, parenthèses, points, slashes)
  let cleaned = phone.replace(/[\s\-\(\)\.\/]/g, '');

  // Si commence déjà par +, c'est probablement un numéro international
  if (cleaned.startsWith('+')) {
    return isValidE164(cleaned) ? cleaned : null;
  }

  // Si commence par 00, remplacer par +
  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.substring(2);
    return isValidE164(cleaned) ? cleaned : null;
  }

  // Extract country code digits (e.g., "32" from "+32")
  const countryDigits = defaultCountryCode.replace('+', '');

  // Si commence par le code pays sans +, ajouter juste le +
  // Ex: "32477123456" -> "+32477123456"
  if (cleaned.startsWith(countryDigits)) {
    cleaned = '+' + cleaned;
    return isValidE164(cleaned) ? cleaned : null;
  }

  // Si commence par 0, remplacer par le code pays
  // Ex: "0477123456" -> "+32477123456"
  if (cleaned.startsWith('0')) {
    cleaned = defaultCountryCode + cleaned.substring(1);
    return isValidE164(cleaned) ? cleaned : null;
  }

  // Sinon, ajouter le code pays complet
  cleaned = defaultCountryCode + cleaned;

  // Valider le format final
  return isValidE164(cleaned) ? cleaned : null;
}

/**
 * Helper: Calculer le nombre de segments SMS
 * @param message Contenu du message
 * @returns Nombre de segments
 */
export function calculateSMSSegments(message: string): number {
  if (!message) return 0;

  // Vérifier si le message contient des caractères non-GSM7
  const gsm7Chars = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const extendedChars = '|^€{}[]~\\';

  let charCount = 0;
  let isUnicode = false;

  for (const char of message) {
    if (gsm7Chars.includes(char)) {
      charCount += 1;
    } else if (extendedChars.includes(char)) {
      charCount += 2; // Les caractères étendus comptent double
    } else {
      isUnicode = true;
      charCount += 1;
    }
  }

  if (isUnicode) {
    // Unicode: 70 chars par segment (ou 67 si multi-segment)
    return charCount <= 70 ? 1 : Math.ceil(charCount / 67);
  } else {
    // GSM-7: 160 chars par segment (ou 153 si multi-segment)
    return charCount <= 160 ? 1 : Math.ceil(charCount / 153);
  }
}

/**
 * Helper: Tronquer un message SMS à une longueur maximale
 * @param message Message original
 * @param maxLength Longueur maximale (défaut: 160 pour 1 segment GSM-7)
 * @returns Message tronqué
 */
export function truncateSMSMessage(message: string, maxLength: number = 160): string {
  if (!message || message.length <= maxLength) return message;

  // Tronquer et ajouter "..."
  return message.substring(0, maxLength - 3) + '...';
}

/**
 * Helper: Générer l'ID d'un job SMS
 */
export function generateSMSJobId(): string {
  return `sms-job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper: Créer un nouveau job SMS avec valeurs par défaut
 */
export function createNewSMSJob(
  messageType: SMSMessageType = 'payment_reminder'
): SMSJob {
  const now = new Date();

  return {
    id: generateSMSJobId(),
    name: 'Nouveau job SMS',
    description: 'Description du job SMS',
    messageType,
    enabled: false,
    daysOfWeek: [1], // Lundi par défaut
    timesOfDay: ['09:00'],
    recipients: {
      roles: ['admin', 'validateur'],
    },
    messageTemplate: DEFAULT_SMS_TEMPLATES.find(t => t.messageType === messageType)?.template || '',
    minimumCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}
