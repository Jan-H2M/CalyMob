import { logger } from '@/utils/logger';
/**
 * Service to initialize default email templates for user management
 */

import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE, DEFAULT_PASSWORD_RESET_TEMPLATE } from '@/constants/defaultUserEmailTemplates';
import {
  DEFAULT_EXPENSE_SUBMITTED_TEMPLATE,
  DEFAULT_EXPENSE_APPROVED_TEMPLATE,
  DEFAULT_EXPENSE_REIMBURSED_TEMPLATE,
  DEFAULT_BANK_VALIDATION_TEMPLATE,
  DEFAULT_PENDING_DEMANDS_TEMPLATE,
  DEFAULT_ACCOUNTING_CODES_TEMPLATE,
  EXPENSE_SUBMITTED_VARIABLES,
  EXPENSE_APPROVED_VARIABLES,
  EXPENSE_REIMBURSED_VARIABLES,
  BANK_VALIDATION_VARIABLES,
  PENDING_DEMANDS_VARIABLES,
  ACCOUNTING_CODES_VARIABLES,
  EVENT_PAYMENT_VARIABLES,
} from '@/types/emailTemplates';
import {
  DEFAULT_EVENT_PAYMENT_TEMPLATE,
  DEFAULT_EVENT_PAYMENT_SUBJECT,
} from '@/constants/defaultPaymentEmailTemplate';

interface InitResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Initialize default user email templates
 * This creates the default manual activation and admin password reset templates
 * if they don't already exist
 */
export async function initializeUserEmailTemplates(
  clubId: string,
  userId: string
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const templates = [
    {
      name: 'Activation Manuelle',
      description: 'Email administratif envoyé lorsqu\'un accès CalyMob est activé manuellement avec un mot de passe temporaire',
      emailType: 'account_activated' as const,
      subject: '📱 Activation manuelle de votre accès CalyMob {{clubName}}',
      htmlContent: DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE,
      variables: [
        { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
        { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
        { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
        { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
        { name: 'temporaryPassword', type: 'string', required: true, description: 'Mot de passe temporaire pour une activation manuelle', example: 'CalyCompta2026-03' },
        { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
        { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://caly.club' },
      ],
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    {
      name: 'Réinitialisation Administrateur',
      description: 'Email administratif envoyé lorsqu\'un administrateur définit un nouveau mot de passe temporaire',
      emailType: 'password_reset' as const,
      subject: '🔑 Réinitialisation administrateur de votre accès {{clubName}}',
      htmlContent: DEFAULT_PASSWORD_RESET_TEMPLATE,
      variables: [
        { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
        { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
        { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
        { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
        { name: 'temporaryPassword', type: 'string', required: true, description: 'Nouveau mot de passe temporaire défini par un administrateur', example: 'CalyCompta2026-03' },
        { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
        { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://caly.club' },
      ],
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    // Expense notification templates
    {
      name: 'Note de frais soumise',
      description: 'Email envoyé automatiquement lorsqu\'une note de frais est soumise',
      emailType: 'expense_submitted' as const,
      subject: 'Note de frais enregistrée - {{description}}',
      htmlContent: DEFAULT_EXPENSE_SUBMITTED_TEMPLATE,
      variables: EXPENSE_SUBMITTED_VARIABLES,
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    {
      name: 'Note de frais approuvée',
      description: 'Email envoyé automatiquement lorsqu\'une note de frais est approuvée',
      emailType: 'expense_approved' as const,
      subject: 'Note de frais approuvée - {{description}}',
      htmlContent: DEFAULT_EXPENSE_APPROVED_TEMPLATE,
      variables: EXPENSE_APPROVED_VARIABLES,
      styles: {
        primaryColor: '#10B981',
        secondaryColor: '#065F46',
        headerGradient: 'linear-gradient(135deg, #065F46 0%, #10B981 100%)',
        buttonColor: '#10B981',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    {
      name: 'Note de frais remboursée',
      description: 'Email envoyé automatiquement lorsqu\'une note de frais est remboursée',
      emailType: 'expense_reimbursed' as const,
      subject: 'Note de frais remboursée - {{description}}',
      htmlContent: DEFAULT_EXPENSE_REIMBURSED_TEMPLATE,
      variables: EXPENSE_REIMBURSED_VARIABLES,
      styles: {
        primaryColor: '#7C3AED',
        secondaryColor: '#5B21B6',
        headerGradient: 'linear-gradient(135deg, #7C3AED 0%, #A78BFA 100%)',
        buttonColor: '#7C3AED',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    // Bank validation pending template
    {
      name: 'Rappel validations bancaires',
      description: 'Email de rappel pour les paiements créés dans l\'application bancaire en attente de validation',
      emailType: 'bank_validation_pending' as const,
      subject: '🏦 Validation bancaire requise - {{demandesCount}} paiement(s)',
      htmlContent: DEFAULT_BANK_VALIDATION_TEMPLATE,
      variables: BANK_VALIDATION_VARIABLES,
      styles: {
        primaryColor: '#6366F1',
        secondaryColor: '#4338CA',
        headerGradient: 'linear-gradient(135deg, #4338CA 0%, #6366F1 100%)',
        buttonColor: '#6366F1',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    // Pending demands reminder template
    {
      name: 'Rappel demandes en attente',
      description: 'Email de rappel pour les demandes de remboursement en attente de validation',
      emailType: 'pending_demands' as const,
      subject: '📋 Rappel: {{demandesCount}} demande(s) de remboursement en attente',
      htmlContent: DEFAULT_PENDING_DEMANDS_TEMPLATE,
      variables: PENDING_DEMANDS_VARIABLES,
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#F97316',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    // Accounting codes daily report template
    {
      name: 'Codes comptables quotidiens',
      description: 'Email quotidien avec les transactions et leurs codes comptables assignés',
      emailType: 'accounting_codes' as const,
      subject: '📊 Codes comptables - {{totalTransactions}} nouvelle(s) transaction(s)',
      htmlContent: DEFAULT_ACCOUNTING_CODES_TEMPLATE,
      variables: ACCOUNTING_CODES_VARIABLES,
      styles: {
        primaryColor: '#1E40AF',
        secondaryColor: '#1E3A8A',
        headerGradient: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
        buttonColor: '#1E40AF',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    // Event payment template (EPC QR code for CalyMob)
    {
      name: 'Paiement événement (QR)',
      description: 'Email avec QR code EPC pour le paiement d\'une inscription à un événement (envoyé depuis CalyMob)',
      emailType: 'event_payment' as const,
      subject: DEFAULT_EVENT_PAYMENT_SUBJECT,
      htmlContent: DEFAULT_EVENT_PAYMENT_TEMPLATE,
      variables: EVENT_PAYMENT_VARIABLES,
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
  ];

  for (const template of templates) {
    try {
      // Check if template already exists
      const templatesRef = collection(db, 'clubs', clubId, 'email_templates');
      const q = query(templatesRef, where('emailType', '==', template.emailType));
      const existing = await getDocs(q);

      if (!existing.empty) {
        logger.debug(`⚠️  Template "${template.name}" already exists, skipping...`);
        result.skipped++;
        continue;
      }

      // Create template
      const templateData = {
        ...template,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
      };

      await addDoc(templatesRef, templateData);
      logger.debug(`✅ Created template "${template.name}"`);
      result.created++;
    } catch (error: any) {
      logger.error(`❌ Error creating template "${template.name}":`, error);
      result.errors.push(`${template.name}: ${error.message}`);
      result.success = false;
    }
  }

  return result;
}
