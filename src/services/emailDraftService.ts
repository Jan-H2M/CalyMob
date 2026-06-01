import { logger } from '@/utils/logger';
/**
 * Email Draft Service
 * Handles saving and loading email drafts
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';

export interface EmailDraft {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  // Recipient filters (saved for convenience)
  recipientFilters?: {
    clubStatuten?: string[];
    roles?: string[];
    membershipCategories?: string[];
    formationAudiences?: string[];
    activeOnly?: boolean;
    withAppAccess?: boolean;
    individualIds?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  createdByName: string;
}

export interface CreateEmailDraftParams {
  name: string;
  subject: string;
  htmlContent: string;
  recipientFilters?: EmailDraft['recipientFilters'];
  createdBy: string;
  createdByName: string;
}

export interface UpdateEmailDraftParams {
  name?: string;
  subject?: string;
  htmlContent?: string;
  recipientFilters?: EmailDraft['recipientFilters'];
}

/**
 * Get all email drafts for a club
 */
export async function getEmailDrafts(clubId: string): Promise<EmailDraft[]> {
  try {
    const draftsRef = collection(db, 'clubs', clubId, 'email_drafts');
    const q = query(draftsRef, orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    const drafts: EmailDraft[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || 'Sans titre',
        subject: data.subject || '',
        htmlContent: data.htmlContent || '',
        recipientFilters: data.recipientFilters,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        createdBy: data.createdBy || '',
        createdByName: data.createdByName || '',
      };
    });

    logger.debug(`✅ [EmailDraftService] Loaded ${drafts.length} drafts`);
    return drafts;
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error loading drafts:', error);
    throw error;
  }
}

/**
 * Get a single email draft by ID
 */
export async function getEmailDraft(clubId: string, draftId: string): Promise<EmailDraft | null> {
  try {
    const draftRef = doc(db, 'clubs', clubId, 'email_drafts', draftId);
    const snapshot = await getDoc(draftRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: snapshot.id,
      name: data.name || 'Sans titre',
      subject: data.subject || '',
      htmlContent: data.htmlContent || '',
      recipientFilters: data.recipientFilters,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      createdBy: data.createdBy || '',
      createdByName: data.createdByName || '',
    };
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error loading draft:', error);
    throw error;
  }
}

/**
 * Create a new email draft
 */
export async function createEmailDraft(
  clubId: string,
  params: CreateEmailDraftParams
): Promise<string> {
  try {
    const draftsRef = collection(db, 'clubs', clubId, 'email_drafts');

    const docRef = await addDoc(draftsRef, {
      name: params.name,
      subject: params.subject,
      htmlContent: params.htmlContent,
      recipientFilters: params.recipientFilters || null,
      createdBy: params.createdBy,
      createdByName: params.createdByName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    logger.debug(`✅ [EmailDraftService] Draft created: ${docRef.id}`);
    return docRef.id;
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error creating draft:', error);
    throw error;
  }
}

/**
 * Update an existing email draft
 */
export async function updateEmailDraft(
  clubId: string,
  draftId: string,
  params: UpdateEmailDraftParams
): Promise<void> {
  try {
    const draftRef = doc(db, 'clubs', clubId, 'email_drafts', draftId);

    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (params.name !== undefined) updateData.name = params.name;
    if (params.subject !== undefined) updateData.subject = params.subject;
    if (params.htmlContent !== undefined) updateData.htmlContent = params.htmlContent;
    if (params.recipientFilters !== undefined) updateData.recipientFilters = params.recipientFilters;

    await updateDoc(draftRef, updateData);

    logger.debug(`✅ [EmailDraftService] Draft updated: ${draftId}`);
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error updating draft:', error);
    throw error;
  }
}

/**
 * Delete an email draft
 */
export async function deleteEmailDraft(clubId: string, draftId: string): Promise<void> {
  try {
    const draftRef = doc(db, 'clubs', clubId, 'email_drafts', draftId);
    await deleteDoc(draftRef);

    logger.debug(`✅ [EmailDraftService] Draft deleted: ${draftId}`);
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error deleting draft:', error);
    throw error;
  }
}

/**
 * Duplicate an email draft
 */
export async function duplicateEmailDraft(
  clubId: string,
  draftId: string,
  userId: string,
  userName: string
): Promise<string> {
  try {
    const original = await getEmailDraft(clubId, draftId);
    if (!original) {
      throw new Error('Draft not found');
    }

    const newDraftId = await createEmailDraft(clubId, {
      name: `${original.name} (copie)`,
      subject: original.subject,
      htmlContent: original.htmlContent,
      recipientFilters: original.recipientFilters,
      createdBy: userId,
      createdByName: userName,
    });

    logger.debug(`✅ [EmailDraftService] Draft duplicated: ${draftId} -> ${newDraftId}`);
    return newDraftId;
  } catch (error) {
    logger.error('❌ [EmailDraftService] Error duplicating draft:', error);
    throw error;
  }
}
