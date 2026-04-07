/**
 * Noda Payment Service
 * Handles persistence of Noda payments in Firestore
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Remove undefined values from an object (Firestore doesn't accept undefined)
 */
function removeUndefined<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

export interface NodaPayment {
  id: string;
  nodaPaymentId?: string;

  // Payment details
  amount: number;
  currency: string;
  description: string;

  // Direction
  direction: 'incoming' | 'outgoing';

  // Customer info
  customerEmail?: string;
  customerIban?: string;

  // IBANs
  sourceIban?: string;
  destinationIban?: string;

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paymentUrl?: string;

  // Environment
  environment: 'sandbox' | 'production';

  // Timestamps
  createdAt: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  completedAt?: Date | Timestamp;

  // Webhook data
  webhookData?: any;
}

export class NodaPaymentService {
  /**
   * Save a new payment to Firestore
   */
  static async createPayment(
    clubId: string,
    payment: Omit<NodaPayment, 'createdAt' | 'updatedAt'>
  ): Promise<NodaPayment> {
    const paymentsRef = collection(db, `clubs/${clubId}/noda_payments`);
    const paymentDoc = doc(paymentsRef, payment.id);

    const paymentData = removeUndefined({
      ...payment,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await setDoc(paymentDoc, paymentData);

    return {
      ...payment,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Update payment status
   */
  static async updatePaymentStatus(
    clubId: string,
    paymentId: string,
    status: NodaPayment['status'],
    additionalData?: Partial<NodaPayment>
  ): Promise<void> {
    const paymentRef = doc(db, `clubs/${clubId}/noda_payments/${paymentId}`);

    const updateData: any = {
      status,
      updatedAt: serverTimestamp(),
      ...additionalData
    };

    if (status === 'completed') {
      updateData.completedAt = serverTimestamp();
    }

    await updateDoc(paymentRef, updateData);
  }

  /**
   * Get a single payment
   */
  static async getPayment(clubId: string, paymentId: string): Promise<NodaPayment | null> {
    const paymentRef = doc(db, `clubs/${clubId}/noda_payments/${paymentId}`);
    const paymentDoc = await getDoc(paymentRef);

    if (!paymentDoc.exists()) {
      return null;
    }

    const data = paymentDoc.data();
    return {
      ...data,
      id: paymentDoc.id,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate(),
      completedAt: data.completedAt?.toDate()
    } as NodaPayment;
  }

  /**
   * Get recent payments
   */
  static async getRecentPayments(
    clubId: string,
    limitCount: number = 50
  ): Promise<NodaPayment[]> {
    const paymentsRef = collection(db, `clubs/${clubId}/noda_payments`);
    const q = query(paymentsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);

    const payments: NodaPayment[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      payments.push({
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
        completedAt: data.completedAt?.toDate()
      } as NodaPayment);
    });

    return payments;
  }

  /**
   * Update payment from webhook data
   */
  static async updateFromWebhook(
    clubId: string,
    paymentId: string,
    webhookData: any
  ): Promise<void> {
    const paymentRef = doc(db, `clubs/${clubId}/noda_payments/${paymentId}`);

    // Map Noda status to our status
    let status: NodaPayment['status'] = 'pending';
    const nodaStatus = (webhookData.status || '').toLowerCase();

    if (nodaStatus === 'done' || nodaStatus === 'completed' || nodaStatus === 'success') {
      status = 'completed';
    } else if (nodaStatus === 'failed' || nodaStatus === 'error') {
      status = 'failed';
    } else if (nodaStatus === 'cancelled' || nodaStatus === 'canceled') {
      status = 'cancelled';
    } else if (nodaStatus === 'processing' || nodaStatus === 'pending') {
      status = 'processing';
    }

    const updateData: any = {
      status,
      webhookData,
      updatedAt: serverTimestamp()
    };

    if (status === 'completed') {
      updateData.completedAt = serverTimestamp();
    }

    if (webhookData.id || webhookData.paymentId) {
      updateData.nodaPaymentId = webhookData.id || webhookData.paymentId;
    }

    await updateDoc(paymentRef, updateData);
  }
}
