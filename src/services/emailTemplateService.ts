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
    console.log('✅ [EmailTemplateService] Template created:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error creating template:', error);
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

    console.log('✅ [EmailTemplateService] Template updated:', templateId);
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error updating template:', error);
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
      console.warn('⚠️ [EmailTemplateService] Template not found:', templateId);
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
    console.error('❌ [EmailTemplateService] Error getting template:', error);
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

    console.log(`✅ [EmailTemplateService] Loaded ${templates.length} templates`);
    return templates;
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error listing templates:', error);
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
    console.log('✅ [EmailTemplateService] Template deleted:', templateId);
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error deleting template:', error);
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
      console.warn('⚠️ [EmailTemplateService] Missing required variables:', missingVariables);
    }

    return {
      success: true,
      html: renderedHtml,
      missingVariables: missingVariables.length > 0 ? missingVariables : undefined,
    };
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error rendering template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown rendering error',
    };
  }
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

    console.log('✅ [EmailTemplateService] Usage count incremented:', templateId);
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error incrementing usage count:', error);
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
    console.log('✅ [EmailTemplateService] Template duplicated:', newId);
    return newId;
  } catch (error) {
    console.error('❌ [EmailTemplateService] Error duplicating template:', error);
    throw error;
  }
}
