/**
 * Email Template System Types
 * Phase 1: MVP - Basic template storage and editing
 */

import { Timestamp } from 'firebase/firestore';
import {
  DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE,
  DEFAULT_PASSWORD_RESET_TEMPLATE,
} from '@/constants/defaultUserEmailTemplates';

/**
 * Email template type/category
 */
export type EmailTemplateType =
  | 'pending_demands'      // Rappel demandes en attente
  | 'accounting_codes'     // Codes comptables quotidiens
  | 'account_activated'    // Compte utilisateur activé
  | 'password_reset'       // Mot de passe réinitialisé
  | 'events'               // Événements
  | 'transactions'         // Transactions
  | 'members'              // Membres
  | 'custom';              // Personnalisé

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
  defaultValue?: any;
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
  error?: string;
  missingVariables?: string[];     // Variables used in template but not provided in data
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
    name: 'accountingCodes',
    type: 'array',
    required: true,
    description: 'Liste des codes comptables avec leurs transactions',
    example: JSON.stringify([
      {
        code: '6000',
        description: 'Achats de marchandises',
        transactionCount: 3,
        totalAmount: 450.00,
        transactions: [
          {
            date: '09/11/2025',
            description: 'Matériel plongée',
            montant: 150.00,
            contrepartie: 'Dive Shop Brussels',
          },
        ],
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
    description: 'Mot de passe temporaire',
    example: 'CalyCompta2025-01',
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
    description: 'Nouveau mot de passe temporaire',
    example: 'CalyCompta2025-01',
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
        date_depense: '15/10/2025',
        demandeur_nom: 'Jan Andriessens',
        description: 'Facture hébergement serveur OVH',
        montant: 125.00,
        daysWaiting: 5,
        isUrgent: false,
      },
    ], null, 2),
  },
];

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
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.date_depense}}</td>
          <td style="padding: 12px; border-bottom: 1px solid #E5E7EB;">{{this.demandeur_nom}}</td>
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
 * Sample data for preview (accounting codes)
 */
export const ACCOUNTING_CODES_SAMPLE_DATA: EmailTemplateSampleData = {
  id: 'sample-accounting-codes',
  name: 'Exemple avec 3 codes comptables',
  description: 'Données de test pour prévisualiser le template',
  emailType: 'accounting_codes',
  data: {
    recipientName: 'Jean Dupont',
    clubName: 'Calypso Diving Club',
    date: '09/11/2025',
    totalTransactions: 7,
    totalAmount: 1245.50,
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    accountingCodes: [
      {
        code: '6000',
        description: 'Achats de marchandises',
        transactionCount: 3,
        totalAmount: 450.00,
        transactions: [
          {
            date: '09/11/2025',
            description: 'Matériel plongée (palmes, masque)',
            montant: 150.00,
            contrepartie: 'Dive Shop Brussels',
          },
          {
            date: '09/11/2025',
            description: 'Détendeurs - maintenance',
            montant: 200.00,
            contrepartie: 'Aqua Service SPRL',
          },
          {
            date: '09/11/2025',
            description: 'Bouteilles de plongée (2x)',
            montant: 100.00,
            contrepartie: 'ScubaPro Belgium',
          },
        ],
      },
      {
        code: '6100',
        description: 'Services et biens divers',
        transactionCount: 2,
        totalAmount: 585.50,
        transactions: [
          {
            date: '09/11/2025',
            description: 'Hébergement serveur OVH',
            montant: 125.00,
            contrepartie: 'OVH SAS',
          },
          {
            date: '09/11/2025',
            description: 'Assurance plongée annuelle',
            montant: 460.50,
            contrepartie: 'DAN Europe',
          },
        ],
      },
      {
        code: '7000',
        description: 'Ventes et prestations de services',
        transactionCount: 2,
        totalAmount: 210.00,
        transactions: [
          {
            date: '09/11/2025',
            description: 'Cotisation membre - Marie Dupont',
            montant: 150.00,
            contrepartie: 'DUPONT MARIE',
          },
          {
            date: '09/11/2025',
            description: 'Sortie plongée Zeeland',
            montant: 60.00,
            contrepartie: 'MARTIN PIERRE',
          },
        ],
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
    clubName: 'Calypso Diving Club',
    totalAmount: 245.50,
    urgentCount: 1,
    demandesCount: 3,
    logoUrl: 'https://caly.club/logo-horizontal.jpg',
    appUrl: 'https://calycompta.vercel.app',
    demandes: [
      {
        id: 'abc123',
        date_depense: '15/10/2025',
        demandeur_nom: 'Jan Andriessens',
        description: 'Facture hébergement serveur OVH',
        montant: 125.00,
        daysWaiting: 5,
        isUrgent: false,
      },
      {
        id: 'def456',
        date_depense: '20/10/2025',
        demandeur_nom: 'Marie Dupont',
        description: 'Matériel plongée (palmes, masque)',
        montant: 60.50,
        daysWaiting: 3,
        isUrgent: false,
      },
      {
        id: 'ghi789',
        date_depense: '02/10/2025',
        demandeur_nom: 'Pierre Martin',
        description: 'Essence sortie plongée Zeeland',
        montant: 60.00,
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
  },
};

/**
 * Helper: Get variable definitions for a template type
 */
export function getVariablesForType(emailType: EmailTemplateType): EmailTemplateVariable[] {
  switch (emailType) {
    case 'pending_demands':
      return PENDING_DEMANDS_VARIABLES;
    case 'accounting_codes':
      return ACCOUNTING_CODES_VARIABLES;
    case 'account_activated':
      return ACCOUNT_ACTIVATED_VARIABLES;
    case 'password_reset':
      return PASSWORD_RESET_VARIABLES;
    case 'custom':
      return [];  // User defines their own variables
    default:
      return [];  // Phase 2: add more types
  }
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
    default:
      return null;  // Phase 2: add more types
  }
}
