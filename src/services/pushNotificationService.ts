/**
 * Push Notification Service
 * Service for managing push notifications in Firestore
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
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PushNotification, PushNotificationStatus, PushNotificationAudience } from '@/types/communication';

const COLLECTION_NAME = 'push_notifications';

/**
 * Convert Firestore document to PushNotification
 */
function docToNotification(doc: any): PushNotification {
  const data = doc.data();
  return {
    id: doc.id,
    title: data.title || '',
    body: data.body || '',
    imageUrl: data.imageUrl,
    audience: data.audience || 'all',
    targetRoles: data.targetRoles,
    targetMemberIds: data.targetMemberIds,
    status: data.status || 'brouillon',
    scheduledAt: data.scheduledAt?.toDate(),
    sentAt: data.sentAt?.toDate(),
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    createdBy: data.createdBy || '',
    createdByName: data.createdByName,
    recipientCount: data.recipientCount,
    successCount: data.successCount,
    failureCount: data.failureCount,
  };
}

/**
 * Convert PushNotification to Firestore document data
 */
function notificationToDoc(notification: Partial<PushNotification>): Record<string, any> {
  const data: Record<string, any> = {};

  if (notification.title !== undefined) data.title = notification.title;
  if (notification.body !== undefined) data.body = notification.body;
  if (notification.imageUrl !== undefined) data.imageUrl = notification.imageUrl;
  if (notification.audience !== undefined) data.audience = notification.audience;
  if (notification.targetRoles !== undefined) data.targetRoles = notification.targetRoles;
  if (notification.targetMemberIds !== undefined) data.targetMemberIds = notification.targetMemberIds;
  if (notification.status !== undefined) data.status = notification.status;
  if (notification.scheduledAt !== undefined) {
    data.scheduledAt = notification.scheduledAt ? Timestamp.fromDate(notification.scheduledAt) : null;
  }
  if (notification.sentAt !== undefined) {
    data.sentAt = notification.sentAt ? Timestamp.fromDate(notification.sentAt) : null;
  }
  if (notification.createdBy !== undefined) data.createdBy = notification.createdBy;
  if (notification.createdByName !== undefined) data.createdByName = notification.createdByName;
  if (notification.recipientCount !== undefined) data.recipientCount = notification.recipientCount;
  if (notification.successCount !== undefined) data.successCount = notification.successCount;
  if (notification.failureCount !== undefined) data.failureCount = notification.failureCount;

  data.updatedAt = Timestamp.now();

  return data;
}

/**
 * Get all push notifications for a club
 */
export async function getPushNotifications(clubId: string): Promise<PushNotification[]> {
  const notificationsRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
  const q = query(notificationsRef, orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(docToNotification);
}

/**
 * Get a single push notification by ID
 */
export async function getPushNotification(clubId: string, notificationId: string): Promise<PushNotification | null> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, notificationId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return docToNotification(snapshot);
}

/**
 * Create a new push notification
 */
export async function createPushNotification(
  clubId: string,
  notification: Omit<PushNotification, 'id' | 'createdAt' | 'updatedAt'>
): Promise<PushNotification> {
  const notificationsRef = collection(db, 'clubs', clubId, COLLECTION_NAME);

  const data = {
    ...notificationToDoc(notification),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(notificationsRef, data);

  return {
    ...notification,
    id: docRef.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as PushNotification;
}

/**
 * Update an existing push notification
 */
export async function updatePushNotification(
  clubId: string,
  notificationId: string,
  updates: Partial<PushNotification>
): Promise<void> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, notificationId);
  await updateDoc(docRef, notificationToDoc(updates));
}

/**
 * Delete a push notification
 */
export async function deletePushNotification(clubId: string, notificationId: string): Promise<void> {
  const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, notificationId);
  await deleteDoc(docRef);
}

/**
 * Get status display info
 */
export function getStatusInfo(status: PushNotificationStatus): { label: string; color: string; bgColor: string } {
  switch (status) {
    case 'brouillon':
      return { label: 'Brouillon', color: 'text-gray-600 dark:text-dark-text-secondary', bgColor: 'bg-gray-100 dark:bg-dark-bg-tertiary' };
    case 'planifie':
      return { label: 'Planifié', color: 'text-blue-600', bgColor: 'bg-blue-100' };
    case 'envoye':
      return { label: 'Envoyé', color: 'text-green-600', bgColor: 'bg-green-100' };
    case 'annule':
      return { label: 'Annulé', color: 'text-red-600', bgColor: 'bg-red-100' };
    default:
      return { label: status, color: 'text-gray-600 dark:text-dark-text-secondary', bgColor: 'bg-gray-100 dark:bg-dark-bg-tertiary' };
  }
}

/**
 * Get audience display info
 */
export function getAudienceInfo(audience: PushNotificationAudience): { label: string; icon: string } {
  switch (audience) {
    case 'all':
      return { label: 'Tous les utilisateurs', icon: '👥' };
    case 'admins':
      return { label: 'Administrateurs', icon: '👔' };
    case 'members':
      return { label: 'Membres uniquement', icon: '🏊' };
    case 'custom':
      return { label: 'Sélection personnalisée', icon: '🎯' };
    default:
      return { label: audience, icon: '👤' };
  }
}
