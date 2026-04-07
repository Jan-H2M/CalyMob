import { logger } from '@/utils/logger';
/**
 * Email Template Service
 * Handles CRUD operations for email templates in Firestore
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Handlebars from 'handlebars';
import type {
  EmailTemplate,
  EmailTemplateType,
  TemplateRenderResult,
  TemplateWithZonesResult,
  EditableZone,
} from '@/types/emailTemplates';

/**
 * Get reference to email templates collection
 */
function getTemplatesCollection(clubId: string) {
  return collection(db, 'clubs', clubId, 'email_templates');
}

/**
 * Create a new email template
 */
export async function createTemplate(
  clubId: string,
  templateData: Omit<EmailTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>,
  createdBy: string
): Promise<string> {
  try {
    const templatesRef = getTemplatesCollection(clubId);

    const newTemplate = {
      ...templateData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy,
      usageCount: 0,
    };

    const docRef = await addDoc(templatesRef, newTemplate);
    logger.debug('✅ [EmailTemplateService] Template created:', docRef.id);
    return docRef.id;
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error creating template:', error);
    throw error;
  }
}

/**
 * Update an existing email template
 */
export async function updateTemplate(
  clubId: string,
  templateId: string,
  updates: Partial<Omit<EmailTemplate, 'id' | 'createdAt' | 'createdBy' | 'usageCount'>>,
  updatedBy: string
): Promise<void> {
  try {
    const templateRef = doc(db, 'clubs', clubId, 'email_templates', templateId);

    await updateDoc(templateRef, {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy,
    });

    logger.debug('✅ [EmailTemplateService] Template updated:', templateId);
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error updating template:', error);
    throw error;
  }
}

/**
 * Get a single email template
 */
export async function getTemplate(
  clubId: string,
  templateId: string
): Promise<EmailTemplate | null> {
  try {
    const templateRef = doc(db, 'clubs', clubId, 'email_templates', templateId);
    const templateSnap = await getDoc(templateRef);

    if (!templateSnap.exists()) {
      logger.warn('⚠️ [EmailTemplateService] Template not found:', templateId);
      return null;
    }

    const data = templateSnap.data();

    return {
      id: templateSnap.id,
      ...data,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
      lastUsed: data.lastUsed instanceof Timestamp ? data.lastUsed.toDate() : data.lastUsed,
    } as EmailTemplate;
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error getting template:', error);
    throw error;
  }
}

/**
 * List all email templates (with optional filtering by type)
 */
export async function listTemplates(
  clubId: string,
  emailType?: EmailTemplateType
): Promise<EmailTemplate[]> {
  try {
    const templatesRef = getTemplatesCollection(clubId);

    let q = query(templatesRef, orderBy('updatedAt', 'desc'));

    if (emailType) {
      q = query(templatesRef, where('emailType', '==', emailType), orderBy('updatedAt', 'desc'));
    }

    const snapshot = await getDocs(q);

    const templates = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : data.updatedAt,
        lastUsed: data.lastUsed instanceof Timestamp ? data.lastUsed.toDate() : data.lastUsed,
      } as EmailTemplate;
    });

    logger.debug(`✅ [EmailTemplateService] Loaded ${templates.length} templates`);
    return templates;
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error listing templates:', error);
    throw error;
  }
}

/**
 * Delete an email template
 */
export async function deleteTemplate(clubId: string, templateId: string): Promise<void> {
  try {
    const templateRef = doc(db, 'clubs', clubId, 'email_templates', templateId);
    await deleteDoc(templateRef);
    logger.debug('✅ [EmailTemplateService] Template deleted:', templateId);
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error deleting template:', error);
    throw error;
  }
}

/**
 * Render email template with Handlebars
 */
export function renderTemplate(
  template: EmailTemplate,
  data: Record<string, any>
): TemplateRenderResult {
  try {
    // DEBUG: Log detailed info for troubleshooting
    logger.debug('📧 [renderTemplate] Template emailType:', template.emailType);
    logger.debug('📧 [renderTemplate] Input data keys:', Object.keys(data));

    // Extract all unique variable names from data
    const dataKeys = Object.keys(data);
    logger.debug('📧 [renderTemplate] Data keys available:', dataKeys.join(', '));

    // Check if HTML contains Handlebars variables
    const handlebarsVars = template.htmlContent.match(/\{\{[^}]+\}\}/g) || [];
    const uniqueVars = [...new Set(handlebarsVars)];
    logger.debug('📧 [renderTemplate] Handlebars vars in HTML:', uniqueVars);

    // Check which variables are missing from data
    const simpleVarNames = uniqueVars
      .map(v => v.replace(/\{\{#?(if|each|unless|with|else|\/if|\/each|\/unless|\/with)?\s*/g, '').replace(/\}\}/g, '').trim())
      .filter(v => v && !v.startsWith('/') && !v.startsWith('this.'));

    const missingInData = simpleVarNames.filter(v => !dataKeys.includes(v) && !v.includes('.'));
    if (missingInData.length > 0) {
      logger.warn('⚠️ [renderTemplate] Variables in HTML but NOT in data:', missingInData);
    }

    // Log sample values for expense_submitted specifically
    if (template.emailType === 'expense_submitted') {
      logger.debug('📧 [renderTemplate] expense_submitted data values:', {
        description: data.description,
        montant: data.montant,
        dateDepense: data.dateDepense,
        fournisseur: data.fournisseur,
        categorie: data.categorie,
      });
    }

    // Compile Handlebars templates
    const subjectTemplate = Handlebars.compile(template.subject);
    const htmlTemplate = Handlebars.compile(template.htmlContent);

    // Inject styles into data for easy access
    const dataWithStyles = {
      ...data,
      ...template.styles,
    };

    // Render
    const renderedSubject = subjectTemplate(dataWithStyles);
    const renderedHtml = htmlTemplate(dataWithStyles);

    // DEBUG: Check if variables were replaced
    const remainingVars = renderedHtml.match(/\{\{[^}]+\}\}/g);
    if (remainingVars) {
      logger.warn('⚠️ [renderTemplate] Unreplaced variables in output:', remainingVars);
    }

    // Check for missing required variables
    const missingVariables: string[] = [];
    template.variables
      .filter((v) => v.required)
      .forEach((v) => {
        if (data[v.name] === undefined || data[v.name] === null) {
          missingVariables.push(v.name);
        }
      });

    if (missingVariables.length > 0) {
      logger.warn('⚠️ [EmailTemplateService] Missing required variables:', missingVariables);
    }

    return {
      success: true,
      html: renderedHtml,
      subject: renderedSubject,
      missingVariables: missingVariables.length > 0 ? missingVariables : undefined,
    };
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error rendering template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown rendering error',
    };
  }
}

/**
 * Render email template with editable zones support
 * Zone markers format: <!--ZONE:id:Label-->content<!--/ZONE:id-->
 *
 * @param template The email template to render
 * @param data Data for Handlebars variable replacement
 * @returns Structured result with static parts and editable zones separated
 */
export function renderTemplateWithZones(
  template: EmailTemplate,
  data: Record<string, any>
): TemplateWithZonesResult {
  try {
    logger.debug('📧 [renderTemplateWithZones] Processing template:', template.name);

    // 1. First render all Handlebars variables
    const subjectTemplate = Handlebars.compile(template.subject);
    const htmlTemplate = Handlebars.compile(template.htmlContent);

    const dataWithStyles = {
      ...data,
      ...template.styles,
    };

    const renderedSubject = subjectTemplate(dataWithStyles);
    const renderedHtml = htmlTemplate(dataWithStyles);

    // 2. Parse zones from rendered HTML
    // Format: <!--ZONE:id:Label-->content<!--/ZONE:id-->
    const zonePattern = /<!--ZONE:(\w+):([^>]+)-->([\s\S]*?)<!--\/ZONE:\1-->/g;

    const zones: EditableZone[] = [];
    const staticParts: string[] = [];

    let lastIndex = 0;
    let match;

    while ((match = zonePattern.exec(renderedHtml)) !== null) {
      // Add static part before this zone
      staticParts.push(renderedHtml.substring(lastIndex, match.index));

      // Add the zone
      zones.push({
        id: match[1],
        label: match[2],
        content: match[3].trim(),
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining static part after last zone
    staticParts.push(renderedHtml.substring(lastIndex));

    logger.debug(`📧 [renderTemplateWithZones] Found ${zones.length} editable zones:`, zones.map(z => z.id));

    return {
      success: true,
      subject: renderedSubject,
      zones,
      staticParts,
    };
  } catch (error) {
    logger.error('❌ [renderTemplateWithZones] Error:', error);
    return {
      success: false,
      zones: [],
      staticParts: [],
      error: error instanceof Error ? error.message : 'Unknown rendering error',
    };
  }
}

/**
 * Assemble final email HTML from static parts and editable zones
 * This reconstructs the email after user has edited zones
 *
 * @param staticParts Array of static HTML parts
 * @param zones Array of editable zones with their (possibly modified) content
 * @returns Complete HTML string
 */
export function assembleEmailFromZones(
  staticParts: string[],
  zones: EditableZone[]
): string {
  let result = '';

  for (let i = 0; i < staticParts.length; i++) {
    result += staticParts[i];

    // Add zone content if there's a zone at this position
    if (i < zones.length) {
      result += zones[i].content;
    }
  }

  return result;
}

/**
 * Increment usage count for a template
 */
export async function incrementUsageCount(clubId: string, templateId: string): Promise<void> {
  try {
    const templateRef = doc(db, 'clubs', clubId, 'email_templates', templateId);

    await updateDoc(templateRef, {
      usageCount: (await getDoc(templateRef)).data()?.usageCount || 0 + 1,
      lastUsed: serverTimestamp(),
    });

    logger.debug('✅ [EmailTemplateService] Usage count incremented:', templateId);
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error incrementing usage count:', error);
    // Non-critical error, don't throw
  }
}

/**
 * Duplicate an existing template
 */
export async function duplicateTemplate(
  clubId: string,
  templateId: string,
  createdBy: string
): Promise<string> {
  try {
    const original = await getTemplate(clubId, templateId);
    if (!original) {
      throw new Error('Template not found');
    }

    const { id, createdAt, updatedAt, usageCount, lastUsed, ...templateData } = original;

    const duplicated = {
      ...templateData,
      name: `${original.name} (Copie)`,
      isDefault: false, // Duplicate is never default
    };

    const newId = await createTemplate(clubId, duplicated, createdBy);
    logger.debug('✅ [EmailTemplateService] Template duplicated:', newId);
    return newId;
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error duplicating template:', error);
    throw error;
  }
}

/**
 * Send test email with rendered template to current user
 * Does not require template to be saved first
 */
export async function sendTestEmailFromEditor(
  clubId: string,
  subject: string,
  htmlContent: string,
  sampleData: Record<string, unknown>
): Promise<{ success: boolean; message: string; email?: string }> {
  try {
    // Import dynamically to avoid circular dependencies
    const { auth } = await import('@/lib/firebase');
    const { ClubEmailService } = await import('./clubEmailService');
    const { FirebaseSettingsService } = await import('./firebaseSettingsService');

    const currentUser = auth.currentUser;
    if (!currentUser || !currentUser.email) {
      throw new Error('Vous devez être connecté avec un email pour envoyer un test');
    }

    // Get club settings for logo and name
    const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);

    // Prepare data with club settings and current date
    const now = new Date();
    const templateData = {
      ...sampleData,
      clubName: clubSettings.clubName || 'Calypso Diving Club',
      logoUrl: clubSettings.logoUrl || '',
      appUrl: window.location.origin,
      currentDate: now.toLocaleDateString('fr-FR'),
      currentYear: now.getFullYear().toString(),
      senderName: currentUser.displayName || 'L\'équipe',
      senderEmail: currentUser.email,
    };

    // Render subject and HTML with Handlebars
    const subjectTemplate = Handlebars.compile(subject);
    const htmlTemplate = Handlebars.compile(htmlContent);

    const renderedSubject = `[TEST] ${subjectTemplate(templateData)}`;
    const renderedHtml = htmlTemplate(templateData);

    // Send email
    await ClubEmailService.sendEmail(clubId, currentUser.email, renderedSubject, renderedHtml);

    logger.debug('✅ [EmailTemplateService] Test email sent to:', currentUser.email);
    return {
      success: true,
      message: `Email de test envoyé à ${currentUser.email}`,
      email: currentUser.email,
    };
  } catch (error) {
    logger.error('❌ [EmailTemplateService] Error sending test email:', error);
    const message = error instanceof Error ? error.message : 'Erreur lors de l\'envoi';
    return {
      success: false,
      message,
    };
  }
}

/**
 * Parse editable zones from HTML content
 * Extracts zone markers: <!--ZONE:id:Label-->content<!--/ZONE:id-->
 *
 * @param htmlContent The HTML content to parse
 * @returns Array of editable zones found in the HTML
 */
export function parseZonesFromHtml(htmlContent: string): EditableZone[] {
  const zonePattern = /<!--ZONE:(\w+):([^>]+)-->([\s\S]*?)<!--\/ZONE:\1-->/g;
  const zones: EditableZone[] = [];

  let match;
  while ((match = zonePattern.exec(htmlContent)) !== null) {
    zones.push({
      id: match[1],
      label: match[2],
      content: match[3].trim(),
    });
  }

  logger.debug(`[parseZonesFromHtml] Found ${zones.length} zones:`, zones.map(z => z.id));
  return zones;
}

/**
 * Remove a zone from HTML content by its ID
 * The zone markers and content are removed, replaced by just the content
 *
 * @param htmlContent The HTML content
 * @param zoneId The ID of the zone to remove
 * @returns HTML with the zone markers removed (content preserved)
 */
export function removeZone(htmlContent: string, zoneId: string): string {
  // Pattern to match the specific zone and capture its content
  const zonePattern = new RegExp(
    `<!--ZONE:${zoneId}:[^>]+-->([\\s\\S]*?)<!--\\/ZONE:${zoneId}-->`,
    'g'
  );

  // Replace zone markers with just the content
  const result = htmlContent.replace(zonePattern, '$1');

  logger.debug(`[removeZone] Removed zone "${zoneId}"`);
  return result;
}

/**
 * Add a new zone to HTML content
 * Can insert at a specific position (after another zone) or at the end of body
 *
 * @param htmlContent The HTML content
 * @param zone The zone to add (id, label, content)
 * @param insertAfterZoneId Optional: insert after this zone ID. If not provided, appends before </body>
 * @returns HTML with the new zone added
 */
export function addZone(
  htmlContent: string,
  zone: { id: string; label: string; content: string },
  insertAfterZoneId?: string
): string {
  const zoneMarker = `<!--ZONE:${zone.id}:${zone.label}-->\n            ${zone.content}\n            <!--/ZONE:${zone.id}-->`;

  let result: string;

  if (insertAfterZoneId) {
    // Insert after the specified zone
    const afterPattern = new RegExp(
      `(<!--\\/ZONE:${insertAfterZoneId}-->)`,
      'g'
    );

    if (afterPattern.test(htmlContent)) {
      result = htmlContent.replace(afterPattern, `$1\n\n            ${zoneMarker}`);
    } else {
      // Zone not found, fall back to inserting before </body>
      logger.warn(`[addZone] Zone "${insertAfterZoneId}" not found, inserting before </body>`);
      result = insertBeforeBodyEnd(htmlContent, zoneMarker);
    }
  } else {
    // Insert before </body>
    result = insertBeforeBodyEnd(htmlContent, zoneMarker);
  }

  logger.debug(`[addZone] Added zone "${zone.id}" with label "${zone.label}"`);
  return result;
}

/**
 * Update the content of an existing zone
 *
 * @param htmlContent The HTML content
 * @param zoneId The ID of the zone to update
 * @param newContent The new content for the zone
 * @returns HTML with the zone content updated
 */
export function updateZoneContent(
  htmlContent: string,
  zoneId: string,
  newContent: string
): string {
  const zonePattern = new RegExp(
    `(<!--ZONE:${zoneId}:[^>]+-->)[\\s\\S]*?(<!--\\/ZONE:${zoneId}-->)`,
    'g'
  );

  const result = htmlContent.replace(zonePattern, `$1\n            ${newContent}\n            $2`);

  logger.debug(`[updateZoneContent] Updated zone "${zoneId}"`);
  return result;
}

/**
 * Update the label of an existing zone
 *
 * @param htmlContent The HTML content
 * @param zoneId The ID of the zone to update
 * @param newLabel The new label for the zone
 * @returns HTML with the zone label updated
 */
export function updateZoneLabel(
  htmlContent: string,
  zoneId: string,
  newLabel: string
): string {
  const zonePattern = new RegExp(
    `<!--ZONE:${zoneId}:[^>]+-->`,
    'g'
  );

  const result = htmlContent.replace(zonePattern, `<!--ZONE:${zoneId}:${newLabel}-->`);

  logger.debug(`[updateZoneLabel] Updated zone "${zoneId}" label to "${newLabel}"`);
  return result;
}

/**
 * Helper function to insert content before the closing </body> tag
 */
function insertBeforeBodyEnd(htmlContent: string, contentToInsert: string): string {
  // Try to find </body>
  const bodyEndPattern = /<\/body>/i;
  if (bodyEndPattern.test(htmlContent)) {
    return htmlContent.replace(bodyEndPattern, `\n            ${contentToInsert}\n          </body>`);
  }

  // If no </body>, try </table> (many email templates use table-based layout)
  const lastTablePattern = /(<\/table>\s*)$/i;
  if (lastTablePattern.test(htmlContent)) {
    return htmlContent.replace(lastTablePattern, `\n            ${contentToInsert}\n          $1`);
  }

  // Fallback: append at the end
  return htmlContent + `\n${contentToInsert}`;
}
