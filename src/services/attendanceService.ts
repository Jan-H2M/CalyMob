/**
 * Service for querying attendance records (check-ins)
 * Collection: /clubs/{clubId}/attendance
 *
 * Attendance is recorded by CalyMob when members check in at events
 * or pool sessions (QR, barcode, or manual).
 */

import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';

export interface AttendanceRecord {
  id: string;
  membre_id: string;
  membre_nom: string;
  membre_prenom: string;
  operation_id?: string;
  operation_titre?: string;
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

export const attendanceService = {
  /**
   * Get all attendance records for a specific member.
   * Optionally filter by a start date (e.g. season start).
   * Results sorted by date descending (most recent first).
   */
  async getAttendanceForMember(
    clubId: string,
    memberId: string,
    since?: Date
  ): Promise<AttendanceRecord[]> {
    try {
      const attendanceRef = collection(db, 'clubs', clubId, 'attendance');

      // Query by membre_id; sort client-side to avoid composite index requirements
      const q = query(attendanceRef, where('membre_id', '==', memberId));
      const snapshot = await getDocs(q);

      let records = snapshot.docs.map(docToAttendance);

      // Filter by date if needed
      if (since) {
        records = records.filter(r => r.checked_in_at >= since);
      }

      // Sort by date descending
      records.sort((a, b) => b.checked_in_at.getTime() - a.checked_in_at.getTime());

      return records;
    } catch (error) {
      logger.error('[AttendanceService] Error fetching attendance for member:', error);
      return [];
    }
  },
};
