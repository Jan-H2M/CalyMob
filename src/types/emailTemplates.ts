/**
 * Email Template System Types
 * Phase 1: MVP - Basic template storage and editing
 */

import { Timestamp } from 'firebase/firestore';
import {
  DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE,
  DEFAULT_PASSWORD_RESET_TEMPLATE,
} from '@/constants/defaultUserEmailTemplates';
import {
  DEFAULT_EVENT_PAYMENT_TEMPLATE,
} from '@/constants/defaultPaymentEmailTemplate';

/**
 * Email template type/category
 */
export type EmailTemplateType =
  | 'pending_demands'      // Rappel demandes en attente
  | 'accounting_codes'     // Codes comptables quotidiens
  | 'account_activated'    // Compte utilisateur activé
  | 'password_reset'       // Mot de passe réinitialisé
  | 'expense_submitted'    // Note de frais soumise
  | 'expense_approved'     // Note de frais approuvée
  | 'expense_reimbursed'   // Note de frais remboursée
  | 'bank_validation_pending' // Rappel validations bancaires
  | 'event_payment'        // Paiement pour événement (avec QR code EPC)
  | 'events'               // Événements
  | 'transactions'         // Transactions
  | 'members'              // Membres
  | 'custom';              // Personnalisé

/**
 * Human-readable labels for each email template type
 * Single source of truth - import this in components
 */
export const EMAIL_TYPE_LABELS: Record<EmailTemplateType, string> = {
  pending_demands: 'Demandes en attente',
  accounting_codes: 'Codes comptables',
  account_activated: 'Activation manuelle',
  password_reset: 'Réinitialisation administrateur',
  expense_submitted: 'Note de frais soumise',
  expense_approved: 'Note de frais approuvée',
  expense_reimbursed: 'Note de frais remboursée',
  bank_validation_pending: 'Rappel validations bancaires',
  event_payment: 'Paiement événement (QR)',
  events: 'Événements',
  transactions: 'Transactions',
  members: 'Membres',
  custom: 'Personnalisé',
};

/**
 * Variable type for template rendering
 */
export type VariableType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'object';

/**
 * Template variable definition
 */
export interface EmailTemplateVariable {
  name: string;                    // Variable name (e.g., "recipientName")
  type: VariableType;
  required: boolean;
  description: string;             // Help text for users
  defaultValue?: string | number | boolean | null;
  example?: string;                // Example value for preview
}

/**
 * Template styling configuration
 */
export interface EmailTemplateStyles {
  primaryColor: string;            // Hex color (e.g., "#3B82F6")
  secondaryColor?: string;
  headerGradient?: string;         // CSS gradient (e.g., "linear-gradient(135deg, #1E40AF, #3B82F6)")
  buttonColor?: string;
  buttonTextColor?: string;
  fontFamily?: string;             // CSS font-family
}

/**
 * Email Template
 * Stored in Firestore: /clubs/{clubId}/email_templates/{templateId}
 */
export interface EmailTemplate {
  id: string;

  // Basic info
  name: string;                    // Display name: "Rappel Demandes Détaillé"
  description: string;             // Purpose/usage description
  emailType: EmailTemplateType;

  // Content (editable by user)
  subject: string;                 // Email subject with {{variables}}
  htmlContent: string;             // Full HTML template with {{variables}}
  previewText?: string;            // Email preview text (inbox summary)

  // Visual editor data (GrapesJS)
  designJson?: Record<string, unknown>;  // GrapesJS project data for visual editing

  // Variables
  variables: EmailTemplateVariable[];

  // Styling
  styles: EmailTemplateStyles;

  // Metadata
  createdAt: Date | Timestamp;
  updatedAt: Date | Timestamp;
  createdBy: string;               // User ID who created
  updatedBy?: string;              // User ID who last updated

  // Status
  isActive: boolean;               // Can be used in jobs
  isDefault?: boolean;             // Default template for this emailType

  // Usage tracking
  lastUsed?: Date | Timestamp;
  usageCount: number;              // How many jobs use this template
}

/**
 * Sample data for template preview
 */
export interface EmailTemplateSampleData {
  id: string;
  name: string;                    // Sample data set name: "Exemple avec 3 demandes"
  description: string;
  emailType: EmailTemplateType;
  data: Record<string, any>;       // Actual sample data
}

/**
 * Template rendering result
 */
export interface TemplateRenderResult {
  success: boolean;
  html?: string;
  subject?: string;
  error?: string;
  missingVariables?: string[];     // Variables used in template but not provided in data
}

/**
 * Editable zone in a template
 * Zones are marked in HTML with: <!--ZONE:id:Label-->content<!--/ZONE:id-->
 */
export interface EditableZone {
  id: string;              // Zone identifier (e.g., 'intro', 'message')
  label: string;           // Display label (e.g., 'Introduction', 'Message personnalisé')
  content: string;         // Current HTML content of the zone
}

/**
 * Result of rendering a template with editable zones
 * Used by CommunicationModal for hybrid template editing
 */
export interface TemplateWithZonesResult {
  success: boolean;
  subject?: string;              // Rendered email subject
  zones: EditableZone[];         // Editable zones with their content
  staticParts: string[];         // Static HTML parts between zones
  error?: string;
}

/**
 * Default template styles (Calypso branding)
 */
export const DEFAULT_TEMPLATE_STYLES: EmailTemplateStyles = {
  primaryColor: '#3B82F6',          // Blue-500
  secondaryColor: '#1E40AF',        // Blue-800
  headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
  buttonColor: '#3B82F6',
  buttonTextColor: '#FFFFFF',
  fontFamily: 'Arial, sans-serif',
};

/**
 * Common variables available to all template types
 */
export const COMMON_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'currentDate',
    type: 'string',
    required: false,
    description: 'Date du jour (format: 11/01/2026)',
    example: '11/01/2026',
  },
  {
    name: 'currentYear',
    type: 'string',
    required: false,
    description: 'Année en cours',
    example: '2026',
  },
  {
    name: 'senderName',
    type: 'string',
    required: false,
    description: 'Nom de l\'expéditeur',
    example: 'Le Trésorier',
  },
  {
    name: 'senderEmail',
    type: 'string',
    required: false,
    description: 'Email de l\'expéditeur',
    example: 'tresorier@calypso.be',
  },
];

/**
 * Variable definitions for "accounting_codes" template type
 */
export const ACCOUNTING_CODES_VARIABLES: EmailTemplateVariable[] = [
  // Single variables
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Nom de famille du destinataire',
    example: 'Dupont',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'date',
    type: 'string',
    required: true,
    description: 'Date du rapport',
    example: '09/11/2025',
  },
  {
    name: 'totalTransactions',
    type: 'number',
    required: false,
    description: 'Nombre total de transactions',
    example: '12',
  },
  {
    name: 'totalAmount',
    type: 'number',
    required: false,
    description: 'Montant total des transactions',
    example: '1245.50',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },

  // Array variable (for loops)
  {
    name: 'transactions',
    type: 'array',
    required: true,
    description: 'Liste détaillée des transactions codées à afficher dans le tableau',
    example: JSON.stringify([
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-001',
        contrepartie: 'Dive Shop Brussels',
        code_comptable: '6000',
        montant: '150.00',
      },
    ], null, 2),
  },
];

/**
 * Variable definitions for "account_activated" template type
 */
export const ACCOUNT_ACTIVATED_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom complet du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Nom de famille du destinataire',
    example: 'Dupont',
  },
  {
    name: 'email',
    type: 'string',
    required: true,
    description: 'Email du destinataire',
    example: 'jean.dupont@example.com',
  },
  {
    name: 'temporaryPassword',
    type: 'string',
    required: true,
    description: 'Mot de passe temporaire utilise dans le flux d\'activation manuelle',
    example: 'CalyCompta2026-03',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
];

/**
 * Variable definitions for "password_reset" template type
 */
export const PASSWORD_RESET_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom complet du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Nom de famille du destinataire',
    example: 'Dupont',
  },
  {
    name: 'email',
    type: 'string',
    required: true,
    description: 'Email du destinataire',
    example: 'jean.dupont@example.com',
  },
  {
    name: 'temporaryPassword',
    type: 'string',
    required: true,
    description: 'Nouveau mot de passe temporaire defini par un administrateur',
    example: 'CalyCompta2026-03',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
];

/**
 * Variable definitions for "event_payment" template type
 * Used for EPC QR code payment emails sent from CalyMob
 */
export const EVENT_PAYMENT_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom complet du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'eventTitle',
    type: 'string',
    required: true,
    description: 'Titre de l\'événement',
    example: 'Villers-2-Eglises',
  },
  {
    name: 'eventNumber',
    type: 'string',
    required: false,
    description: 'Numéro de l\'événement',
    example: '200006',
  },
  {
    name: 'eventDate',
    type: 'string',
    required: false,
    description: 'Date de l\'événement',
    example: '25/01/2026',
  },
  {
    name: 'amount',
    type: 'number',
    required: true,
    description: 'Montant à payer en euros',
    example: '25.00',
  },
  {
    name: 'amountFormatted',
    type: 'string',
    required: true,
    description: 'Montant formaté avec symbole euro',
    example: '25,00 €',
  },
  {
    name: 'iban',
    type: 'string',
    required: true,
    description: 'IBAN du club (sans espaces)',
    example: 'BE68068893763453',
  },
  {
    name: 'ibanFormatted',
    type: 'string',
    required: true,
    description: 'IBAN formaté avec espaces',
    example: 'BE68 0688 9376 3453',
  },
  {
    name: 'beneficiaryName',
    type: 'string',
    required: true,
    description: 'Nom du bénéficiaire (club)',
    example: 'Calypso Diving Club',
  },
  {
    name: 'paymentReference',
    type: 'string',
    required: true,
    description: 'Communication structurée du paiement',
    example: '#200006 Villers-2-Eglises 25/01/2026 Jean Dupont',
  },
  {
    name: 'qrCodeImage',
    type: 'string',
    required: true,
    description: 'QR code EPC en base64 data-URL (image PNG)',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
];

/**
 * Variable definitions for "pending_demands" template type
 */
export const PENDING_DEMANDS_VARIABLES: EmailTemplateVariable[] = [
  // Single variables
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Nom de famille du destinataire',
    example: 'Dupont',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'totalAmount',
    type: 'number',
    required: false,
    description: 'Montant total des demandes',
    example: '245.50',
  },
  {
    name: 'urgentCount',
    type: 'number',
    required: false,
    description: 'Nombre de demandes urgentes (> 7 jours)',
    example: '2',
  },
  {
    name: 'demandesCount',
    type: 'number',
    required: false,
    description: 'Nombre total de demandes',
    example: '5',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },

  // Array variable (for loops)
  {
    name: 'demandes',
    type: 'array',
    required: true,
    description: 'Liste des demandes de remboursement',
    example: JSON.stringify([
      {
        id: 'abc123',
        date: '15/10/2025',
        demandeur: 'Jan Andriessens',
        description: 'Facture hébergement serveur OVH',
        montant: '125.00',
        daysWaiting: 5,
        isUrgent: false,
      },
    ], null, 2),
  },
];

/**
 * Variable definitions for "expense_submitted" template type
 */
export const EXPENSE_SUBMITTED_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du demandeur',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du demandeur',
    example: 'Jean',
  },
  {
    name: 'description',
    type: 'string',
    required: true,
    description: 'Description de la dépense',
    example: 'Matériel de plongée',
  },
  {
    name: 'montant',
    type: 'number',
    required: true,
    description: 'Montant de la dépense',
    example: '125.50',
  },
  {
    name: 'dateDepense',
    type: 'string',
    required: true,
    description: 'Date de la dépense',
    example: '15/12/2025',
  },
  {
    name: 'fournisseur',
    type: 'string',
    required: false,
    description: 'Nom du fournisseur',
    example: 'Dive Shop Brussels',
  },
  {
    name: 'categorie',
    type: 'string',
    required: false,
    description: 'Catégorie de la dépense',
    example: 'Matériel',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
];

/**
 * Variable definitions for "expense_approved" template type
 */
export const EXPENSE_APPROVED_VARIABLES: EmailTemplateVariable[] = [
  ...EXPENSE_SUBMITTED_VARIABLES,
  {
    name: 'approvedBy',
    type: 'string',
    required: true,
    description: 'Nom de la personne qui a approuvé',
    example: 'Marie Martin',
  },
  {
    name: 'approvalDate',
    type: 'string',
    required: true,
    description: 'Date d\'approbation',
    example: '16/12/2025',
  },
];

/**
 * Variable definitions for "expense_reimbursed" template type
 */
export const EXPENSE_REIMBURSED_VARIABLES: EmailTemplateVariable[] = [
  ...EXPENSE_APPROVED_VARIABLES,
  {
    name: 'reimbursementDate',
    type: 'string',
    required: true,
    description: 'Date de remboursement',
    example: '20/12/2025',
  },
];

/**
 * Variable definitions for "events" template type (Bilan financier d'activité)
 */
export const EVENTS_VARIABLES: EmailTemplateVariable[] = [
  // Activity info
  {
    name: 'activityId',
    type: 'string',
    required: true,
    description: 'ID de l\'activité',
    example: 'act-2026-001',
  },
  {
    name: 'activityName',
    type: 'string',
    required: true,
    description: 'Nom de l\'activité',
    example: 'Sortie plongée Zeeland',
  },
  {
    name: 'activityDate',
    type: 'string',
    required: true,
    description: 'Date de l\'activité',
    example: '15/01/2026',
  },
  {
    name: 'activityLocation',
    type: 'string',
    required: false,
    description: 'Lieu de l\'activité',
    example: 'Grevelingen, Pays-Bas',
  },
  // Participant info
  {
    name: 'participantsCount',
    type: 'number',
    required: false,
    description: 'Nombre de participants',
    example: '8',
  },
  {
    name: 'expectedPrice',
    type: 'number',
    required: false,
    description: 'Prix par participant (théorique)',
    example: '45.00',
  },
  // Financial summary
  {
    name: 'totalCollected',
    type: 'number',
    required: false,
    description: 'Total des encaissements bancaires catégorisés',
    example: '360.00',
  },
  {
    name: 'totalExpenses',
    type: 'number',
    required: false,
    description: 'Total des dépenses bancaires catégorisées',
    example: '125.50',
  },
  {
    name: 'totalReimbursements',
    type: 'number',
    required: false,
    description: 'Total des demandes liées / remboursements à effectuer',
    example: '125.50',
  },
  {
    name: 'eventBalance',
    type: 'number',
    required: false,
    description: 'Solde comptable final de l\'événement',
    example: '234.50',
  },
  {
    name: 'participantCollectedTotal',
    type: 'number',
    required: false,
    description: 'Total payé par les participants',
    example: '355.00',
  },
  {
    name: 'linkedDemandsTotal',
    type: 'number',
    required: false,
    description: 'Total des demandes liées à l\'activité',
    example: '125.50',
  },
  {
    name: 'participantBalance',
    type: 'number',
    required: false,
    description: 'Solde participants moins demandes liées',
    example: '229.50',
  },
  {
    name: 'balanceStatus',
    type: 'string',
    required: false,
    description: 'Statut de la balance (positive, neutral, negative)',
    example: 'positive',
  },
  // Pre-computed styling fields (to avoid Handlebars helpers)
  {
    name: 'balanceColor',
    type: 'string',
    required: false,
    description: 'Couleur hex pour la balance (#059669=vert, #DC2626=rouge, #F59E0B=orange)',
    example: '#059669',
  },
  {
    name: 'balanceBgColor',
    type: 'string',
    required: false,
    description: 'Couleur de fond pour le résumé financier',
    example: '#D1FAE5',
  },
  {
    name: 'balanceBorderColor',
    type: 'string',
    required: false,
    description: 'Couleur de bordure pour le résumé financier',
    example: '#10B981',
  },
  {
    name: 'balanceDisplay',
    type: 'string',
    required: false,
    description: 'Balance formatée avec signe (+229.50 ou -50.00)',
    example: '+229.50',
  },
  // Common fields
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://caly.club/logo-horizontal.jpg',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
  // Array: participants
  {
    name: 'participants',
    type: 'array',
    required: true,
    description: 'Liste des participants avec leurs paiements (inclure balanceColor et balanceDisplay)',
    example: JSON.stringify([
      {
        name: 'Marie Dupont',
        paidAmount: 45.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',  // gray=0, green=+, red=-
        balanceDisplay: '0',      // formatted with sign
      },
    ], null, 2),
  },
  // Array: expenses
  {
    name: 'expenses',
    type: 'array',
    required: false,
    description: 'Liste des frais liés à l\'activité (inclure statusBgColor et statusTextColor)',
    example: JSON.stringify([
      {
        date: '15/01/2026',
        demandeur: 'Jan Andriessens',
        description: 'Gonflage bouteilles',
        montant: 40.00,
        status: 'Remboursé',
        statusBgColor: '#D1FAE5',   // light green if Remboursé, #FEF3C7 if À rembourser
        statusTextColor: '#065F46', // dark green if Remboursé, #92400E if À rembourser
      },
    ], null, 2),
  },
];

/**
 * Variable definitions for "bank_validation_pending" template type
 */
export const BANK_VALIDATION_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'firstName',
    type: 'string',
    required: false,
    description: 'Prénom du destinataire',
    example: 'Jean',
  },
  {
    name: 'lastName',
    type: 'string',
    required: false,
    description: 'Nom de famille du destinataire',
    example: 'Dupont',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'totalAmount',
    type: 'number',
    required: false,
    description: 'Montant total des paiements',
    example: '2450.00',
  },
  {
    name: 'demandesCount',
    type: 'number',
    required: false,
    description: 'Nombre de paiements à valider',
    example: '3',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
  {
    name: 'demandes',
    type: 'array',
    required: true,
    description: 'Liste des paiements à valider',
    example: JSON.stringify([
      {
        date: '15/01/2026',
        demandeur: 'Jan Andriessens',
        description: 'Garantie locative Maison Haute',
        montant: '1096.00',
        fournisseur: 'Admin Communale Watermal',
      },
    ], null, 2),
  },
];

/**
 * Variable definitions for "transactions" type (Verification/Information Request)
 * Used to request information about unidentified bank transactions
 */
export const TRANSACTIONS_VARIABLES: EmailTemplateVariable[] = [
  {
    name: 'recipientName',
    type: 'string',
    required: true,
    description: 'Nom du destinataire',
    example: 'Jean Dupont',
  },
  {
    name: 'clubName',
    type: 'string',
    required: true,
    description: 'Nom du club',
    example: 'Calypso Diving Club',
  },
  {
    name: 'logoUrl',
    type: 'string',
    required: false,
    description: 'URL du logo du club',
    example: 'https://example.com/logo.png',
  },
  {
    name: 'appUrl',
    type: 'string',
    required: true,
    description: 'URL de l\'application',
    example: 'https://calycompta.vercel.app',
  },
  {
    name: 'transactionId',
    type: 'string',
    required: true,
    description: 'ID de la transaction',
    example: 'txn-2026-001',
  },
  {
    name: 'dateTransaction',
    type: 'string',
    required: true,
    description: 'Date de la transaction',
    example: '15/01/2026',
  },
  {
    name: 'dateValeur',
    type: 'string',
    required: false,
    description: 'Date de valeur',
    example: '16/01/2026',
  },
  {
    name: 'montant',
    type: 'string',
    required: true,
    description: 'Montant de la transaction',
    example: '150.00',
  },
  {
    name: 'sens',
    type: 'string',
    required: true,
    description: 'Sens de la transaction (Crédit/Débit)',
    example: 'Crédit',
  },
  {
    name: 'iban',
    type: 'string',
    required: false,
    description: 'Compte bancaire (IBAN)',
    example: 'BE68 5390 0754 7034',
  },
  {
    name: 'contrepartie',
    type: 'string',
    required: false,
    description: 'Contrepartie/Bénéficiaire',
    example: 'DUPONT JEAN',
  },
  {
    name: 'communication',
    type: 'string',
    required: false,
    description: 'Communication bancaire',
    example: 'Virement cotisation',
  },
  {
    name: 'reference',
    type: 'string',
    required: false,
    description: 'Référence bancaire',
    example: 'REF-2026-001234',
  },
  {
    name: 'banque',
    type: 'string',
    required: false,
    description: 'Nom de la banque',
    example: 'Belfius',
  },
  {
    name: 'provider',
    type: 'string',
    required: false,
    description: 'Source/Provider',
    example: 'Import CSV',
  },
];

/**
 * Default template for "expense_submitted" type
 */
export const DEFAULT_EXPENSE_SUBMITTED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">
    {{else}}
    <h2 style="margin: 0; color: #374151;">{{clubName}}</h2>
    {{/if}}
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais enregistrée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>

    <p>Votre note de frais a bien été enregistrée et est en attente de validation.</p>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails de votre demande</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">{{description}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #059669;">{{montant}} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date de dépense:</td>
          <td style="padding: 8px 0;">{{dateDepense}}</td>
        </tr>
        {{#if fournisseur}}
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Fournisseur:</td>
          <td style="padding: 8px 0;">{{fournisseur}}</td>
        </tr>
        {{/if}}
        {{#if categorie}}
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Catégorie:</td>
          <td style="padding: 8px 0;">{{categorie}}</td>
        </tr>
        {{/if}}
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Vous recevrez une notification dès que votre demande sera traitée.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/depenses" style="display: inline-block; background: #F97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir mes demandes
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 8px;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "expense_approved" type
 */
export const DEFAULT_EXPENSE_APPROVED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">
    {{else}}
    <h2 style="margin: 0; color: #374151;">{{clubName}}</h2>
    {{/if}}
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais approuvée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>

    <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">
        Bonne nouvelle ! Votre note de frais a été approuvée.
      </p>
    </div>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails de votre demande</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">{{description}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #059669;">{{montant}} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Approuvé par:</td>
          <td style="padding: 8px 0;">{{approvedBy}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date d'approbation:</td>
          <td style="padding: 8px 0;">{{approvalDate}}</td>
        </tr>
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Le remboursement sera effectué dans les plus brefs délais.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/depenses" style="display: inline-block; background: #F97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir mes demandes
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 8px;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "expense_reimbursed" type
 */
export const DEFAULT_EXPENSE_REIMBURSED_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">
    {{else}}
    <h2 style="margin: 0; color: #374151;">{{clubName}}</h2>
    {{/if}}
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">Note de frais remboursée</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>

    <div style="background: #D1FAE5; border-left: 4px solid #10B981; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #065F46;">
        Votre note de frais a été remboursée !
      </p>
    </div>

    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails du remboursement</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Description:</td>
          <td style="padding: 8px 0; font-weight: 600;">{{description}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Montant remboursé:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #059669;">{{montant}} EUR</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">Date de remboursement:</td>
          <td style="padding: 8px 0;">{{reimbursementDate}}</td>
        </tr>
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px;">Le montant devrait apparaître sur votre compte bancaire dans les prochains jours.</p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/depenses" style="display: inline-block; background: #F97316; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir mes demandes
      </a>
    </div>

    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 8px;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "accounting_codes" type
 * Matches the exact format of the current hardcoded email
 */
export const DEFAULT_ACCOUNTING_CODES_TEMPLATE = `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
  <!-- Logo Calypso -->
  <div style="text-align: center; margin: 20px 0;">
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 300px; height: auto;" />
  </div>

  <h2 style="color: #1e40af;">Nouvelles transactions avec codes comptables</h2>
  <p>Bonjour,</p>
  <p>Il y a <strong>{{totalTransactions}} nouvelle(s) transaction(s)</strong> avec des codes comptables assignés.</p>

  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
    <thead>
      <tr style="background: #f3f4f6;">
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Date</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">N° Séquence</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Contrepartie</th>
        <th style="padding: 10px; text-align: left; border: 1px solid #e5e7eb;">Code</th>
        <th style="padding: 10px; text-align: right; border: 1px solid #e5e7eb;">Montant</th>
      </tr>
    </thead>
    <tbody>
      {{#each transactions}}
      <tr>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.date}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.numero_sequence}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;">{{this.contrepartie}}</td>
        <td style="padding: 10px; border: 1px solid #e5e7eb;"><strong>{{this.code_comptable}}</strong></td>
        <td style="padding: 10px; border: 1px solid #e5e7eb; text-align: right; font-weight: 600;">{{this.montant}} €</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <p style="margin-top: 20px;">
    <a href="{{appUrl}}/transactions" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
      Voir toutes les transactions
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;" />

  <div style="text-align: center; color: #6b7280; font-size: 12px;">
    <p style="margin: 10px 0;">Email automatique envoyé par CalyCompta</p>
    <img src="{{appUrl}}/logo-vertical.png" alt="{{clubName}}" style="max-width: 80px; height: auto; opacity: 0.6; margin: 10px 0;" />
    <p style="margin: 5px 0;">{{clubName}}</p>
  </div>
</div>
`.trim();

/**
 * Default template for "pending_demands" type
 * This serves as a starting point for users
 */
export const DEFAULT_PENDING_DEMANDS_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 800px; margin: 0 auto; padding: 20px;">

  <!-- Header -->
  <div style="background: {{headerGradient}}; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">📧 Demandes de remboursement en attente</h1>
    <p style="margin: 10px 0 0 0; opacity: 0.9;">{{clubName}}</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>

    <!-- Summary Box -->
    <div style="background: #EFF6FF; border-left: 4px solid {{primaryColor}}; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600;">
        {{demandesCount}} demande(s) de remboursement en attente de validation
      </p>
      <p style="margin: 5px 0 0 0; font-size: 14px;">
        Montant total: <strong>{{totalAmount}} €</strong>
      </p>
    </div>

    <!-- Table -->
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #F3F4F6;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Date</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Demandeur</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Description</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Montant</th>
        </tr>
      </thead>
      <tbody>
        {{#each demandes}}
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.date}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.demandeur}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.description}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600;">{{this.montant}} €</td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/depenses" style="display: inline-block; background: {{buttonColor}}; color: {{buttonTextColor}}; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        ➜ Consulter les demandes
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      <em>Ce rappel automatique est envoyé selon votre configuration dans Paramètres → Communication.</em>
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "bank_validation_pending" type
 */
export const DEFAULT_BANK_VALIDATION_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 1px solid #E5E7EB;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto;">
    {{else}}
    <h2 style="margin: 0; color: #374151;">{{clubName}}</h2>
    {{/if}}
  </div>

  <div style="padding: 30px 0;">
    <h1 style="margin: 0 0 20px 0; font-size: 22px; color: #111827;">🏦 Validations bancaires en attente</h1>

    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>

    <!-- Alert Box -->
    <div style="background: #EEF2FF; border-left: 4px solid #6366F1; padding: 15px; margin: 20px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 16px; font-weight: 600; color: #4338CA;">
        {{demandesCount}} paiement(s) créé(s) dans l'application bancaire nécessite(nt) votre validation.
      </p>
      <p style="margin: 5px 0 0 0; font-size: 14px; color: #4338CA;">
        Montant total: <strong>{{totalAmount}} €</strong>
      </p>
    </div>

    <!-- Table in grey box -->
    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Détails des paiements</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #E5E7EB;">
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6B7280;">Date</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6B7280;">Demandeur</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6B7280;">Bénéficiaire</th>
            <th style="padding: 8px; text-align: left; font-size: 12px; color: #6B7280;">Description</th>
            <th style="padding: 8px; text-align: right; font-size: 12px; color: #6B7280;">Montant</th>
          </tr>
        </thead>
        <tbody>
          {{#each demandes}}
          <tr style="border-bottom: 1px solid #E5E7EB;">
            <td style="padding: 8px; font-size: 14px;">{{this.date}}</td>
            <td style="padding: 8px; font-size: 14px;">{{this.demandeur}}</td>
            <td style="padding: 8px; font-size: 14px;">{{#if this.fournisseur}}{{this.fournisseur}}{{else}}{{this.demandeur}}{{/if}}</td>
            <td style="padding: 8px; font-size: 14px;">{{this.description}}</td>
            <td style="padding: 8px; font-size: 14px; text-align: right; font-weight: 600; color: #DC2626;">{{this.montant}} €</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>

    <p style="color: #6B7280; font-size: 14px; margin: 20px 0;">
      ⚠️ Ces paiements ont été créés dans votre application bancaire et attendent une validation.
      Veuillez vous connecter à votre espace bancaire pour les approuver.
    </p>

    <!-- BNP Logo Link -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="https://www.bnpparibasfortis.be/fr/generic/logon" target="_blank" style="display: inline-block;">
        <img src="https://caly.club/logo-bnp.png" alt="BNP Paribas Fortis - Connexion" style="max-width: 200px; height: auto;">
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      <em>Ce rappel automatique est envoyé selon votre configuration dans Paramètres → Communication.</em>
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "events" type (Bilan financier d'activité)
 * Note: Uses pre-computed fields for conditional styling:
 * - balanceColor: hex color based on balance status
 * - balanceBgColor: background color based on balance status
 * - balanceBorderColor: border color based on balance status
 * - balanceDisplay: formatted balance with +/- sign
 * - participants[].balanceColor: color for each participant's balance
 * - participants[].balanceDisplay: formatted balance with +/- sign
 * - expenses[].isReimbursed: boolean for styling
 */
export const DEFAULT_EVENTS_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 800px; margin: 0 auto; padding: 20px;">

  <!-- Header with gradient -->
  <div style="background: linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
    {{#if logoUrl}}
    <img src="{{logoUrl}}" alt="{{clubName}}" style="max-width: 200px; height: auto; margin-bottom: 20px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">📊 Bilan financier de l'activité</h1>
    <p style="margin: 10px 0 0 0; font-size: 18px; opacity: 0.95;">{{activityName}}</p>
  </div>

  <!-- Body -->
  <div style="background: white; padding: 30px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="font-size: 16px; margin-bottom: 20px;">Bonjour {{recipientName}},</p>
    <p>Voici le bilan financier détaillé de l'activité <strong>{{activityName}}</strong>.</p>

    <!-- Activity Info Box -->
    <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 16px;">Informations générales</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #6B7280; width: 40%;">📍 Lieu :</td>
          <td style="padding: 8px 0; font-weight: 600;">{{activityLocation}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">📅 Date :</td>
          <td style="padding: 8px 0; font-weight: 600;">{{activityDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">👥 Participants :</td>
          <td style="padding: 8px 0; font-weight: 600;">{{participantsCount}} personnes</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6B7280;">💰 Prix par participant :</td>
          <td style="padding: 8px 0; font-weight: 600;">{{expectedPrice}} €</td>
        </tr>
      </table>
    </div>

    <!-- Participants & Payments Table -->
    <h3 style="margin: 30px 0 15px 0; color: #374151; font-size: 18px;">👥 Participants & Paiements</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #F3F4F6;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Participant</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Montant payé</th>
          <th style="padding: 12px; text-align: center; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Moyen</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Montant dû</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #E5E7EB; font-weight: 600;">Différence</th>
        </tr>
      </thead>
      <tbody>
        {{#each participants}}
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.name}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">{{this.paidAmount}} €</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">{{this.paymentMethod}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right;">{{this.expectedAmount}} €</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: {{this.balanceColor}};">
            {{this.balanceDisplay}} €
          </td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <!-- Expenses Table -->
    {{#if expenses}}
    <h3 style="margin: 30px 0 15px 0; color: #374151; font-size: 18px;">💳 Frais liés à l'activité</h3>
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background-color: #FEF3C7;">
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #F59E0B; font-weight: 600;">Date</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #F59E0B; font-weight: 600;">Demandeur</th>
          <th style="padding: 12px; text-align: left; border-bottom: 2px solid #F59E0B; font-weight: 600;">Description</th>
          <th style="padding: 12px; text-align: right; border-bottom: 2px solid #F59E0B; font-weight: 600;">Montant</th>
          <th style="padding: 12px; text-align: center; border-bottom: 2px solid #F59E0B; font-weight: 600;">Statut</th>
        </tr>
      </thead>
      <tbody>
        {{#each expenses}}
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.date}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.demandeur}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.description}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600;">{{this.montant}} €</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB; text-align: center;">
            <span style="background: {{this.statusBgColor}}; color: {{this.statusTextColor}}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">{{this.status}}</span>
          </td>
        </tr>
        {{/each}}
      </tbody>
      <tfoot>
        <tr style="background-color: #F9FAFB;">
          <td colspan="3" style="padding: 12px; font-weight: 600; text-align: right;">Total des demandes liées :</td>
          <td style="padding: 12px; font-weight: 600; text-align: right;">{{linkedDemandsTotal}} €</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    {{/if}}

    <!-- Financial Summary Box -->
    <div style="background: {{balanceBgColor}}; border-radius: 8px; padding: 20px; margin: 30px 0; border-left: 4px solid {{balanceBorderColor}};">
      <h3 style="margin: 0 0 15px 0; color: #374151; font-size: 18px;">📈 Résumé comptable</h3>
      <table style="width: 100%;">
        <tr>
          <td style="padding: 8px 0; color: #374151;">Encaissements bancaires catégorisés :</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #059669;">{{totalCollected}} €</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #374151;">Dépenses bancaires catégorisées :</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #DC2626;">- {{totalExpenses}} €</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #374151;">Demandes liées à rembourser :</td>
          <td style="padding: 8px 0; font-weight: 600; text-align: right; color: #F59E0B;">{{totalReimbursements}} €</td>
        </tr>
        <tr style="border-top: 2px solid #E5E7EB;">
          <td style="padding: 12px 0; font-weight: 700; font-size: 16px; color: #111827;">Solde comptable :</td>
          <td style="padding: 12px 0; font-weight: 700; font-size: 18px; text-align: right; color: {{balanceColor}};">
            {{balanceDisplay}} €
          </td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{appUrl}}/activites/{{activityId}}" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        Voir l'activité dans l'application
      </a>
    </div>

    <!-- Footer -->
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">

    <p style="font-size: 14px; color: #6B7280; margin-bottom: 10px;">
      <em>Email généré automatiquement depuis {{clubName}}.</em><br>
      <em>Pour toute question, merci de contacter le trésorier.</em>
    </p>

    <p style="font-size: 14px; margin: 0;">
      Cordialement,<br>
      <strong>{{clubName}}</strong>
    </p>
  </div>

  <!-- Footer -->
  <div style="background: #F9FAFB; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #E5E7EB; border-top: none;">
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      CalyCompta - Gestion comptable pour clubs de plongée
    </p>
  </div>
</body>
</html>
`.trim();

/**
 * Default template for "transactions" type (Verification/Information Request)
 * Used to request information about unidentified bank transactions
 * Email-client compatible version (no CSS gradients, bulletproof buttons)
 */
export const DEFAULT_TRANSACTIONS_TEMPLATE = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<title>Informations Transaction Bancaire</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #F5F5F5;">
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #FFFFFF;">
<tr><td style="background-color: #0077B6; padding: 20px; text-align: center;">{{#if logoUrl}}<img src="{{logoUrl}}" alt="{{clubName}}" style="max-height: 60px; width: auto; display: block; margin: 0 auto;">{{else}}<h2 style="color: #FFFFFF; margin: 0;">{{clubName}}</h2>{{/if}}<h1 style="color: #FFFFFF; font-size: 22px; margin: 15px 0 0 0; font-weight: normal;">Informations Transaction Bancaire</h1></td></tr>
<tr><td style="padding: 25px; color: #333333; font-size: 14px; line-height: 1.6;"><!--ZONE:intro:Introduction--><p style="margin: 0 0 15px 0;">Bonjour {{recipientName}},</p><p style="margin: 0 0 20px 0;">Nous avons identifié une transaction bancaire pour laquelle certaines informations sont manquantes ou insuffisantes.</p><!--/ZONE:intro--><table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;" cellpadding="0" cellspacing="0"><tr style="background-color: #F0F0F0;"><th style="border: 1px solid #DDDDDD; padding: 10px; text-align: left; font-weight: bold; width: 40%;">Détail</th><th style="border: 1px solid #DDDDDD; padding: 10px; text-align: left; font-weight: bold;">Information</th></tr><tr><td style="border: 1px solid #DDDDDD; padding: 10px;">Date de la transaction</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{dateTransaction}}</td></tr>{{#if dateValeur}}<tr style="background-color: #F9F9F9;"><td style="border: 1px solid #DDDDDD; padding: 10px;">Date de valeur</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{dateValeur}}</td></tr>{{/if}}<tr><td style="border: 1px solid #DDDDDD; padding: 10px;">Montant</td><td style="border: 1px solid #DDDDDD; padding: 10px; font-weight: bold;">{{montant}} €</td></tr><tr style="background-color: #F9F9F9;"><td style="border: 1px solid #DDDDDD; padding: 10px;">Sens</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{sens}}</td></tr>{{#if iban}}<tr><td style="border: 1px solid #DDDDDD; padding: 10px;">Compte bancaire</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{iban}}</td></tr>{{/if}}{{#if contrepartie}}<tr style="background-color: #F9F9F9;"><td style="border: 1px solid #DDDDDD; padding: 10px;">Contrepartie/Bénéficiaire</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{contrepartie}}</td></tr>{{/if}}{{#if communication}}<tr><td style="border: 1px solid #DDDDDD; padding: 10px;">Communication bancaire</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{communication}}</td></tr>{{/if}}{{#if reference}}<tr style="background-color: #F9F9F9;"><td style="border: 1px solid #DDDDDD; padding: 10px;">Référence bancaire</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{reference}}</td></tr>{{/if}}{{#if banque}}<tr><td style="border: 1px solid #DDDDDD; padding: 10px;">Source</td><td style="border: 1px solid #DDDDDD; padding: 10px;">{{banque}}{{#if provider}} / {{provider}}{{/if}}</td></tr>{{/if}}</table><!--ZONE:request:Votre demande--><p style="margin: 0 0 15px 0;">Afin de pouvoir enregistrer correctement cette transaction dans notre comptabilité, nous aurions besoin de votre aide.</p><p style="margin: 0 0 10px 0;"><strong>Nous recherchons les informations suivantes :</strong></p><ul style="margin: 0 0 20px 20px; padding: 0;"><li style="margin-bottom: 5px;">Objet ou motif du paiement</li><li style="margin-bottom: 5px;">Activité ou événement concerné</li><li style="margin-bottom: 5px;">Personne ou service lié à la transaction</li><li style="margin-bottom: 5px;">Document justificatif (facture, reçu, confirmation) si applicable</li><li style="margin-bottom: 5px;">Toute autre information utile</li></ul><p style="margin: 0 0 25px 0; color: #666666; font-style: italic;">Sans réponse de votre part, la transaction sera temporairement classée comme non affectée.</p><!--/ZONE:request--><table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 20px;"><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color: #48CAE4; border-radius: 4px;"><a href="{{appUrl}}/transactions/{{transactionId}}" style="display: inline-block; padding: 12px 24px; color: #FFFFFF; text-decoration: none; font-weight: bold; font-size: 14px;">Fournir les informations</a></td></tr></table></td></tr></table><p style="font-size: 12px; color: #666666; margin: 0; text-align: center;">Vous pouvez également répondre directement à cet email.</p></td></tr>
<tr><td style="background-color: #F0F0F0; padding: 20px; text-align: center;"><p style="margin: 0; color: #333333; font-size: 14px;">Merci d'avance pour votre collaboration,<br>Cordialement,<br><strong>{{clubName}}</strong></p></td></tr>
</table>
</body>
</html>`.trim();

/**
 * Sample data for preview (accounting codes)
 */
export const ACCOUNTING_CODES_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-accounting-codes',
  name: 'Exemple avec 3 codes comptables',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'accounting_codes',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    clubName: 'Calypso Diving Club',
    date: '09/11/2025',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
    totalTransactions: 7,
    totalAmount: 1245.50,
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://caly.club',
    transactions: [
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-001',
        contrepartie: 'Dive Shop Brussels',
        code_comptable: '6000',
        montant: '150.00',
      },
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-002',
        contrepartie: 'OVH SAS',
        code_comptable: '6100',
        montant: '125.00',
      },
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-003',
        contrepartie: 'DAN Europe',
        code_comptable: '6100',
        montant: '460.50',
      },
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-004',
        contrepartie: 'DUPONT MARIE',
        code_comptable: '7000',
        montant: '150.00',
      },
      {
        date: '09/11/2025',
        numero_sequence: 'SEQ-2024-005',
        contrepartie: 'MARTIN PIERRE',
        code_comptable: '7000',
        montant: '60.00',
      },
    ],
  },
};

/**
 * Sample data for preview (pending demands)
 */
export const PENDING_DEMANDS_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-pending-demands',
  name: 'Exemple avec 3 demandes',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'pending_demands',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    clubName: 'Calypso Diving Club',
    totalAmount: 245.50,
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
    urgentCount: 1,
    demandesCount: 3,
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://caly.club',
    demandes: [
      {
        id: 'abc123',
        date: '15/10/2025',           // Cloud Function uses 'date' (not date_depense)
        demandeur: 'Jan Andriessens', // Cloud Function uses 'demandeur' (not demandeur_nom)
        description: 'Facture hébergement serveur OVH',
        montant: '125.00',            // Cloud Function sends string with toFixed(2)
        daysWaiting: 5,
        isUrgent: false,
      },
      {
        id: 'def456',
        date: '20/10/2025',
        demandeur: 'Marie Dupont',
        description: 'Matériel plongée (palmes, masque)',
        montant: '60.50',
        daysWaiting: 3,
        isUrgent: false,
      },
      {
        id: 'ghi789',
        date: '02/10/2025',
        demandeur: 'Pierre Martin',
        description: 'Essence sortie plongée Zeeland',
        montant: '60.00',
        daysWaiting: 15,
        isUrgent: true,
      },
    ],
  },
};

/**
 * Sample data for preview (account activated)
 */
export const ACCOUNT_ACTIVATED_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-account-activated',
  name: 'Exemple activation de compte',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'account_activated',
  data: {
    recipientName: 'Marie Dubois',
    firstName: 'Marie',
    lastName: 'Dubois',
    email: 'marie.dubois@example.com',
    temporaryPassword: 'CalyCompta2025-42',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
  },
};

/**
 * Sample data for preview (password reset)
 */
export const PASSWORD_RESET_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-password-reset',
  name: 'Exemple réinitialisation mot de passe',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'password_reset',
  data: {
    recipientName: 'Pierre Martin',
    firstName: 'Pierre',
    lastName: 'Martin',
    email: 'pierre.martin@example.com',
    temporaryPassword: 'CalyCompta2025-78',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
  },
};

/**
 * Sample data for preview (expense submitted)
 */
export const EXPENSE_SUBMITTED_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-expense-submitted',
  name: 'Exemple note de frais soumise',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'expense_submitted',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    description: 'Matériel de plongée (détendeur)',
    montant: '125.50',
    dateDepense: '15/12/2025',
    fournisseur: 'Dive Shop Brussels',
    categorie: 'Matériel',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
  },
};

/**
 * Sample data for preview (expense approved)
 */
export const EXPENSE_APPROVED_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-expense-approved',
  name: 'Exemple note de frais approuvée',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'expense_approved',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    description: 'Matériel de plongée (détendeur)',
    montant: '125.50',
    dateDepense: '15/12/2025',
    fournisseur: 'Dive Shop Brussels',
    categorie: 'Matériel',
    approvedBy: 'Marie Martin',
    approvalDate: '16/12/2025',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
  },
};

/**
 * Sample data for preview (expense reimbursed)
 */
export const EXPENSE_REIMBURSED_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-expense-reimbursed',
  name: 'Exemple note de frais remboursée',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'expense_reimbursed',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    description: 'Matériel de plongée (détendeur)',
    montant: '125.50',
    dateDepense: '15/12/2025',
    fournisseur: 'Dive Shop Brussels',
    categorie: 'Matériel',
    approvedBy: 'Marie Martin',
    approvalDate: '16/12/2025',
    reimbursementDate: '20/12/2025',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
  },
};

/**
 * Sample data for preview (bank validation pending)
 */
export const BANK_VALIDATION_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-bank-validation',
  name: 'Exemple avec 3 paiements à valider',
  description: 'Données de test pour prévisualiser le template (avec et sans fournisseur)',
  emailType: 'bank_validation_pending',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    clubName: 'Calypso Diving Club',
    totalAmount: '1696.00',
    currentDate: '11/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
    demandesCount: 3,
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://caly.club',
    demandes: [
      {
        date: '07/01/2026',
        demandeur: 'Jan Andriessens',   // Cloud Function uses 'demandeur'
        description: 'Garantie locative Maison Haute - Calyfiesta',
        montant: '1096.00',
        fournisseur: 'Admin Communale Watermal',
      },
      {
        date: '08/01/2026',
        demandeur: 'Marie Dupont',
        description: 'Matériel de plongée (détendeurs)',
        montant: '500.00',
        fournisseur: 'Dive Shop Brussels',
      },
      {
        date: '09/01/2026',
        demandeur: 'Pierre Martin',
        description: 'Remboursement frais déplacement stage',
        montant: '100.00',
        fournisseur: '',  // Empty for member reimbursement (no supplier)
      },
    ],
  },
};

/**
 * Sample data for preview (event payment - EPC QR code)
 */
export const EVENT_PAYMENT_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-event-payment',
  name: 'Exemple paiement événement',
  description: 'Données de test pour prévisualiser le template de paiement EPC QR',
  emailType: 'event_payment',
  data: {
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    eventTitle: 'Villers-2-Eglises',
    eventNumber: '200006',
    eventDate: '25/01/2026',
    amount: 25.00,
    amountFormatted: '25,00 €',
    iban: 'BE68068893763453',
    ibanFormatted: 'BE68 0688 9376 3453',
    beneficiaryName: 'Calypso Diving Club',
    paymentReference: '#200006 Villers-2-Eglises 25/01/2026 Jean Dupont',
    qrCodeImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    currentDate: '20/01/2026',
    currentYear: '2026',
  },
};

/**
 * Sample data for preview (events - Bilan financier d'activité)
 * Includes pre-computed fields for conditional styling (no Handlebars helpers needed)
 */
export const EVENTS_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-events-financial-report',
  name: 'Exemple bilan financier avec 8 participants',
  description: 'Données de test pour prévisualiser le template de bilan financier d\'activité',
  emailType: 'events',
  data: {
    // Activity info
    activityId: 'act-2026-001',
    activityName: 'Sortie plongée Zeeland',
    activityDate: '15/01/2026',
    activityLocation: 'Grevelingen, Pays-Bas',
    // Participants
    participantsCount: 8,
    expectedPrice: 45.00,
    // Financial summary
    totalCollected: 355.00,
    totalExpenses: 125.50,
    totalReimbursements: 125.50,
    eventBalance: 229.50,
    balanceStatus: 'positive',  // 'positive', 'neutral', 'negative'
    // Pre-computed styling fields (based on balanceStatus)
    balanceColor: '#059669',      // green for positive
    balanceBgColor: '#D1FAE5',    // light green background
    balanceBorderColor: '#10B981', // green border
    balanceDisplay: '+229.50',    // formatted with sign
    // Common fields
    recipientName: 'Jean Dupont',
    firstName: 'Jean',
    lastName: 'Dupont',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '12/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
    // Participants array (with pre-computed display fields)
    participants: [
      {
        name: 'Marie Dupont',
        paidAmount: 45.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',  // gray for zero
        balanceDisplay: '0',
      },
      {
        name: 'Pierre Martin',
        paidAmount: 45.00,
        paymentMethod: 'Cash',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',
        balanceDisplay: '0',
      },
      {
        name: 'Sophie Bernard',
        paidAmount: 50.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: 5.00,
        balanceColor: '#059669',  // green for positive
        balanceDisplay: '+5',
      },
      {
        name: 'Lucas Janssen',
        paidAmount: 45.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',
        balanceDisplay: '0',
      },
      {
        name: 'Emma Claes',
        paidAmount: 40.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: -5.00,
        balanceColor: '#DC2626',  // red for negative
        balanceDisplay: '-5',
      },
      {
        name: 'Thomas Peeters',
        paidAmount: 45.00,
        paymentMethod: 'Cash',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',
        balanceDisplay: '0',
      },
      {
        name: 'Julie Maes',
        paidAmount: 45.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: 0,
        balanceColor: '#6B7280',
        balanceDisplay: '0',
      },
      {
        name: 'Nicolas Willems',
        paidAmount: 40.00,
        paymentMethod: 'Virement',
        expectedAmount: 45.00,
        balance: -5.00,
        balanceColor: '#DC2626',
        balanceDisplay: '-5',
      },
    ],
    // Expenses array (with pre-computed status colors)
    expenses: [
      {
        date: '15/01/2026',
        demandeur: 'Jan Andriessens',
        description: 'Gonflage bouteilles (16 bouteilles)',
        montant: 40.00,
        status: 'Remboursé',
        statusBgColor: '#D1FAE5',    // light green
        statusTextColor: '#065F46',  // dark green
      },
      {
        date: '15/01/2026',
        demandeur: 'Marie Dupont',
        description: 'Frais de péage A/R',
        montant: 25.50,
        status: 'Remboursé',
        statusBgColor: '#D1FAE5',
        statusTextColor: '#065F46',
      },
      {
        date: '14/01/2026',
        demandeur: 'Pierre Martin',
        description: 'Location camionnette transport matériel',
        montant: 60.00,
        status: 'À rembourser',
        statusBgColor: '#FEF3C7',    // light orange
        statusTextColor: '#92400E',  // dark orange
      },
    ],
  },
};

/**
 * Sample data for preview (transactions - Verification/Information Request)
 * Used to test the template for requesting information about unidentified bank transactions
 */
export const TRANSACTIONS_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-transactions-verification',
  name: 'Exemple transaction à identifier',
  description: 'Données de test pour prévisualiser le template de demande d\'informations sur une transaction bancaire',
  emailType: 'transactions',
  data: {
    // Common fields
    recipientName: 'Jean Dupont',
    clubName: 'Calypso Diving Club',
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    currentDate: '15/01/2026',
    currentYear: '2026',
    senderName: 'Le Trésorier',
    senderEmail: 'tresorier@calypso.be',
    // Transaction-specific fields
    transactionId: 'txn-2026-001234',
    dateTransaction: '12/01/2026',
    dateValeur: '13/01/2026',
    montant: '150.00',
    sens: 'Crédit',
    iban: 'BE68 5390 0754 7034',
    contrepartie: 'DUPONT JEAN',
    communication: 'Virement',
    reference: 'D20260112-001234',
    banque: 'Belfius',
    provider: 'Import CSV',
  },
};

/**
 * Helper: Get variable definitions for a template type
 * Includes common variables (currentDate, currentYear, senderName, senderEmail)
 */
export function getVariablesForType(emailType: EmailTemplateType): EmailTemplateVariable[] {
  let typeVariables: EmailTemplateVariable[];

  switch (emailType) {
    case 'pending_demands':
      typeVariables = PENDING_DEMANDS_VARIABLES;
      break;
    case 'accounting_codes':
      typeVariables = ACCOUNTING_CODES_VARIABLES;
      break;
    case 'account_activated':
      typeVariables = ACCOUNT_ACTIVATED_VARIABLES;
      break;
    case 'password_reset':
      typeVariables = PASSWORD_RESET_VARIABLES;
      break;
    case 'expense_submitted':
      typeVariables = EXPENSE_SUBMITTED_VARIABLES;
      break;
    case 'expense_approved':
      typeVariables = EXPENSE_APPROVED_VARIABLES;
      break;
    case 'expense_reimbursed':
      typeVariables = EXPENSE_REIMBURSED_VARIABLES;
      break;
    case 'bank_validation_pending':
      typeVariables = BANK_VALIDATION_VARIABLES;
      break;
    case 'event_payment':
      typeVariables = EVENT_PAYMENT_VARIABLES;
      break;
    case 'events':
      typeVariables = EVENTS_VARIABLES;
      break;
    case 'transactions':
      typeVariables = TRANSACTIONS_VARIABLES;
      break;
    case 'custom':
      typeVariables = [];  // User defines their own variables
      break;
    default:
      typeVariables = [];
  }

  // Add common variables at the end
  return [...typeVariables, ...COMMON_VARIABLES];
}

/**
 * Helper: Get default template HTML for a type
 */
export function getDefaultTemplateForType(emailType: EmailTemplateType): string {
  switch (emailType) {
    case 'pending_demands':
      return DEFAULT_PENDING_DEMANDS_TEMPLATE;
    case 'accounting_codes':
      return DEFAULT_ACCOUNTING_CODES_TEMPLATE;
    case 'account_activated':
      return DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE;
    case 'password_reset':
      return DEFAULT_PASSWORD_RESET_TEMPLATE;
    case 'expense_submitted':
      return DEFAULT_EXPENSE_SUBMITTED_TEMPLATE;
    case 'expense_approved':
      return DEFAULT_EXPENSE_APPROVED_TEMPLATE;
    case 'expense_reimbursed':
      return DEFAULT_EXPENSE_REIMBURSED_TEMPLATE;
    case 'bank_validation_pending':
      return DEFAULT_BANK_VALIDATION_TEMPLATE;
    case 'event_payment':
      return DEFAULT_EVENT_PAYMENT_TEMPLATE;
    case 'events':
      return DEFAULT_EVENTS_TEMPLATE;
    case 'transactions':
      return DEFAULT_TRANSACTIONS_TEMPLATE;
    default:
      return '<html><body><h1>{{title}}</h1><p>{{content}}</p></body></html>';
  }
}

/**
 * Helper: Get sample data for a template type
 */
export function getSampleDataForType(emailType: EmailTemplateType): EmailTemplateSampleData | null {
  switch (emailType) {
    case 'pending_demands':
      return PENDING_DEMANDS_SAMPLE_DATA;
    case 'accounting_codes':
      return ACCOUNTING_CODES_SAMPLE_DATA;
    case 'account_activated':
      return ACCOUNT_ACTIVATED_SAMPLE_DATA;
    case 'password_reset':
      return PASSWORD_RESET_SAMPLE_DATA;
    case 'expense_submitted':
      return EXPENSE_SUBMITTED_SAMPLE_DATA;
    case 'expense_approved':
      return EXPENSE_APPROVED_SAMPLE_DATA;
    case 'expense_reimbursed':
      return EXPENSE_REIMBURSED_SAMPLE_DATA;
    case 'bank_validation_pending':
      return BANK_VALIDATION_SAMPLE_DATA;
    case 'event_payment':
      return EVENT_PAYMENT_SAMPLE_DATA;
    case 'events':
      return EVENTS_SAMPLE_DATA;
    case 'transactions':
      return TRANSACTIONS_SAMPLE_DATA;
    default:
      return null;
  }
}
