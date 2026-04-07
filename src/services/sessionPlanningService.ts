import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc,
  query, where, orderBy, Timestamp, onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SessionPlanning, PlanningEntry } from '@/types/sessionPlanning.types';
import { logger } from '@/utils/logger';

/**
 * Service voor het beheren van session plannings (jaarplanning per niveau).
 * Collection: clubs/{clubId}/session_plannings
 */
export class SessionPlanningService {
  private static planningsCollection(clubId: string) {
    return collection(db, 'clubs', clubId, 'session_plannings');
  }

  // ─── Read ───────────────────────────────────────────────────────────

  static async getPlanningForNiveau(
    clubId: string,
    niveau: string,
    season: string
  ): Promise<SessionPlanning | null> {
    const q = query(
      this.planningsCollection(clubId),
      where('niveau', '==', niveau),
      where('season', '==', season)
    );
    const snapshot = await getDocs(q);    if (snapshot.empty) return null;
    return this.docToPlanning(snapshot.docs[0]);
  }

  static async getAllPlanningsForSeason(
    clubId: string,
    season: string
  ): Promise<SessionPlanning[]> {
    const q = query(
      this.planningsCollection(clubId),
      where('season', '==', season),
      orderBy('niveau')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => this.docToPlanning(d));
  }

  static subscribeToPlanningForNiveau(
    clubId: string,
    niveau: string,
    season: string,
    callback: (planning: SessionPlanning | null) => void
  ): () => void {
    const q = query(
      this.planningsCollection(clubId),
      where('niveau', '==', niveau),
      where('season', '==', season)
    );
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.empty ? null : this.docToPlanning(snapshot.docs[0]));
    });
  }
  // ─── Write ──────────────────────────────────────────────────────────

  static async savePlanning(
    clubId: string,
    planningId: string | null,
    data: Omit<SessionPlanning, 'id'>
  ): Promise<string> {
    const docData = {
      ...data,
      createdAt: data.createdAt instanceof Date
        ? Timestamp.fromDate(data.createdAt) : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (planningId) {
      const ref = doc(this.planningsCollection(clubId), planningId);
      await setDoc(ref, docData, { merge: true });
      logger.info(`[SessionPlanningService] Updated planning ${planningId}`);
      return planningId;
    } else {
      const ref = doc(this.planningsCollection(clubId));
      await setDoc(ref, docData);
      logger.info(`[SessionPlanningService] Created planning ${ref.id}`);
      return ref.id;
    }
  }

  static async deletePlanning(clubId: string, planningId: string): Promise<void> {
    const ref = doc(this.planningsCollection(clubId), planningId);
    await deleteDoc(ref);
  }
  // ─── Helpers ────────────────────────────────────────────────────────

  private static docToPlanning(docSnap: any): SessionPlanning {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      season: data.season ?? '',
      niveau: data.niveau ?? '',
      entries: (data.entries ?? []) as PlanningEntry[],
      createdBy: data.createdBy ?? '',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  }
}