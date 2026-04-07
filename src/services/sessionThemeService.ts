import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp, increment, onSnapshot
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SessionTheme } from '@/types/sessionTheme.types';
import { logger } from '@/utils/logger';

/**
 * Service voor het beheren van session themes (thema-catalogus).
 * Collection: clubs/{clubId}/session_themes
 */
export class SessionThemeService {
  private static themesCollection(clubId: string) {
    return collection(db, 'clubs', clubId, 'session_themes');
  }

  // ─── Read ───────────────────────────────────────────────────────────

  static async getThemes(clubId: string): Promise<SessionTheme[]> {
    const q = query(this.themesCollection(clubId), orderBy('title'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.docToTheme(doc));
  }
  static async getThemesForNiveau(clubId: string, niveau: string): Promise<SessionTheme[]> {
    const q = query(
      this.themesCollection(clubId),
      where('targetNiveaux', 'array-contains', niveau),
      orderBy('title')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.docToTheme(doc));
  }

  static async getTheme(clubId: string, themeId: string): Promise<SessionTheme | null> {
    const ref = doc(this.themesCollection(clubId), themeId);
    const snap = await getDoc(ref);
    return snap.exists() ? this.docToTheme(snap) : null;
  }

  static subscribeToThemes(
    clubId: string,
    callback: (themes: SessionTheme[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const q = query(this.themesCollection(clubId), orderBy('title'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => this.docToTheme(doc)));
    }, (err) => {
      logger.error('[SessionThemeService] subscribeToThemes error:', err);
      if (onError) onError(err);
    });
  }
  // ─── Write ──────────────────────────────────────────────────────────

  static async createTheme(clubId: string, data: Omit<SessionTheme, 'id'>): Promise<string> {
    const docData = {
      ...data,
      timesUsed: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      documents: (data.documents || []).map(d => ({
        ...d,
        uploadedAt: d.uploadedAt instanceof Date ? Timestamp.fromDate(d.uploadedAt) : d.uploadedAt,
      })),
    };
    const ref = await addDoc(this.themesCollection(clubId), docData);
    logger.info(`[SessionThemeService] Created theme ${ref.id}`);
    return ref.id;
  }

  static async updateTheme(clubId: string, themeId: string, data: Partial<SessionTheme>): Promise<void> {
    const ref = doc(this.themesCollection(clubId), themeId);
    await updateDoc(ref, { ...data, updatedAt: Timestamp.now() });
    logger.info(`[SessionThemeService] Updated theme ${themeId}`);
  }

  static async deleteTheme(clubId: string, themeId: string): Promise<void> {
    const ref = doc(this.themesCollection(clubId), themeId);
    await deleteDoc(ref);
    logger.info(`[SessionThemeService] Deleted theme ${themeId}`);
  }
  static async incrementUsage(clubId: string, themeId: string, sessionId: string): Promise<void> {
    const ref = doc(this.themesCollection(clubId), themeId);
    await updateDoc(ref, {
      timesUsed: increment(1),
      lastUsedDate: Timestamp.now(),
      lastUsedSessionId: sessionId,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private static docToTheme(docSnap: any): SessionTheme {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      title: data.title ?? '',
      description: data.description ?? '',
      instructorNotes: data.instructorNotes,
      category: data.category ?? 'autre',
      targetNiveaux: data.targetNiveaux ?? [],
      difficulty: data.difficulty ?? 'intermediaire',
      relatedExercices: data.relatedExercices ?? [],
      documents: (data.documents ?? []).map((d: any) => ({
        ...d,
        uploadedAt: d.uploadedAt?.toDate?.() ?? new Date(),
      })),
      timesUsed: data.timesUsed ?? 0,      lastUsedDate: data.lastUsedDate?.toDate?.(),
      lastUsedSessionId: data.lastUsedSessionId,
      createdBy: data.createdBy ?? '',
      createdByName: data.createdByName ?? '',
      createdAt: data.createdAt?.toDate?.() ?? new Date(),
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    };
  }
}