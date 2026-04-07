import { logger } from '@/utils/logger';
/**
 * Expense Email Notification Service
 * Sends automatic email notifications when expense request status changes
 */

import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getTemplate, renderTemplate } from './emailTemplateService';
import { FirebaseSettingsService } from './firebaseSettingsService';
import { ClubEmailService } from './clubEmailService';
import type { DemandeRemboursement } from '@/types';
import { formatDate } from '@/utils/formatters';
import type { EmailTemplateType } from '@/types/emailTemplates';
import {
  DEFAULT_EXPENSE_SUBMITTED_TEMPLATE,
  DEFAULT_EXPENSE_APPROVED_TEMPLATE,
  DEFAULT_EXPENSE_REIMBURSED_TEMPLATE,
} from '@/types/emailTemplates';

export type ExpenseEmailType = 'expense_submitted' | 'expense_approved' | 'expense_reimbursed';

export interface ExpenseEmailData {
  demande: DemandeRemboursement;
  recipientEmail: string;
  recipientName: string;
  approvedBy?: string;
  approvalDate?: Date;
  reimbursementDate?: Date;
}

/**
 * Get default subject for expense email type
 */
function getDefaultSubject(emailType: ExpenseEmailType): string {
  switch (emailType) {
    case 'expense_submitted':
      return 'Note de frais enregistrée - {{description}}';
    case 'expense_approved':
      return 'Note de frais approuvée - {{description}}';
    case 'expense_reimbursed':
      return 'Note de frais remboursée - {{description}}';
    default:
      return 'Note de frais - {{description}}';
  }
}

/**
 * Get default HTML template for expense email type
 */
function getDefaultTemplate(emailType: ExpenseEmailType): string {
  switch (emailType) {
    case 'expense_submitted':
      return DEFAULT_EXPENSE_SUBMITTED_TEMPLATE;
    case 'expense_approved':
      return DEFAULT_EXPENSE_APPROVED_TEMPLATE;
    case 'expense_reimbursed':
      return DEFAULT_EXPENSE_REIMBURSED_TEMPLATE;
    default:
      return DEFAULT_EXPENSE_SUBMITTED_TEMPLATE;
  }
}

/**
 * Send expense notification email
 */
async function sendExpenseEmail(
  clubId: string,
  emailType: ExpenseEmailType,
  data: ExpenseEmailData
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { demande, recipientEmail, recipientName, approvedBy, approvalDate, reimbursementDate } = data;

  try {
    // Skip if no email
    if (!recipientEmail) {
      logger.debug(`⚠️ [ExpenseEmail] No email for recipient, skipping ${emailType}`);
      return { success: false, error: 'No recipient email' };
    }

    logger.debug(`📧 [ExpenseEmail] Sending ${emailType} to ${recipientEmail}...`);

    // Load club settings for branding
    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
    const clubName = clubSettings.clubName || 'Calypso Diving Club';
    const logoUrl = clubSettings.logoUrl || '';
    const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://calycompta.vercel.app';

    // Try to load custom template from Firestore
    let template = await getTemplate(clubId, emailType);
    let subject: string;
    let htmlContent: string;

    // Prepare template data
    const templateData = {
      recipientName,
      firstName: demande.demandeur_prenom || recipientName.split(' ')[0] || '',
      description: demande.description || demande.titre || 'Note de frais',
      montant: demande.montant?.toFixed(2) || '0.00',
      dateDepense: formatDate(demande.date_depense as unknown as Date),
      fournisseur: demande.fournisseur || '',
      categorie: demande.categorie || '',
      approvedBy: approvedBy || '',
      approvalDate: formatDate(approvalDate),
      reimbursementDate: formatDate(reimbursementDate),
      clubName,
      logoUrl,
      appUrl,
    };

    if (template) {
      // Use custom template
      logger.debug(`✅ [ExpenseEmail] Using custom template: ${template.name}`);
      const renderResult = renderTemplate(template, templateData);
      if (!renderResult.success || !renderResult.html) {
        throw new Error(renderResult.error || 'Template rendering failed');
      }
      htmlContent = renderResult.html;

      // Render subject with Handlebars
      const Handlebars = (await import('handlebars')).default;
      const subjectTemplate = Handlebars.compile(template.subject || getDefaultSubject(emailType));
      subject = subjectTemplate(templateData);
    } else {
      // Use default template
      logger.debug(`ℹ️ [ExpenseEmail] No custom template found, using default for ${emailType}`);
      const Handlebars = (await import('handlebars')).default;

      const htmlTemplate = Handlebars.compile(getDefaultTemplate(emailType));
      htmlContent = htmlTemplate(templateData);

      const subjectTemplate = Handlebars.compile(getDefaultSubject(emailType));
      subject = subjectTemplate(templateData);
    }

    // Send email via ClubEmailService (handles both Resend and Gmail)
    const result = await ClubEmailService.sendEmail(
      clubId,
      recipientEmail,
      subject,
      htmlContent,
      undefined,
      undefined,
      undefined,
      {
        recipientName,
        demandeId: demande.id,
        emailType,
        sendType: 'automated',
      }
    );

    logger.debug(`✅ [ExpenseEmail] ${emailType} sent successfully to ${recipientEmail}`);
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    logger.error(`❌ [ExpenseEmail] Failed to send ${emailType}:`, error);

    return { success: false, error: error.message };
  }
}

/**
 * Get member email by ID
 */
async function getMemberEmail(clubId: string, memberId: string): Promise<{ email: string; name: string } | null> {
  try {
    const memberRef = doc(db, 'clubs', clubId, 'members', memberId);
    const memberSnap = await getDoc(memberRef);

    if (!memberSnap.exists()) {
      logger.warn(`⚠️ [ExpenseEmail] Member ${memberId} not found`);
      return null;
    }

    const memberData = memberSnap.data();
    const email = memberData.email;
    const name = `${memberData.prenom || ''} ${memberData.nom || ''}`.trim() || memberData.displayName || email;

    return { email, name };
  } catch (error) {
    logger.error('❌ [ExpenseEmail] Error getting member:', error);
    return null;
  }
}

// ============================================
// Public API - Convenience Functions
// ============================================

/**
 * Send email notification when expense is submitted
 */
export async function sendExpenseSubmittedEmail(
  clubId: string,
  demande: DemandeRemboursement
): Promise<{ success: boolean; error?: string }> {
  // Get submitter email
  const member = await getMemberEmail(clubId, demande.demandeur_id);
  if (!member || !member.email) {
    logger.debug(`⚠️ [ExpenseEmail] No email for submitter ${demande.demandeur_id}`);
    return { success: false, error: 'No submitter email found' };
  }

  return sendExpenseEmail(clubId, 'expense_submitted', {
    demande,
    recipientEmail: member.email,
    recipientName: member.name,
  });
}

/**
 * Send email notification when expense is approved
 */
export async function sendExpenseApprovedEmail(
  clubId: string,
  demande: DemandeRemboursement,
  approvedBy: string,
  approvalDate?: Date
): Promise<{ success: boolean; error?: string }> {
  // Get submitter email
  const member = await getMemberEmail(clubId, demande.demandeur_id);
  if (!member || !member.email) {
    logger.debug(`⚠️ [ExpenseEmail] No email for submitter ${demande.demandeur_id}`);
    return { success: false, error: 'No submitter email found' };
  }

  return sendExpenseEmail(clubId, 'expense_approved', {
    demande,
    recipientEmail: member.email,
    recipientName: member.name,
    approvedBy,
    approvalDate: approvalDate || new Date(),
  });
}

/**
 * Send email notification when expense is reimbursed
 */
export async function sendExpenseReimbursedEmail(
  clubId: string,
  demande: DemandeRemboursement,
  reimbursementDate?: Date
): Promise<{ success: boolean; error?: string }> {
  // Get submitter email
  const member = await getMemberEmail(clubId, demande.demandeur_id);
  if (!member || !member.email) {
    logger.debug(`⚠️ [ExpenseEmail] No email for submitter ${demande.demandeur_id}`);
    return { success: false, error: 'No submitter email found' };
  }

  return sendExpenseEmail(clubId, 'expense_reimbursed', {
    demande,
    recipientEmail: member.email,
    recipientName: member.name,
    reimbursementDate: reimbursementDate || new Date(),
  });
}
