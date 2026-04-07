/**
 * Membership Season Service
 * CRUD operations for membership seasons (cotisations) in Firestore
 * 
 * Firestore path: clubs/{clubId}/membership_seasons/{seasonId}
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  query,
  orderBy,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MembershipSeason } from '@/types/cotisations.types';
import { logger } from '@/utils/logger';

export class MembershipSeasonService {
  /**
   * Get all seasons for a club, sorted by start_year descending (newest first)
   */
  static async getAllSeasons(clubId: string): Promise<MembershipSeason[]> {
    try {
      const seasonsRef = collection(db, `clubs/${clubId}/membership_seasons`);
      const q = query(seasonsRef, orderBy('start_year', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate() || new Date(),
        updated_at: doc.data().updated_at?.toDate() || new Date(),
      })) as MembershipSeason[];
    } catch (error) {
      logger.error('Error loading membership seasons:', error);
      throw error;
    }
  }

  /**
   * Get the currently active season
   */
  static async getActiveSeason(clubId: string): Promise<MembershipSeason | null> {
    try {
      const seasonsRef = collection(db, `clubs/${clubId}/membership_seasons`);
      const q = query(seasonsRef, where('is_active', '==', true));
      const snapshot = await getDocs(q);

      if (snapshot.empty) return null;

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate() || new Date(),
        updated_at: doc.data().updated_at?.toDate() || new Date(),
      } as MembershipSeason;
    } catch (error) {
      logger.error('Error loading active membership season:', error);
      throw error;
    }
  }

  /**
   * Get a single season by ID
   */
  static async getSeasonById(clubId: string, seasonId: string): Promise<MembershipSeason | null> {
    try {
      const docRef = doc(db, `clubs/${clubId}/membership_seasons/${seasonId}`);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) return null;

      return {
        id: docSnap.id,
        ...docSnap.data(),
        created_at: docSnap.data().created_at?.toDate() || new Date(),
        updated_at: docSnap.data().updated_at?.toDate() || new Date(),
      } as MembershipSeason;
    } catch (error) {
      logger.error('Error loading membership season:', error);
      throw error;
    }
  }

  /**
   * Create a new season
   */
  static async createSeason(
    clubId: string,
    userId: string,
    data: Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'>
  ): Promise<string> {
    try {
      const seasonsRef = collection(db, `clubs/${clubId}/membership_seasons`);

      const docRef = await addDoc(seasonsRef, {
        ...data,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        created_by: userId,
      });

      return docRef.id;
    } catch (error) {
      logger.error('Error creating membership season:', error);
      throw error;
    }
  }

  /**
   * Update an existing season
   */
  static async updateSeason(
    clubId: string,
    seasonId: string,
    updates: Partial<Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'>>
  ): Promise<void> {
    try {
      const docRef = doc(db, `clubs/${clubId}/membership_seasons/${seasonId}`);

      await updateDoc(docRef, {
        ...updates,
        updated_at: Timestamp.now(),
      });
    } catch (error) {
      logger.error('Error updating membership season:', error);
      throw error;
    }
  }

  /**
   * Delete a season (only if not active)
   */
  static async deleteSeason(clubId: string, seasonId: string): Promise<void> {
    try {
      // First check if the season is active
      const season = await this.getSeasonById(clubId, seasonId);
      if (season?.is_active) {
        throw new Error('Impossible de supprimer un tarif actif. Désactivez-le d\'abord.');
      }

      const docRef = doc(db, `clubs/${clubId}/membership_seasons/${seasonId}`);
      await deleteDoc(docRef);
    } catch (error) {
      logger.error('Error deleting membership season:', error);
      throw error;
    }
  }

  /**
   * Set a season as the active one (deactivates all others)
   * Uses a batch write to ensure atomicity
   */
  static async setActiveSeason(clubId: string, seasonId: string): Promise<void> {
    try {
      const batch = writeBatch(db);

      // First, deactivate all seasons
      const allSeasons = await this.getAllSeasons(clubId);
      for (const season of allSeasons) {
        if (season.is_active) {
          const ref = doc(db, `clubs/${clubId}/membership_seasons/${season.id}`);
          batch.update(ref, { is_active: false, updated_at: Timestamp.now() });
        }
      }

      // Then activate the target season
      const targetRef = doc(db, `clubs/${clubId}/membership_seasons/${seasonId}`);
      batch.update(targetRef, { is_active: true, updated_at: Timestamp.now() });

      await batch.commit();
    } catch (error) {
      logger.error('Error setting active membership season:', error);
      throw error;
    }
  }
}
