import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { MemberObservation } from '@/types/memberObservation.types';
import { logger } from '@/utils/logger';

/**
 * Service voor het beheren van member observations.
 * Collection: clubs/{clubId}/member_observations
 */
export class MemberObservationService {
  private static observationsCollection(clubId: string) {
    return collection(db, 'clubs', clubId, 'member_observations');
  }

  // ─── Read ───────────────────────────────────────────────────────────

  static async getObservationsForMember(
    clubId: string,
    memberId: string
  ): Promise<MemberObservation[]> {
    const q = query(
      this.observationsCollection(clubId),
      where('memberId', '==', memberId),
      orderBy('contextDate', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => this.docToObservation(d));
  }
  static async getObservationsForSession(
    clubId: string,
    sessionId: string
  ): Promise<MemberObservation[]> {
    const q = query(
      this.observationsCollection(clubId),
      where('contextId', '==', sessionId),
      orderBy('memberName')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => this.docToObservation(d));
  }

  static async getObservationsForNiveau(
    clubId: string,
    niveau: string,
    seasonStart: Date,
    seasonEnd: Date
  ): Promise<MemberObservation[]> {
    const q = query(
      this.observationsCollection(clubId),
      where('memberNiveau', '==', niveau),
      where('contextDate', '>=', Timestamp.fromDate(seasonStart)),
      where('contextDate', '<=', Timestamp.fromDate(seasonEnd)),
      orderBy('contextDate', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => this.docToObservation(d));
  }
  static subscribeToObservationsForSession(
    clubId: string,
    sessionId: string,
    callback: (observations: MemberObservation[]) => void
  ): () => void {
    const q = query(
      this.observationsCollection(clubId),
      where('contextId', '==', sessionId),
      orderBy('memberName')
    );
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(d => this.docToObservation(d)));
    });
  }

  // ─── Write ──────────────────────────────────────────────────────────

  static async createObservation(
    clubId: string,
    data: Omit<MemberObservation, 'id'>
  ): Promise<string> {
    const docData = {
      ...data,
      contextDate: data.contextDate instanceof Date
        ? Timestamp.fromDate(data.contextDate) : data.contextDate,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const ref = await addDoc(this.observationsCollection(clubId), docData);
    logger.info(`[MemberObservationService] Created observation ${ref.id}`);
    return ref.id;
  }
  static async updateObservation(
    clubId: string,
    observationId: string,
    data: Partial<MemberObservation>
  ): Promise<void> {
    const ref = doc(this.observationsCollection(clubId), observationId);
    await updateDoc(ref, { ...data, updatedAt: Timestamp.now() });
  }

  static async deleteObservation(clubId: string, observationId: string): Promise<void> {
    const ref = doc(this.observationsCollection(clubId), observationId);
    await deleteDoc(ref);
    logger.info(`[MemberObservationService] Deleted observation ${observationId}`);
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private static docToObservation(docSnap: any): MemberObservation {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      memberId: data.memberId ?? '',
      memberName: data.memberName ?? '',
      memberNiveau: data.memberNiveau ?? '',
      contextType: data.contextType ?? 'piscine',
      contextId: data.contextId ?? '',
      contextDate: data.contextDate?.toDate?.() ?? new Date(),
      contextTitle: data.contextTitle ?? '',      category: data.category ?? 'general',
      exerciceCode: data.exerciceCode,
      exerciceDescription: data.exerciceDescription,
      themeId: data.themeId,
      themeTitle: data.themeTitle,
      result: data.result ?? null,
      note: data.note ?? '',
      observerId: data.observerId ?? '',
      observerName: data.observerName ?? '',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  }
}