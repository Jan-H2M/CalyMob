/**
 * Event Message Service
 * Handles CRUD operations for messages within events
 */

import { db, storage } from '@/lib/firebase';
import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  collectionGroup,
  limit,
  getDoc,
  updateDoc,
  arrayUnion
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { EventMessage, EventMessageWithContext, MessageAttachment, ReplyPreview } from '@/types/communication';

/**
 * Get all messages for a specific event
 */
export async function getEventMessages(
  clubId: string,
  operationId: string
): Promise<EventMessage[]> {
  const messagesRef = collection(db, 'clubs', clubId, 'operations', operationId, 'messages');
  const q = query(messagesRef, orderBy('created_at', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    created_at: (doc.data().created_at as Timestamp)?.toDate() || new Date()
  })) as EventMessage[];
}

/**
 * Subscribe to real-time updates for event messages
 */
export function subscribeToEventMessages(
  clubId: string,
  operationId: string,
  callback: (messages: EventMessage[]) => void
): () => void {
  const messagesRef = collection(db, 'clubs', clubId, 'operations', operationId, 'messages');
  const q = query(messagesRef, orderBy('created_at', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: (doc.data().created_at as Timestamp)?.toDate() || new Date()
    })) as EventMessage[];
    callback(messages);
  });
}

/**
 * Send a new message to an event
 */
export async function sendEventMessage(
  clubId: string,
  operationId: string,
  senderId: string,
  senderName: string,
  message: string,
  options?: {
    replyToId?: string;
    replyToPreview?: ReplyPreview;
    attachments?: MessageAttachment[];
  }
): Promise<string> {
  const messagesRef = collection(db, 'clubs', clubId, 'operations', operationId, 'messages');

  const messageData: Record<string, unknown> = {
    sender_id: senderId,
    sender_name: senderName,
    message: message.trim(),
    created_at: serverTimestamp(),
    read_by: [senderId], // Sender has read their own message
  };

  if (options?.replyToId) {
    messageData.reply_to_id = options.replyToId;
  }
  if (options?.replyToPreview) {
    messageData.reply_to_preview = options.replyToPreview;
  }
  if (options?.attachments && options.attachments.length > 0) {
    messageData.attachments = options.attachments;
  }

  const docRef = await addDoc(messagesRef, messageData);
  return docRef.id;
}

/**
 * Mark a message as read by a user
 */
export async function markMessageAsRead(
  clubId: string,
  operationId: string,
  messageId: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'operations', operationId, 'messages', messageId);
  await updateDoc(messageRef, {
    read_by: arrayUnion(userId)
  });
}

/**
 * Mark all messages in an event as read by a user
 */
export async function markAllMessagesAsRead(
  clubId: string,
  operationId: string,
  userId: string
): Promise<void> {
  const messages = await getEventMessages(clubId, operationId);

  const promises = messages
    .filter(msg => !msg.read_by?.includes(userId))
    .map(msg => markMessageAsRead(clubId, operationId, msg.id, userId));

  await Promise.all(promises);
}

/**
 * Upload an attachment for a message
 */
export async function uploadMessageAttachment(
  clubId: string,
  operationId: string,
  file: File,
  type: 'image' | 'pdf'
): Promise<MessageAttachment> {
  const timestamp = Date.now();
  const filename = file.name;
  const storagePath = `clubs/${clubId}/operations/${operationId}/attachments/${timestamp}_${filename}`;

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
 * Create a reply preview from an existing message
 */
export function createReplyPreview(message: EventMessage): ReplyPreview {
  const preview = message.message.length > 50
    ? `${message.message.substring(0, 50)}...`
    : message.message;

  return {
    sender_name: message.sender_name,
    message_preview: preview
  };
}

/**
 * Delete a message from an event
 */
export async function deleteEventMessage(
  clubId: string,
  operationId: string,
  messageId: string
): Promise<void> {
  const messageRef = doc(db, 'clubs', clubId, 'operations', operationId, 'messages', messageId);
  await deleteDoc(messageRef);
}

/**
 * Get all event messages across all events (for overview page)
 * Returns messages with their event context
 */
export async function getAllEventMessages(
  clubId: string,
  limitCount: number = 100
): Promise<EventMessageWithContext[]> {
  // Get all operations first
  const operationsRef = collection(db, 'clubs', clubId, 'operations');
  const operationsSnapshot = await getDocs(operationsRef);

  const allMessages: EventMessageWithContext[] = [];

  // For each operation, get its messages
  for (const opDoc of operationsSnapshot.docs) {
    const opData = opDoc.data();
    const messagesRef = collection(db, 'clubs', clubId, 'operations', opDoc.id, 'messages');
    const messagesSnapshot = await getDocs(messagesRef);

    messagesSnapshot.docs.forEach(msgDoc => {
      const msgData = msgDoc.data();
      allMessages.push({
        id: msgDoc.id,
        sender_id: msgData.sender_id,
        sender_name: msgData.sender_name,
        message: msgData.message,
        created_at: (msgData.created_at as Timestamp)?.toDate() || new Date(),
        operation_id: opDoc.id,
        operation_titre: opData.titre || opData.description || 'Événement sans titre',
        club_id: clubId
      });
    });
  }

  // Sort by date descending (most recent first) and limit
  allMessages.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  return allMessages.slice(0, limitCount);
}

/**
 * Get recent event messages (last 24 hours) for dashboard
 */
export async function getRecentEventMessages(
  clubId: string,
  hoursBack: number = 24
): Promise<EventMessageWithContext[]> {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

  const allMessages = await getAllEventMessages(clubId, 500);

  return allMessages.filter(msg => msg.created_at >= cutoffDate);
}
