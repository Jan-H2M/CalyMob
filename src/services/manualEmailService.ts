import { logger } from '@/utils/logger';
/**
 * Manual Email Service
 * Handles sending bulk emails to selected recipients
 */

import { auth, db } from '@/lib/firebase';
import {
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { getTemplate, renderTemplate } from './emailTemplateService';
import { FirebaseSettingsService } from './firebaseSettingsService';
import { ClubEmailService } from './clubEmailService';
import Handlebars from 'handlebars';
import type { Membre } from '@/types';
import type { MembershipPeriod } from '@/types/cotisations.types';

export interface RecipientFilters {
  clubStatuten?: string[]; // ['CA', 'Encadrants']
  roles?: string[]; // ['admin', 'validateur', 'user']
  membershipCategories?: string[]; // ['membre_1ere', 'instructeur_oa']
  activeOnly?: boolean;
  withAppAccess?: boolean;
  individualIds?: string[]; // Specific member IDs to include
}

export interface ManualEmailRecipient {
  id: string;
  email: string;
  nom: string;
  prenom: string;
  displayName?: string;
  membership_category_code?: string;
  membership_period?: MembershipPeriod;
}

export type ManualEmailCategoryPrices = Record<string, Partial<Record<MembershipPeriod, string>>>;

/**
 * Delay between individual email sends (ms) to avoid rate limiting
 * from the email provider (Gmail/Resend). 1.5s ≈ 40 emails/min.
 */
const SEND_DELAY_MS = 1500;

export interface SendManualEmailParams {
  clubId: string;
  templateId: string;
  subject: string;
  recipients: ManualEmailRecipient[];
  customVariables?: Record<string, any>;
  sentByUserId: string;
  sentByName: string;
}

export interface SendManualEmailSimpleParams {
  clubId: string;
  subject: string;
  messageBody: string;
  recipients: ManualEmailRecipient[];
  sentByUserId: string;
  sentByName: string;
  categoryLabels?: Record<string, string>;
  categoryPrices?: ManualEmailCategoryPrices;
  onProgress?: (sent: number, total: number) => void;
}

export interface SendManualEmailResult {
  success: boolean;
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  errors: Array<{ email: string; error: string }>;
}

/**
 * Get all available clubStatuten values from value_lists
 */
export async function getClubStatutenOptions(clubId: string): Promise<string[]> {
  try {
    // Try to get from value_lists first
    const valueListRef = collection(db, 'clubs', clubId, 'value_lists');
    const q = query(valueListRef, where('name', '==', 'clubStatuten'));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      if (data.values && Array.isArray(data.values)) {
        return data.values;
      }
    }

    // Fallback: get unique values from members
    const membersRef = collection(db, 'clubs', clubId, 'members');
    const membersSnapshot = await getDocs(membersRef);

    const uniqueStatuten = new Set<string>();
    membersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.clubStatuten && Array.isArray(data.clubStatuten)) {
        data.clubStatuten.forEach((s: string) => uniqueStatuten.add(s));
      }
    });

    return Array.from(uniqueStatuten).sort();
  } catch (error) {
    logger.error('❌ [ManualEmailService] Error getting clubStatuten options:', error);
    return ['Membre', 'CA', 'Encadrants']; // Default fallback
  }
}

/**
 * Get recipients based on filters
 */
export async function getRecipients(
  clubId: string,
  filters: RecipientFilters
): Promise<ManualEmailRecipient[]> {
  try {
    const membersRef = collection(db, 'clubs', clubId, 'members');
    const snapshot = await getDocs(membersRef);

    const recipients: ManualEmailRecipient[] = [];
    const seenEmails = new Set<string>();

    snapshot.docs.forEach((doc) => {
      const data = doc.data() as Membre;

      // Skip invalid emails
      if (!data.email || data.email.includes('placeholder') || data.email.includes('test@')) {
        return;
      }

      // Skip duplicates
      if (seenEmails.has(data.email.toLowerCase())) {
        return;
      }

      // Check active status
      if (filters.activeOnly) {
        const legacyIsActive = data.isActive as boolean | string | undefined;
        const isActive =
          data.member_status === 'active' ||
          data.app_status === 'active' ||
          data.status === 'active' ||
          legacyIsActive === true ||
          legacyIsActive === 'true';
        if (!isActive) {
          return;
        }
      }

      // Check app access
      if (filters.withAppAccess && !data.has_app_access) {
        return;
      }

      // Check individual IDs
      if (filters.individualIds && filters.individualIds.length > 0) {
        if (filters.individualIds.includes(doc.id)) {
          seenEmails.add(data.email.toLowerCase());
          recipients.push({
            id: doc.id,
            email: data.email,
            nom: data.nom || '',
            prenom: data.prenom || '',
            displayName: data.displayName,
            membership_category_code: data.membership_category_code || undefined,
            membership_period: data.membership_period || undefined,
          });
        }
        // If individual IDs are specified, don't apply other filters
        return;
      }

      // Check clubStatuten
      if (filters.clubStatuten && filters.clubStatuten.length > 0) {
        const memberStatuten = data.clubStatuten || [];
        if (!filters.clubStatuten.some((s) => memberStatuten.includes(s))) {
          return;
        }
      }

      // Check roles
      if (filters.roles && filters.roles.length > 0) {
        const memberRole = data.app_role;
        if (!memberRole || !filters.roles.includes(memberRole)) {
          return;
        }
      }

      // Check membership categories
      if (filters.membershipCategories && filters.membershipCategories.length > 0) {
        const memberCategory = data.membership_category_code;
        if (!memberCategory || !filters.membershipCategories.includes(memberCategory)) {
          return;
        }
      }

      seenEmails.add(data.email.toLowerCase());
      recipients.push({
        id: doc.id,
        email: data.email,
        nom: data.nom || '',
        prenom: data.prenom || '',
        displayName: data.displayName,
        membership_category_code: data.membership_category_code || undefined,
        membership_period: data.membership_period || undefined,
      });
    });

    // Sort by name
    recipients.sort((a, b) => {
      const nameA = `${a.nom} ${a.prenom}`.toLowerCase();
      const nameB = `${b.nom} ${b.prenom}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    logger.debug(`✅ [ManualEmailService] Found ${recipients.length} recipients`);
    return recipients;
  } catch (error) {
    logger.error('❌ [ManualEmailService] Error getting recipients:', error);
    throw error;
  }
}

/**
 * Get all members for individual selection
 */
export async function getAllMembersForSelection(
  clubId: string,
  activeOnly: boolean = true
): Promise<ManualEmailRecipient[]> {
  return getRecipients(clubId, {
    activeOnly,
    withAppAccess: false,
  });
}

/**
 * Send manual email to multiple recipients
 */
export async function sendManualEmail(
  params: SendManualEmailParams
): Promise<SendManualEmailResult> {
  const { clubId, templateId, subject, recipients, customVariables, sentByUserId, sentByName } =
    params;

  const result: SendManualEmailResult = {
    success: true,
    totalRecipients: recipients.length,
    successCount: 0,
    failedCount: 0,
    errors: [],
  };

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to send emails');
    }

    // Get template
    const template = await getTemplate(clubId, templateId);
    if (!template) {
      throw new Error('Template non trouvé');
    }

    // Get club settings
    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);

    // Send to each recipient
    for (const recipient of recipients) {
      try {
        // Prepare template data for this recipient
        const recipientName = `${recipient.prenom} ${recipient.nom}`.trim() || recipient.displayName || recipient.email;

        const templateData = {
          recipientName,
          firstName: recipient.prenom,
          lastName: recipient.nom,
          email: recipient.email,
          clubName: clubSettings.clubName || 'Calypso Diving Club',
          logoUrl: clubSettings.logoUrl || '',
          appUrl: window.location.origin,
          ...template.styles,
          ...customVariables,
        };

        // Render template
        const renderResult = renderTemplate(template, templateData);
        if (!renderResult.success || !renderResult.html) {
          throw new Error(renderResult.error || 'Erreur lors du rendu du template');
        }

        // Render subject
        const subjectTemplate = Handlebars.compile(subject);
        const renderedSubject = subjectTemplate(templateData);

        // Send email
        await ClubEmailService.sendEmail(
          clubId,
          recipient.email,
          renderedSubject,
          renderResult.html,
          undefined,
          undefined,
          undefined,
          {
            recipientName,
            recipientId: recipient.id,
            templateId,
            templateName: template.name,
            sendType: 'manual',
            sentBy: sentByUserId,
            sentByName,
          }
        );

        result.successCount++;
      } catch (error: any) {
        logger.error(`❌ Failed to send to ${recipient.email}:`, error);
        result.errors.push({
          email: recipient.email,
          error: error.message || 'Unknown error',
        });
        result.failedCount++;
      }

      // Rate-limit delay between sends (skip after last one)
      const sent = result.successCount + result.failedCount;
      if (sent < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS));
      }
    }

    result.success = result.failedCount === 0;
    logger.debug(`✅ [ManualEmailService] Sent ${result.successCount}/${result.totalRecipients} emails`);
    return result;
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error sending manual emails:', error);
    throw error;
  }
}

/**
 * Send test email to current user
 */
export async function sendTestEmail(
  clubId: string,
  templateId: string,
  subject: string,
  customVariables?: Record<string, any>
): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('User must be authenticated with email to send test');
    }

    // Get template
    const template = await getTemplate(clubId, templateId);
    if (!template) {
      throw new Error('Template non trouvé');
    }

    // Get club settings
    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);

    // Prepare test data
    const templateData = {
      recipientName: currentUser.displayName || currentUser.email,
      firstName: 'Test',
      lastName: 'User',
      email: currentUser.email,
      clubName: clubSettings.clubName || 'Calypso Diving Club',
      logoUrl: clubSettings.logoUrl || '',
      appUrl: window.location.origin,
      ...template.styles,
      ...customVariables,
    };

    // Render template
    const renderResult = renderTemplate(template, templateData);
    if (!renderResult.success || !renderResult.html) {
      throw new Error(renderResult.error || 'Erreur lors du rendu du template');
    }

    // Render subject
    const subjectTemplate = Handlebars.compile(subject);
    const renderedSubject = `[TEST] ${subjectTemplate(templateData)}`;

    // Send email
    await ClubEmailService.sendEmail(clubId, currentUser.email, renderedSubject, renderResult.html);

    return {
      success: true,
      message: `Email de test envoyé à ${currentUser.email}`,
    };
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error sending test email:', error);
    throw error;
  }
}

/**
 * Preview rendered email without sending
 */
export async function previewEmail(
  clubId: string,
  templateId: string,
  subject: string,
  customVariables?: Record<string, any>
): Promise<{ subject: string; html: string }> {
  try {
    const template = await getTemplate(clubId, templateId);
    if (!template) {
      throw new Error('Template non trouvé');
    }

    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);

    const templateData = {
      recipientName: 'Prénom Nom',
      firstName: 'Prénom',
      lastName: 'Nom',
      email: 'exemple@email.com',
      clubName: clubSettings.clubName || 'Calypso Diving Club',
      logoUrl: clubSettings.logoUrl || '',
      appUrl: window.location.origin,
      ...template.styles,
      ...customVariables,
    };

    const renderResult = renderTemplate(template, templateData);
    if (!renderResult.success || !renderResult.html) {
      throw new Error(renderResult.error || 'Erreur lors du rendu du template');
    }

    const subjectTemplate = Handlebars.compile(subject);
    const renderedSubject = subjectTemplate(templateData);

    return {
      subject: renderedSubject,
      html: renderResult.html,
    };
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error previewing email:', error);
    throw error;
  }
}

/**
 * Generate HTML email with logo header and footer
 * Matches the style of automated emails (pending_demands, etc.)
 * White background with centered logo, like the notification emails
 * Accepts HTML content from the WYSIWYG editor
 */
function generateSimpleEmailHtml(
  htmlContent: string,
  clubName: string,
  logoUrl: string
): string {
  const primaryColor = '#3B82F6';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${clubName}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">

  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0 30px 0;">
    ${logoUrl ? `<img src="${logoUrl}" alt="${clubName}" style="max-width: 200px; height: auto;">` : `<h1 style="margin: 0; font-size: 28px; color: ${primaryColor};">${clubName}</h1>`}
  </div>

  <!-- Body -->
  <div style="padding: 0 10px;">
    ${htmlContent}
  </div>

  <!-- Footer -->
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center;">
    <p style="margin: 0 0 5px 0; font-size: 14px; color: ${primaryColor}; font-weight: 500;">
      ${clubName}
    </p>
    <p style="margin: 0; font-size: 12px; color: #9CA3AF;">
      Cet email a été envoyé via CalyCompta
    </p>
  </div>

</body>
</html>
  `.trim();
}

/**
 * Preview email without template (simple version)
 */
export async function previewEmailSimple(
  clubId: string,
  subject: string,
  htmlContent: string,
  previewRecipient?: ManualEmailRecipient,
  categoryLabels?: Record<string, string>,
  categoryPrices?: ManualEmailCategoryPrices
): Promise<{ subject: string; html: string }> {
  try {
    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
    const clubName = clubSettings.clubName || 'Calypso Diving Club';
    const logoUrl = clubSettings.logoUrl || '';

    const mergeRecipient = previewRecipient || {
      id: 'preview',
      email: 'exemple@email.com',
      nom: 'Dupont',
      prenom: 'Jean',
    };
    const personalizedSubject = replaceMailMergePlaceholders(subject, mergeRecipient, categoryLabels, categoryPrices);
    const personalizedContent = replaceMailMergePlaceholders(htmlContent, mergeRecipient, categoryLabels, categoryPrices);
    const html = generateSimpleEmailHtml(personalizedContent, clubName, logoUrl);

    return {
      subject: personalizedSubject,
      html,
    };
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error previewing simple email:', error);
    throw error;
  }
}

/**
 * Send test email to current user (simple version)
 */
export async function sendTestEmailSimple(
  clubId: string,
  subject: string,
  htmlContent: string,
  previewRecipient?: ManualEmailRecipient,
  categoryLabels?: Record<string, string>,
  categoryPrices?: ManualEmailCategoryPrices
): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('User must be authenticated with email to send test');
    }

    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
    const clubName = clubSettings.clubName || 'Calypso Diving Club';
    const logoUrl = clubSettings.logoUrl || '';

    const mergeRecipient = previewRecipient || {
      id: 'preview',
      email: currentUser.email,
      nom: 'Dupont',
      prenom: 'Jean',
    };
    const personalizedSubject = replaceMailMergePlaceholders(subject, mergeRecipient, categoryLabels, categoryPrices);
    const personalizedContent = replaceMailMergePlaceholders(htmlContent, mergeRecipient, categoryLabels, categoryPrices);
    const html = generateSimpleEmailHtml(personalizedContent, clubName, logoUrl);
    const testSubject = `[TEST] ${personalizedSubject}`;

    await ClubEmailService.sendEmail(clubId, currentUser.email, testSubject, html);

    return {
      success: true,
      message: `Email de test envoyé à ${currentUser.email}`,
    };
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error sending test simple email:', error);
    throw error;
  }
}

/**
 * Replace mail merge placeholders with recipient data
 * Supported placeholders: {{prenom}}, {{nom}}, {{type_membre}}, {{cotisation}}
 */
function replaceMailMergePlaceholders(
  content: string,
  recipient: ManualEmailRecipient,
  categoryLabels?: Record<string, string>,
  categoryPrices?: ManualEmailCategoryPrices
): string {
  const typeMembre = recipient.membership_category_code && categoryLabels
    ? categoryLabels[recipient.membership_category_code] || ''
    : '';
  const categoryPriceSet = recipient.membership_category_code && categoryPrices
    ? categoryPrices[recipient.membership_category_code]
    : undefined;

  let cotisation = '';
  if (categoryPriceSet) {
    if (recipient.membership_period && categoryPriceSet[recipient.membership_period]) {
      cotisation = categoryPriceSet[recipient.membership_period] || '';
    } else if (categoryPriceSet.jan_dec && !categoryPriceSet.sept_dec) {
      cotisation = categoryPriceSet.jan_dec;
    } else if (categoryPriceSet.sept_dec && !categoryPriceSet.jan_dec) {
      cotisation = categoryPriceSet.sept_dec;
    }
  }

  return content
    .replace(/\{\{prenom\}\}/gi, recipient.prenom || '')
    .replace(/\{\{nom\}\}/gi, recipient.nom || '')
    .replace(/\{\{type_membre\}\}/gi, typeMembre)
    .replace(/\{\{cotisation\}\}/gi, cotisation);
}

/**
 * Send manual email to multiple recipients (simple version without template)
 * Supports mail merge in both subject and body
 */
export async function sendManualEmailSimple(
  params: SendManualEmailSimpleParams
): Promise<SendManualEmailResult> {
  const { clubId, subject, messageBody, recipients, sentByUserId, sentByName, categoryLabels, categoryPrices, onProgress } = params;

  const result: SendManualEmailResult = {
    success: true,
    totalRecipients: recipients.length,
    successCount: 0,
    failedCount: 0,
    errors: [],
  };

  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to send emails');
    }

    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
    const clubName = clubSettings.clubName || 'Calypso Diving Club';
    const logoUrl = clubSettings.logoUrl || '';

    // Send to each recipient with personalized content
    for (const recipient of recipients) {
      const personalizedSubject = replaceMailMergePlaceholders(subject, recipient, categoryLabels, categoryPrices);

      try {
        const recipientName = `${recipient.prenom} ${recipient.nom}`.trim() || recipient.displayName || recipient.email;

        // Replace mail merge placeholders for this recipient
        const personalizedContent = replaceMailMergePlaceholders(messageBody, recipient, categoryLabels, categoryPrices);
        const personalizedHtml = generateSimpleEmailHtml(personalizedContent, clubName, logoUrl);

        await ClubEmailService.sendEmail(
          clubId,
          recipient.email,
          personalizedSubject,
          personalizedHtml,
          undefined,
          undefined,
          undefined,
          {
            recipientName,
            recipientId: recipient.id,
            sendType: 'manual',
            sentBy: sentByUserId,
            sentByName,
          }
        );

        result.successCount++;
      } catch (error: any) {
        logger.error(`❌ Failed to send to ${recipient.email}:`, error);
        result.errors.push({
          email: recipient.email,
          error: error.message || 'Unknown error',
        });
        result.failedCount++;
      }

      // Report progress
      const sent = result.successCount + result.failedCount;
      if (onProgress) {
        onProgress(sent, recipients.length);
      }

      // Rate-limit delay between sends (skip after last one)
      if (sent < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, SEND_DELAY_MS));
      }
    }

    result.success = result.failedCount === 0;
    logger.debug(`✅ [ManualEmailService] Sent ${result.successCount}/${result.totalRecipients} emails`);
    return result;
  } catch (error: any) {
    logger.error('❌ [ManualEmailService] Error sending manual simple emails:', error);
    throw error;
  }
}
