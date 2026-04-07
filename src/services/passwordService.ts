import { auth } from '@/lib/firebase';
import { updatePassword } from 'firebase/auth';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { generateDefaultPassword } from '@/utils/passwordGenerator';

/**
 * Service for password management operations
 */
export class PasswordService {
  /**
   * Reset a user's password (admin only)
   * Calls the Vercel API endpoint
   *
   * @param userId - The user ID to reset
   * @param clubId - The club ID
   * @param newPassword - Optional custom password (defaults to CalyCompta{year}-{month}-{unique})
   * @param requirePasswordChange - Whether user must change password on next login
   */
  static async resetUserPassword(
    userId: string,
    clubId: string,
    newPassword?: string,
    requirePasswordChange: boolean = true
  ): Promise<void> {
    // Use secure generated password if none provided
    const passwordToSet = newPassword || generateDefaultPassword();

    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Vous devez être authentifié");
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch(`/api/reset-password?t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify({
        userId,
        clubId,
        newPassword: passwordToSet,
        requirePasswordChange,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || `Erreur ${response.status}`);
    }

    return result;
  }

  /**
   * Change current user's password
   * Also updates requirePasswordChange flag in Firestore
   */
  static async changeMyPassword(
    newPassword: string,
    clubId: string
  ): Promise<void> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Vous devez être authentifié");
    }

    // Update password in Firebase Auth
    await updatePassword(currentUser, newPassword);

    // Update requirePasswordChange flag in Firestore
    const userDocRef = doc(db, 'clubs', clubId, 'members', currentUser.uid);
    await updateDoc(userDocRef, {
      requirePasswordChange: false,
      updatedAt: Timestamp.now(),
    });
  }

  /**
   * Check if user needs to change password
   */
  static async checkRequirePasswordChange(
    userId: string,
    clubId: string
  ): Promise<boolean> {
    const { doc: firestoreDoc, getDoc } = await import('firebase/firestore');
    const userDocRef = firestoreDoc(db, 'clubs', clubId, 'members', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      return false;
    }

    const userData = userDoc.data();
    return userData?.requirePasswordChange === true;
  }
}
