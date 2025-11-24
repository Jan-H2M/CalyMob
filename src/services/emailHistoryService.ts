/**
 * Email History Service
 * Handles fetching email history from Firestore
 */

import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { EmailHistoryEntry } from '@/types/emailHistory';

/**
 * Get email history for a club
 * @param clubId - Club ID
 * @param limitCount - Maximum number of emails to retrieve (default: 100)
 * @returns Array of email history entries
 */
export async function getEmailHistory(
  clubId: string,
  limitCount: number = 100
): Promise<EmailHistoryEntry[]> {
  try {
    const emailHistoryRef = collection(db, 'clubs', clubId, 'email_history');
    const q = query(emailHistoryRef, orderBy('createdAt', 'desc'), limit(limitCount));

    const snapshot = await getDocs(q);
    const emails: EmailHistoryEntry[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      emails.push({
        id: doc.id,
        ...data,
        // Convert Firestore Timestamps to Date objects
        createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : data.createdAt,
        sentAt: data.sentAt instanceof Timestamp ? data.sentAt.toDate() : data.sentAt,
      } as EmailHistoryEntry);
    });

    return emails;
  } catch (error) {
    console.error('Error fetching email history:', error);
    throw error;
  }
}
