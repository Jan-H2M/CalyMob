/**
 * Mollie Payment Service
 * Handles persistence of Mollie payments in Firestore
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
  Timestamp,
  addDoc
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

/**
 * Mollie Payment Status
 * See: https://docs.mollie.com/payments/status-changes
 */
export type MolliePaymentStatus =
  | 'open'      // Payment has been created, waiting for customer
  | 'pending'   // Customer is completing the payment (e.g., bank transfer)
  | 'paid'      // Payment was successful
  | 'failed'    // Payment failed
  | 'canceled'  // Payment was canceled by customer
  | 'expired';  // Payment expired (customer didn't complete in time)

/**
 * Mollie Payment Method
 * Only methods activated for Calypso Diving Club
 */
export type MolliePaymentMethod =
  | 'bancontact'    // Bancontact - Belgium
  | 'kbc'           // KBC/CBC Payment Button - Belgium
  | 'belfius'       // Belfius Direct Net - Belgium
  | 'creditcard'    // Credit/debit cards
  | 'applepay'      // Apple Pay
  | null;           // Customer choice

export interface MolliePayment {
  id: string;                              // Internal payment ID (mol_xxx)
  molliePaymentId?: string;                // Mollie's tr_xxx ID

  // Payment details
  amount: number;
  currency: string;
  description: string;
  method: MolliePaymentMethod;

  // Customer info
  customerEmail?: string;
  customerName?: string;

  // Status
  status: MolliePaymentStatus;
  paymentUrl?: string;

  // Environment
  environment: 'sandbox' | 'production';

  // Timestamps
  createdAt: Date | Timestamp;
  updatedAt?: Date | Timestamp;
  paidAt?: Date | Timestamp;
  canceledAt?: Date | Timestamp;
  expiredAt?: Date | Timestamp;
  failedAt?: Date | Timestamp;

  // Metadata
  metadata?: Record<string, any>;

  // Webhook data (last received)
  webhookData?: any;
}

export interface MollieLogEntry {
  id?: string;
  type: 'api_call' | 'webhook' | 'error' | 'info';
  endpoint?: string;
  method?: string;
  request?: any;
  response?: any;
  error?: any;
  duration?: number;
  timestamp: Date | Timestamp;
}

export class MolliePaymentService {
  /**
   * Save a new payment to Firestore
   */
  static async createPayment(
    clubId: string,
    payment: Omit<MolliePayment, 'createdAt' | 'updatedAt'>
  ): Promise<MolliePayment> {
    const paymentsRef = collection(db, `clubs/${clubId}/mollie_payments`);
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
    status: MolliePaymentStatus,
    additionalData?: Partial<MolliePayment>
  ): Promise<void> {
    const paymentRef = doc(db, `clubs/${clubId}/mollie_payments/${paymentId}`);

    const updateData: Record<string, any> = {
      status,
      updatedAt: serverTimestamp(),
      ...additionalData
    };

    // Set timestamp based on status
    switch (status) {
      case 'paid':
        updateData.paidAt = serverTimestamp();
        break;
      case 'canceled':
        updateData.canceledAt = serverTimestamp();
        break;
      case 'expired':
        updateData.expiredAt = serverTimestamp();
        break;
      case 'failed':
        updateData.failedAt = serverTimestamp();
        break;
    }

    await updateDoc(paymentRef, updateData);
  }

  /**
   * Get a single payment
   */
  static async getPayment(clubId: string, paymentId: string): Promise<MolliePayment | null> {
    const paymentRef = doc(db, `clubs/${clubId}/mollie_payments/${paymentId}`);
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
      paidAt: data.paidAt?.toDate(),
      canceledAt: data.canceledAt?.toDate(),
      expiredAt: data.expiredAt?.toDate(),
      failedAt: data.failedAt?.toDate()
    } as MolliePayment;
  }

  /**
   * Get recent payments
   */
  static async getRecentPayments(
    clubId: string,
    limitCount: number = 50
  ): Promise<MolliePayment[]> {
    const paymentsRef = collection(db, `clubs/${clubId}/mollie_payments`);
    const q = query(paymentsRef, orderBy('createdAt', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);

    const payments: MolliePayment[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      payments.push({
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
        paidAt: data.paidAt?.toDate(),
        canceledAt: data.canceledAt?.toDate(),
        expiredAt: data.expiredAt?.toDate(),
        failedAt: data.failedAt?.toDate()
      } as MolliePayment);
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
    const paymentRef = doc(db, `clubs/${clubId}/mollie_payments/${paymentId}`);

    // Map Mollie status directly (Mollie uses same status names)
    const status = webhookData.status as MolliePaymentStatus;

    const updateData: Record<string, any> = {
      status,
      webhookData,
      updatedAt: serverTimestamp()
    };

    // Set timestamp based on status
    switch (status) {
      case 'paid':
        updateData.paidAt = webhookData.paidAt ? new Date(webhookData.paidAt) : serverTimestamp();
        break;
      case 'canceled':
        updateData.canceledAt = webhookData.canceledAt ? new Date(webhookData.canceledAt) : serverTimestamp();
        break;
      case 'expired':
        updateData.expiredAt = webhookData.expiredAt ? new Date(webhookData.expiredAt) : serverTimestamp();
        break;
      case 'failed':
        updateData.failedAt = webhookData.failedAt ? new Date(webhookData.failedAt) : serverTimestamp();
        break;
    }

    if (webhookData.id) {
      updateData.molliePaymentId = webhookData.id;
    }

    if (webhookData.method) {
      updateData.method = webhookData.method;
    }

    await updateDoc(paymentRef, updateData);
  }

  /**
   * Log an API call or event
   */
  static async logApiCall(
    clubId: string,
    logEntry: Omit<MollieLogEntry, 'timestamp'>
  ): Promise<void> {
    const logsRef = collection(db, `clubs/${clubId}/mollie_logs`);

    const logData = removeUndefined({
      ...logEntry,
      timestamp: serverTimestamp()
    });

    await addDoc(logsRef, logData);
  }

  /**
   * Get recent logs
   */
  static async getRecentLogs(
    clubId: string,
    limitCount: number = 100
  ): Promise<MollieLogEntry[]> {
    const logsRef = collection(db, `clubs/${clubId}/mollie_logs`);
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);

    const logs: MollieLogEntry[] = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate() || new Date()
      } as MollieLogEntry);
    });

    return logs;
  }

  /**
   * Get human-readable status label (French)
   */
  static getStatusLabel(status: MolliePaymentStatus): string {
    const labels: Record<MolliePaymentStatus, string> = {
      'open': 'En attente',
      'pending': 'En cours',
      'paid': 'Paye',
      'failed': 'Echoue',
      'canceled': 'Annule',
      'expired': 'Expire'
    };
    return labels[status] || status;
  }

  /**
   * Get status color class for UI
   */
  static getStatusColor(status: MolliePaymentStatus): string {
    const colors: Record<MolliePaymentStatus, string> = {
      'open': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      'pending': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      'paid': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      'failed': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      'canceled': 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800 dark:bg-gray-900/30 dark:text-dark-text-muted',
      'expired': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
    };
    return colors[status] || 'bg-gray-100 dark:bg-dark-bg-tertiary text-gray-800';
  }

  /**
   * Get method label (French)
   */
  static getMethodLabel(method: MolliePaymentMethod): string {
    if (!method) return 'Choix client';
    const labels: Record<string, string> = {
      'bancontact': 'Bancontact',
      'kbc': 'KBC/CBC',
      'belfius': 'Belfius',
      'creditcard': 'Carte bancaire',
      'applepay': 'Apple Pay'
    };
    return labels[method] || method;
  }
}
