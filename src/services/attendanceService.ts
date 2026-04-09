/**
 * Service for querying attendance records (check-ins).
 *
 * Two sources are merged:
 *   1. /clubs/{clubId}/attendance — event check-ins (scanner "event mode").
 *      Fields: membre_id, membre_nom, membre_prenom, operation_id, operation_titre,
 *              checked_in_at, scan_method, ...
 *   2. /clubs/{clubId}/piscine_sessions/{sid}/attendees/{aid} — pool-session check-ins
 *      (scanner "piscine mode"). Fields: memberId, memberName, scannedAt, scannedBy, isGuest.
 *      Queried via a collectionGroup('attendees') query and filtered to the current club
 *      using the document path.
 */

import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export interface AttendanceRecord {
  id: string;
  membre_id: string;
  membre_nom: string;
  membre_prenom: string;
  operation_id?: string;
  operation_titre?: string;
  /** Set when the record originates from piscine_sessions/{sid}/attendees. */
  piscine_session_id?: string;
  checked_in_at: Date;
  checked_in_by: string;
  checked_in_by_name: string;
  scan_method: string;  // 'qr' | 'barcode' | 'manual'
}

function docToAttendance(doc: any): AttendanceRecord {
  const data = doc.data();
  return {
    id: doc.id,
    membre_id: data.membre_id ?? '',
    membre_nom: data.membre_nom ?? '',
    membre_prenom: data.membre_prenom ?? '',
    operation_id: data.operation_id,
    operation_titre: data.operation_titre,
    checked_in_at: data.checked_in_at?.toDate?.() || new Date(data.checked_in_at),
    checked_in_by: data.checked_in_by ?? '',
    checked_in_by_name: data.checked_in_by_name ?? '',
    scan_method: data.scan_method ?? 'manual',
  };
}

/**
 * Convert a document from /clubs/{cid}/piscine_sessions/{sid}/attendees/{aid}
 * into an AttendanceRecord. The parent session id is extracted from the doc path.
 */
function piscineAttendeeToAttendance(doc: any): AttendanceRecord {
  const data = doc.data();
  // Path: clubs/{clubId}/piscine_sessions/{sessionId}/attendees/{attendeeId}
  const segs: string[] = doc.ref.path.split('/');
  const sessionId = segs[3] ?? '';

  const fullName: string = (data.memberName ?? '').toString().trim();
  const parts = fullName.split(/\s+/);
  const prenom = parts[0] ?? '';
  const nom = parts.slice(1).join(' ');

  const scannedAt: Date =
    data.scannedAt?.toDate?.() ||
    (data.scannedAt ? new Date(data.scannedAt) : new Date());

  return {
    id: doc.id,
    membre_id: data.memberId ?? '',
    membre_nom: nom,
    membre_prenom: prenom,
    // No operation_id — piscine scans are not linked to an "operation".
    operation_id: undefined,
    // operation_titre drives the "Piscine" vs "Événement" badge in the UI.
    operation_titre: 'Piscine',
    piscine_session_id: sessionId,
    checked_in_at: scannedAt,
    checked_in_by: data.scannedBy ?? '',
    checked_in_by_name: '',
    scan_method: 'qr',
  };
}

export const attendanceService = {
  /**
   * Get all attendance records for a specific member, merging two sources:
   *   (a) /clubs/{clubId}/attendance — event scans (membre_id == memberId)
   *   (b) /clubs/{clubId}/piscine_sessions/* /attendees — pool scans
   *       (collectionGroup query on memberId, filtered by club via path)
   *
   * Results are de-duplicated (same member + same day + same session/operation),
   * optionally filtered by `since`, and sorted by date descending.
   */
  async getAttendanceForMember(
    clubId: string,
    memberId: string,
    since?: Date
  ): Promise<AttendanceRecord[]> {
    try {
      // (a) Top-level event attendance
      const attendanceRef = collection(db, 'clubs', clubId, 'attendance');
      const eventQ = query(attendanceRef, where('membre_id', '==', memberId));

      // (b) Piscine attendees via collectionGroup — matches every
      //     piscine_sessions/{sid}/attendees doc for this member in ANY club,
      //     so we filter by clubId on the document path below.
      const attendeesGroup = collectionGroup(db, 'attendees');
      const piscineQ = query(attendeesGroup, where('memberId', '==', memberId));

      const [eventSnap, piscineSnap] = await Promise.all([
        getDocs(eventQ),
        // Piscine scans are a newer source and may fail (missing rules / index)
        // the first time this is deployed. Don't let that break the event list.
        getDocs(piscineQ).catch(err => {
          logger.warn(
            '[AttendanceService] collectionGroup(attendees) query failed — ' +
              'falling back to event attendance only. ' +
              'Check Firestore rules for /{path=**}/attendees/{id} and the ' +
              'single-field collection-group index on memberId.',
            err
          );
          return { docs: [] as any[] };
        }),
      ]);

      const eventRecords: AttendanceRecord[] = eventSnap.docs.map(docToAttendance);

      const piscineRecords: AttendanceRecord[] = piscineSnap.docs
        .filter((d: any) => {
          // Path: clubs/{clubId}/piscine_sessions/{sid}/attendees/{aid}
          const segs: string[] = d.ref.path.split('/');
          return (
            segs.length === 5 &&
            segs[0] === 'clubs' &&
            segs[1] === clubId &&
            segs[2] === 'piscine_sessions' &&
            segs[3] &&
            segs[4]
          );
        })
        .map(piscineAttendeeToAttendance);

      // Merge + dedupe on (member, day, origin). An event scan and a piscine
      // scan on the same day for the same member are distinct (different
      // `origin` keys), so both are kept.
      const all: AttendanceRecord[] = [...eventRecords, ...piscineRecords];
      const seen = new Map<string, AttendanceRecord>();
      for (const r of all) {
        const day = r.checked_in_at.toISOString().split('T')[0];
        const origin = r.operation_id ?? r.piscine_session_id ?? r.id;
        const key = `${r.membre_id}:${day}:${origin}`;
        if (!seen.has(key)) seen.set(key, r);
      }
      let records = Array.from(seen.values());

      // Filter by date if needed
      if (since) {
        records = records.filter(r => r.checked_in_at >= since);
      }

      // Sort by date descending (most recent first)
      records.sort((a, b) => b.checked_in_at.getTime() - a.checked_in_at.getTime());

      return records;
    } catch (error) {
      logger.error('[AttendanceService] Error fetching attendance for member:', error);
      return [];
    }
  },
};
