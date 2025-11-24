/**
 * Dive Location Service
 * CRUD operations for dive locations in Firestore
 */

import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DiveLocation } from '@/types/tariff.types';

export class DiveLocationService {
  /**
   * Get all locations for a club
   */
  static async getAllLocations(clubId: string): Promise<DiveLocation[]> {
    const locationsRef = collection(db, `clubs/${clubId}/dive_locations`);
    const q = query(locationsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate() || new Date(),
      updated_at: doc.data().updated_at?.toDate() || new Date()
    })) as DiveLocation[];
  }

  /**
   * Get single location by ID
   */
  static async getLocationById(clubId: string, locationId: string): Promise<DiveLocation | null> {
    const docRef = doc(db, `clubs/${clubId}/dive_locations/${locationId}`);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;

    return {
      id: docSnap.id,
      ...docSnap.data(),
      created_at: docSnap.data().created_at?.toDate() || new Date(),
      updated_at: docSnap.data().updated_at?.toDate() || new Date()
    } as DiveLocation;
  }

  /**
   * Create new location
   */
  static async createLocation(
    clubId: string,
    userId: string,
    data: Omit<DiveLocation, 'id' | 'created_at' | 'updated_at' | 'created_by'>
  ): Promise<string> {
    const locationsRef = collection(db, `clubs/${clubId}/dive_locations`);

    const docRef = await addDoc(locationsRef, {
      ...data,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
      created_by: userId
    });

    return docRef.id;
  }

  /**
   * Update existing location
   */
  static async updateLocation(
    clubId: string,
    locationId: string,
    updates: Partial<Omit<DiveLocation, 'id' | 'created_at' | 'updated_at' | 'created_by'>>
  ): Promise<void> {
    const docRef = doc(db, `clubs/${clubId}/dive_locations/${locationId}`);

    await updateDoc(docRef, {
      ...updates,
      updated_at: Timestamp.now()
    });
  }

  /**
   * Delete location
   */
  static async deleteLocation(clubId: string, locationId: string): Promise<void> {
    const docRef = doc(db, `clubs/${clubId}/dive_locations/${locationId}`);
    await deleteDoc(docRef);
  }
}
