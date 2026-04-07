import {
  collection,
  doc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { logger } from '@/utils/logger';
import { db, storage } from '@/lib/firebase';
import { MobileMedicalCertificate, CertificateStatus } from '@/types/user.types';

/**
 * Service for managing medical certificates uploaded via the mobile app (CalyMob).
 * These certificates are stored in a subcollection under each member document.
 *
 * Firestore path: clubs/{clubId}/members/{memberId}/medical_certificates
 */
export class MedicalCertificationService {
  /**
   * Get all medical certificates for a member
   */
  static async getMemberCertifications(
    clubId: string,
    memberId: string
  ): Promise<MobileMedicalCertificate[]> {
    const certsRef = collection(db, `clubs/${clubId}/members/${memberId}/medical_certificates`);
    const q = query(certsRef, orderBy('uploaded_at', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as MobileMedicalCertificate[];
  }

  /**
   * Watch medical certificates for a member (real-time updates)
   */
  static watchMemberCertifications(
    clubId: string,
    memberId: string,
    callback: (certs: MobileMedicalCertificate[]) => void
  ): Unsubscribe {
    const certsRef = collection(db, `clubs/${clubId}/members/${memberId}/medical_certificates`);
    const q = query(certsRef, orderBy('uploaded_at', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const certs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MobileMedicalCertificate[];
      callback(certs);
    });
  }

  /**
   * Approve a medical certificate
   * Sets the status to 'approved', valid_until date, and reviewer info
   */
  static async approveCertification(
    clubId: string,
    memberId: string,
    certId: string,
    validUntil: Date,
    reviewerId: string,
    reviewerName: string
  ): Promise<void> {
    const certRef = doc(db, `clubs/${clubId}/members/${memberId}/medical_certificates/${certId}`);

    await updateDoc(certRef, {
      status: 'approved' as CertificateStatus,
      valid_until: Timestamp.fromDate(validUntil),
      reviewed_by: reviewerId,
      reviewed_by_nom: reviewerName,
      reviewed_at: Timestamp.fromDate(new Date())
    });

    // Also update the member's main validity date if this is newer
    const memberRef = doc(db, `clubs/${clubId}/members/${memberId}`);
    await updateDoc(memberRef, {
      certificat_medical_validite: Timestamp.fromDate(validUntil),
      has_pending_medical: false // Clear the pending flag
    });
  }

  /**
   * Reject a medical certificate
   * Sets the status to 'rejected' with a reason
   */
  static async rejectCertification(
    clubId: string,
    memberId: string,
    certId: string,
    reason: string,
    reviewerId: string,
    reviewerName: string
  ): Promise<void> {
    const certRef = doc(db, `clubs/${clubId}/members/${memberId}/medical_certificates/${certId}`);

    await updateDoc(certRef, {
      status: 'rejected' as CertificateStatus,
      rejection_reason: reason,
      reviewed_by: reviewerId,
      reviewed_by_nom: reviewerName,
      reviewed_at: Timestamp.fromDate(new Date())
    });

    // Check if there are any remaining pending certificates
    const certs = await this.getMemberCertifications(clubId, memberId);
    const hasPending = certs.some(c => c.status === 'pending');

    // Update the member's pending flag
    const memberRef = doc(db, `clubs/${clubId}/members/${memberId}`);
    await updateDoc(memberRef, {
      has_pending_medical: hasPending
    });
  }

  /**
   * Delete a medical certificate (and its file from storage)
   */
  static async deleteCertification(
    clubId: string,
    memberId: string,
    certId: string,
    documentUrl: string
  ): Promise<void> {
    // Delete from Storage first
    try {
      const storageRef = ref(storage, documentUrl);
      await deleteObject(storageRef);
    } catch (e) {
      // File may not exist, continue with Firestore cleanup
      logger.warn('File not found in storage:', e);
    }

    // Delete from Firestore
    const certRef = doc(db, `clubs/${clubId}/members/${memberId}/medical_certificates/${certId}`);
    await deleteDoc(certRef);

    // Check if there are any remaining pending certificates
    const certs = await this.getMemberCertifications(clubId, memberId);
    const hasPending = certs.some(c => c.status === 'pending');

    // Update the member's pending flag
    const memberRef = doc(db, `clubs/${clubId}/members/${memberId}`);
    await updateDoc(memberRef, {
      has_pending_medical: hasPending
    });
  }

  /**
   * Get the current (most relevant) certificate for a member
   * Priority: approved (by valid_until) > pending (by uploaded_at) > rejected
   */
  static getCurrentCertificate(
    certs: MobileMedicalCertificate[]
  ): MobileMedicalCertificate | null {
    if (certs.length === 0) return null;

    // Priority 1: Approved certificates (most recent by valid_until)
    const approved = certs
      .filter(c => c.status === 'approved')
      .sort((a, b) => {
        const aDate = a.valid_until?.toDate?.() || new Date(0);
        const bDate = b.valid_until?.toDate?.() || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    if (approved.length > 0) return approved[0];

    // Priority 2: Pending certificates (most recent by uploaded_at)
    const pending = certs
      .filter(c => c.status === 'pending')
      .sort((a, b) => {
        const aDate = a.uploaded_at?.toDate?.() || new Date(0);
        const bDate = b.uploaded_at?.toDate?.() || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    if (pending.length > 0) return pending[0];

    // Priority 3: Rejected (most recent)
    return certs[0]; // Already sorted by uploaded_at desc
  }

  /**
   * Check if a certificate is valid (approved and not expired)
   */
  static isValid(cert: MobileMedicalCertificate): boolean {
    if (cert.status !== 'approved' || !cert.valid_until) return false;
    const validUntil = cert.valid_until.toDate?.() || new Date(cert.valid_until as any);
    return validUntil > new Date();
  }

  /**
   * Check if a certificate is expiring soon (within 30 days)
   */
  static isExpiringSoon(cert: MobileMedicalCertificate): boolean {
    if (cert.status !== 'approved' || !cert.valid_until) return false;
    const validUntil = cert.valid_until.toDate?.() || new Date(cert.valid_until as any);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return validUntil > new Date() && validUntil <= thirtyDaysFromNow;
  }

  /**
   * Get the default validity date (31 January of next year)
   */
  static getDefaultValidityDate(): Date {
    const now = new Date();
    const nextYear = now.getFullYear() + 1;
    return new Date(nextYear, 0, 31); // January 31 of next year
  }

  /**
   * Sync the has_pending_medical flag on the member document
   * This fixes the flag for certificates uploaded before the mobile app was updated
   */
  static async syncPendingFlag(
    clubId: string,
    memberId: string,
    certs: MobileMedicalCertificate[]
  ): Promise<void> {
    const hasPending = certs.some(c => c.status === 'pending');
    const memberRef = doc(db, `clubs/${clubId}/members/${memberId}`);
    await updateDoc(memberRef, { has_pending_medical: hasPending });
  }

  /**
   * Update the display name of a mobile certificate
   */
  static async updateCertificateName(
    clubId: string,
    memberId: string,
    certId: string,
    newName: string
  ): Promise<void> {
    const certRef = doc(db, `clubs/${clubId}/members/${memberId}/medical_certificates/${certId}`);
    await updateDoc(certRef, { file_name: newName });
  }

  /**
   * Update the validity date of a mobile certificate
   * Also updates the member's main validity date if this is the most recent
   */
  static async updateCertificateValidityDate(
    clubId: string,
    memberId: string,
    certId: string,
    newValidUntil: Date
  ): Promise<void> {
    const certRef = doc(db, `clubs/${clubId}/members/${memberId}/medical_certificates/${certId}`);
    await updateDoc(certRef, { valid_until: Timestamp.fromDate(newValidUntil) });

    // Check if we need to update the member's main validity date
    const certs = await this.getMemberCertifications(clubId, memberId);
    const approvedCerts = certs
      .filter(c => c.status === 'approved' && c.valid_until)
      .sort((a, b) => {
        const aDate = a.valid_until?.toDate?.() || new Date(0);
        const bDate = b.valid_until?.toDate?.() || new Date(0);
        return bDate.getTime() - aDate.getTime();
      });

    if (approvedCerts.length > 0) {
      const latestDate = approvedCerts[0].valid_until?.toDate?.() || new Date(approvedCerts[0].valid_until as any);
      const memberRef = doc(db, `clubs/${clubId}/members/${memberId}`);
      await updateDoc(memberRef, { certificat_medical_validite: Timestamp.fromDate(latestDate) });
    }
  }
}
