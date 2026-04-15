import { db } from '@/lib/firebase';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, Timestamp, writeBatch, query, orderBy
} from 'firebase/firestore';
import { SessionParticipant, SessionFormation, FormationGroup } from '@/types/piscine.types';

export class PiscineParticipantsService {

  // ── Collection helpers ──────────────────────────────────────────────

  private static participantsCol(clubId: string, sessionId: string) {
    return collection(db, 'clubs', clubId, 'piscine_sessions', sessionId, 'session_participants');
  }

  private static formationsCol(clubId: string, sessionId: string) {
    return collection(db, 'clubs', clubId, 'piscine_sessions', sessionId, 'session_formations');
  }

  // ── Formations: subscribe ───────────────────────────────────────────

  static subscribeToFormations(
    clubId: string, sessionId: string,
    cb: (formations: SessionFormation[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const q = query(this.formationsCol(clubId, sessionId), orderBy('order', 'asc'));
    return onSnapshot(q,
      snap => cb(snap.docs.map(d => this.docToFormation(d))),
      err => onError?.(err)
    );
  }

  // ── Formations: ensure default formations exist ─────────────────────

  static async ensureDefaultFormations(clubId: string, sessionId: string): Promise<void> {
    const levels = ['1*', '2*', '3*', '4*'];
    const stars = ['★', '★★', '★★★', '★★★★'];
    const batch = writeBatch(db);

    levels.forEach((level, i) => {
      const ref = doc(this.formationsCol(clubId, sessionId), `formation_${level.replace('*', 'star')}`);
      const defaultGroups: FormationGroup[] = [
        { id: 'group_1', label: 'GROUPE 1', monitorId: null, monitorName: null, monitorRole: null, theme: null },
        { id: 'group_2', label: 'GROUPE 2', monitorId: null, monitorName: null, monitorRole: null, theme: null },
      ];
      batch.set(ref, {
        level,
        levelLabel: `FORMATION ${stars[i]}`,
        groups: defaultGroups,
        courseMode: 'parallel',
        order: i + 1,
      }, { merge: true });
    });

    await batch.commit();
  }

  // ── Formations: update groups array ─────────────────────────────────

  static async updateFormationGroups(
    clubId: string, sessionId: string, formationId: string,
    groups: FormationGroup[]
  ): Promise<void> {
    const ref = doc(this.formationsCol(clubId, sessionId), formationId);
    await updateDoc(ref, { groups });
  }

  // ── Participants: subscribe ─────────────────────────────────────────

  static subscribeToParticipants(
    clubId: string, sessionId: string,
    cb: (participants: SessionParticipant[]) => void,
    onError?: (err: Error) => void
  ): () => void {
    const q = query(this.participantsCol(clubId, sessionId), orderBy('scannedAt', 'asc'));
    return onSnapshot(q,
      snap => cb(snap.docs.map(d => this.docToParticipant(d))),
      err => onError?.(err)
    );
  }

  // ── Participants: add (scan or manual) ──────────────────────────────

  static async addParticipant(
    clubId: string, sessionId: string,
    data: Omit<SessionParticipant, 'id' | 'scannedAt'>
  ): Promise<string> {
    const ref = await addDoc(this.participantsCol(clubId, sessionId), {
      ...data,
      formationId: data.formationId ?? null,
      groupId: data.groupId ?? null,
      scannedAt: Timestamp.now(),
    });
    return ref.id;
  }

  // ── Participants: move (drag/drop) ──────────────────────────────────
  // formationId=null + groupId=null → réserve de répartition
  // formationId=X   + groupId=null → à répartir (wachtrij van formation)
  // formationId=X   + groupId=Y   → toegewezen aan groep

  static async moveParticipant(
    clubId: string, sessionId: string, participantId: string,
    formationId: string | null, groupId: string | null
  ): Promise<void> {
    const ref = doc(this.participantsCol(clubId, sessionId), participantId);
    await updateDoc(ref, { formationId: formationId ?? null, groupId: groupId ?? null });
  }

  // ── Participants: update remarks ────────────────────────────────────

  static async updateRemarks(
    clubId: string, sessionId: string, participantId: string, remarks: string
  ): Promise<void> {
    const ref = doc(this.participantsCol(clubId, sessionId), participantId);
    await updateDoc(ref, { remarks });
  }

  // ── Participants: remove ────────────────────────────────────────────

  static async removeParticipant(
    clubId: string, sessionId: string, participantId: string
  ): Promise<void> {
    await deleteDoc(doc(this.participantsCol(clubId, sessionId), participantId));
  }

  // ── Firestore doc parsers ───────────────────────────────────────────

  private static docToFormation(d: any): SessionFormation {
    const data = d.data();
    return {
      id: d.id,
      level: data.level ?? '',
      levelLabel: data.levelLabel ?? '',
      groups: (data.groups ?? []) as FormationGroup[],
      courseMode: data.courseMode ?? 'parallel',
      order: data.order ?? 0,
    };
  }

  private static docToParticipant(d: any): SessionParticipant {
    const data = d.data();
    return {
      id: d.id,
      memberId: data.memberId ?? '',
      memberNom: data.memberNom ?? '',
      memberPrenom: data.memberPrenom ?? '',
      memberLevel: data.memberLevel ?? 'NB',
      formationId: data.formationId ?? null,
      groupId: data.groupId ?? null,
      scannedAt: data.scannedAt?.toDate?.() ?? new Date(),
      isManuallyAdded: data.isManuallyAdded ?? false,
      remarks: data.remarks ?? '',
      photoURL: data.photoURL ?? undefined,
    };
  }
}
