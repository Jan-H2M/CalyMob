/**
 * Annonce Service
 * Service for managing club announcements in Firestore
 * Compatible with Flutter CalyMob app
 *
 * Firestore Collection: clubs/{clubId}/announcements
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  onSnapshot,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { MessageAttachment, ReplyPreview, AnnouncementReply } from '@/types/communication';

// Collection name matches Flutter app
const COLLECTION_NAME = 'announcements';

/**
 * Annonce type - matches Flutter app enum
 */
export type AnnonceType = 'info' | 'warning' | 'urgent';

/**
 * Annonce document stored in Firestore
 * Collection: clubs/{clubId}/announcements
 *
 * Field names match Flutter model:
 * - title
 * - message (not body)
 * - sender_id (not author_id)
 * - sender_name (not author_name)
 * - type
 * - created_at
 */
export interface Annonce {
  id: string;

  // Content
  title: string;
  message: string;  // Flutter uses 'message', not 'body'
  type: AnnonceType;

  // Sender (Flutter uses sender_id/sender_name)
  sender_id: string;
  sender_name: string;

  // Metadata
  created_at: Date;
  reply_count?: number;
  attachments?: MessageAttachment[];
  deleted_at?: Date | null;
  deleted_by?: string | null;
}

/**
 * Convert Firestore document to Annonce
 */
function docToAnnonce(doc: any): Annonce {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title || '',
    message: data.message || '',
    type: data.type || 'info',
    sender_id: data.sender_id || '',
    sender_name: data.sender_name || '',
    created_at: data.created_at?.toDate() || new Date(),
    reply_count: data.reply_count || 0,
    attachments: data.attachments || [],
  };
}

/**
 * Convert Annonce to Firestore document data
 */
function annonceToDoc(annonce: Partial<Annonce>): Record<string, any> {
  const data: Record<string, any> = {};

  if (annonce.title !== undefined) data.title = annonce.title;
  if (annonce.message !== undefined) data.message = annonce.message;
  if (annonce.type !== undefined) data.type = annonce.type;
  if (annonce.sender_id !== undefined) data.sender_id = annonce.sender_id;
  if (annonce.sender_name !== undefined) data.sender_name = annonce.sender_name;
  if (annonce.attachments !== undefined) data.attachments = annonce.attachments;

  return data;
}

/**
 * Get all active (non-deleted) annonces for a club
 */
export async function getAnnonces(clubId: string): Promise<Annonce[]> {
  const annoncesRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
  const q = query(annoncesRef, orderBy('created_at', 'desc'));
  const snapshot = await getDocs(q);

  // Filtrer les soft-deleted
  return snapshot.docs
    .filter(doc => !doc.data().deleted_at)
    .map(docToAnnonce);
}

/**
 * Get a single annonce by ID
 */
export async function getAnnonce(clubId: string, annonceId: string): Promise<Annonce | null> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return docToAnnonce(snapshot);
}

/**
 * Create a new annonce
 */
export async function createAnnonce(
  clubId: string,
  annonce: Omit<Annonce, 'id' | 'created_at'>
): Promise<Annonce> {
  const annoncesRef = collection(db, 'clubs', clubId, COLLECTION_NAME);

  const data = {
    ...annonceToDoc(annonce),
    created_at: Timestamp.now(),
  };

  const docRef = await addDoc(annoncesRef, data);

  return {
    ...annonce,
    id: docRef.id,
    created_at: new Date(),
  } as Annonce;
}

/**
 * Update an existing annonce
 */
export async function updateAnnonce(
  clubId: string,
  annonceId: string,
  updates: Partial<Annonce>
): Promise<void> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(docRef, annonceToDoc(updates));
}

/**
 * Soft-delete an annonce (marque deleted_at au lieu de supprimer physiquement)
 */
export async function deleteAnnonce(clubId: string, annonceId: string, deletedByUserId?: string): Promise<void> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(docRef, {
    deleted_at: Timestamp.now(),
    deleted_by: deletedByUserId || 'unknown',
  });
}

/**
 * Restore a soft-deleted annonce
 */
export async function restoreAnnonce(clubId: string, annonceId: string): Promise<void> {
  const { deleteField } = await import('firebase/firestore');
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(docRef, {
    deleted_at: deleteField(),
    deleted_by: deleteField(),
  });
}

/**
 * Get type display info
 */
export function getTypeInfo(type: AnnonceType): { label: string; color: string; bgColor: string; icon: string } {
  switch (type) {
    case 'info':
      return { label: 'Info', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: 'ℹ️' };
    case 'warning':
      return { label: 'Avertissement', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: '⚠️' };
    case 'urgent':
      return { label: 'Urgent', color: 'text-red-600', bgColor: 'bg-red-100', icon: '🚨' };
    default:
      return { label: type, color: 'text-gray-600 dark:text-dark-text-secondary', bgColor: 'bg-gray-100 dark:bg-dark-bg-tertiary', icon: '📢' };
  }
}

// ==================== READ TRACKING ====================

/**
 * Mark an announcement as read by a user
 */
export async function markAnnonceAsRead(
  clubId: string,
  annonceId: string,
  userId: string
): Promise<void> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(docRef, {
    read_by: arrayUnion(userId)
  });
}

// ==================== REPLIES ====================

/**
 * Get replies for an announcement
 */
export async function getAnnonceReplies(
  clubId: string,
  annonceId: string
): Promise<AnnouncementReply[]> {
  const repliesRef = collection(db, 'clubs', clubId, COLLECTION_NAME, annonceId, 'replies');
  const q = query(repliesRef, orderBy('created_at', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    created_at: (doc.data().created_at as Timestamp)?.toDate() || new Date()
  })) as AnnouncementReply[];
}

/**
 * Subscribe to real-time updates for announcement replies
 */
export function subscribeToAnnonceReplies(
  clubId: string,
  annonceId: string,
  callback: (replies: AnnouncementReply[]) => void
): () => void {
  const repliesRef = collection(db, 'clubs', clubId, COLLECTION_NAME, annonceId, 'replies');
  const q = query(repliesRef, orderBy('created_at', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const replies = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: (doc.data().created_at as Timestamp)?.toDate() || new Date()
    })) as AnnouncementReply[];
    callback(replies);
  });
}

/**
 * Send a reply to an announcement
 */
export async function sendAnnonceReply(
  clubId: string,
  annonceId: string,
  senderId: string,
  senderName: string,
  message: string,
  options?: {
    replyToId?: string;
    replyToPreview?: ReplyPreview;
    attachments?: MessageAttachment[];
  }
): Promise<string> {
  const repliesRef = collection(db, 'clubs', clubId, COLLECTION_NAME, annonceId, 'replies');

  const replyData: Record<string, unknown> = {
    sender_id: senderId,
    sender_name: senderName,
    message: message.trim(),
    created_at: Timestamp.now(),
    read_by: [senderId],
  };

  if (options?.replyToId) {
    replyData.reply_to_id = options.replyToId;
  }
  if (options?.replyToPreview) {
    replyData.reply_to_preview = options.replyToPreview;
  }
  if (options?.attachments && options.attachments.length > 0) {
    replyData.attachments = options.attachments;
  }

  const docRef = await addDoc(repliesRef, replyData);

  // Increment reply count on the announcement
  const annonceRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(annonceRef, {
    reply_count: increment(1)
  });

  return docRef.id;
}

/**
 * Delete a reply from an announcement
 */
export async function deleteAnnonceReply(
  clubId: string,
  annonceId: string,
  replyId: string
): Promise<void> {
  const replyRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId, 'replies', replyId);
  await deleteDoc(replyRef);

  // Decrement reply count
  const annonceRef = doc(db, 'clubs', clubId, COLLECTION_NAME, annonceId);
  await updateDoc(annonceRef, {
    reply_count: increment(-1)
  });
}

/**
 * Upload an attachment for an announcement reply
 */
export async function uploadAnnonceAttachment(
  clubId: string,
  annonceId: string,
  file: File,
  type: 'image' | 'pdf'
): Promise<MessageAttachment> {
  const timestamp = Date.now();
  const filename = file.name;
  const storagePath = `clubs/${clubId}/announcements/${annonceId}/attachments/${timestamp}_${filename}`;

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file);

  const url = await getDownloadURL(storageRef);

  return {
    type,
    url,
    filename,
    size: file.size
  };
}

/**
 * Create a reply preview from an existing reply
 */
export function createAnnonceReplyPreview(reply: AnnouncementReply): ReplyPreview {
  const preview = reply.message.length > 50
    ? `${reply.message.substring(0, 50)}...`
    : reply.message;

  return {
    sender_name: reply.sender_name,
    message_preview: preview
  };
}
