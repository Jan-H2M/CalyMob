/**
 * OGM Service — Firestore operations for Belgian structured communications
 *
 * Manages:
 * - Atomic OGM counter (first runTransaction in this codebase)
 * - Payment reference CRUD (OGM → free text mapping)
 *
 * Collection: clubs/{clubId}/payment_references/{ogm_digits}
 * Counter:    clubs/{clubId}/settings/ogm_counter
 */

import { logger } from '@/utils/logger';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  calculateOgmCheckDigit,
  formatOgmDisplay,
  validateOgm,
} from '@/utils/ogm';

// ============================================================
// TYPES
// ============================================================

export type OgmContextType = 'EVENT_REGISTRATION' | 'REIMBURSEMENT' | 'TEST';
export type OgmStatus = 'NEW' | 'MATCHED' | 'EXPIRED' | 'CANCELLED';

export interface PaymentReference {
  ogm: string;                        // 12 digits (= document ID)
  ogm_display: string;                // +++xxx/xxxx/xxxxx+++
  payload_text: string;               // Original free text communication
  context_type: OgmContextType;
  context_id?: string;                // demande_id or operation_id
  amount_cents?: number;
  status: OgmStatus;
  matched_transaction_id?: string;
  matched_at?: Timestamp;
  created_by: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface CreatePaymentReferenceDTO {
  payload_text: string;
  context_type: OgmContextType;
  context_id?: string;
  amount_cents?: number;
  created_by: string;
}

// ============================================================
// OGM COUNTER — Atomic generation
// ============================================================

/** Starting value for OGM counter (10-digit number) */
const OGM_COUNTER_START = 1000000001;

/**
 * Atomically generate the next unique OGM using a Firestore transaction.
 *
 * This is the FIRST use of runTransaction() in the CalyCompta codebase.
 * It guarantees no two concurrent requests can generate the same OGM.
 *
 * Flow:
 * 1. Read current counter from clubs/{clubId}/settings/ogm_counter
 * 2. Increment counter
 * 3. Write back atomically
 * 4. Calculate mod97 check digits
 * 5. Return 12-digit OGM
 *
 * @param clubId - Club identifier
 * @returns 12-digit OGM string
 */
export async function generateNextOgm(clubId: string): Promise<string> {
  const counterRef = doc(db, 'clubs', clubId, 'settings', 'ogm_counter');

  const ogm = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);

    let nextCounter: number;
    if (counterSnap.exists()) {
      nextCounter = (counterSnap.data().counter as number) + 1;
    } else {
      // First OGM ever — initialize counter
      nextCounter = OGM_COUNTER_START;
    }

    // Atomic write
    transaction.set(counterRef, {
      counter: nextCounter,
      updated_at: serverTimestamp(),
    });

    // Build OGM from counter
    const base10 = String(nextCounter).padStart(10, '0');
    const checkDigit = calculateOgmCheckDigit(base10);
    return base10 + checkDigit;
  });

  logger.info(`[OGM] Generated: ${formatOgmDisplay(ogm)} (counter-based)`);
  return ogm;
}

// ============================================================
// PAYMENT REFERENCES — CRUD
// ============================================================

/**
 * Generate a new OGM and create its payment reference in Firestore.
 *
 * @param clubId - Club identifier
 * @param data - Payment reference data
 * @returns The generated 12-digit OGM
 */
export async function createPaymentReference(
  clubId: string,
  data: CreatePaymentReferenceDTO
): Promise<string> {
  // 1. Generate unique OGM
  const ogm = await generateNextOgm(clubId);

  // 2. Create payment reference document (OGM as document ID)
  const refDoc = doc(db, 'clubs', clubId, 'payment_references', ogm);

  const reference: Omit<PaymentReference, 'created_at' | 'updated_at'> & {
    created_at: ReturnType<typeof serverTimestamp>;
    updated_at: ReturnType<typeof serverTimestamp>;
  } = {
    ogm,
    ogm_display: formatOgmDisplay(ogm),
    payload_text: data.payload_text.substring(0, 140),
    context_type: data.context_type,
    context_id: data.context_id || '',
    amount_cents: data.amount_cents,
    status: 'NEW',
    created_by: data.created_by,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  await setDoc(refDoc, reference);

  logger.info(
    `[OGM] Created payment reference: ${formatOgmDisplay(ogm)} → "${data.payload_text.substring(0, 50)}..."`
  );

  return ogm;
}

/**
 * Look up a payment reference by OGM.
 *
 * @param clubId - Club identifier
 * @param ogm - 12-digit OGM
 * @returns PaymentReference or null if not found
 */
export async function getPaymentReference(
  clubId: string,
  ogm: string
): Promise<PaymentReference | null> {
  if (!validateOgm(ogm)) {
    logger.warn(`[OGM] Invalid OGM for lookup: ${ogm}`);
    return null;
  }

  const refDoc = doc(db, 'clubs', clubId, 'payment_references', ogm);
  const snap = await getDoc(refDoc);

  if (!snap.exists()) {
    return null;
  }

  return snap.data() as PaymentReference;
}

/**
 * Mark a payment reference as matched to a bank transaction.
 *
 * @param clubId - Club identifier
 * @param ogm - 12-digit OGM
 * @param transactionId - Firestore ID of the matched transaction
 */
export async function markOgmAsMatched(
  clubId: string,
  ogm: string,
  transactionId: string
): Promise<void> {
  const refDoc = doc(db, 'clubs', clubId, 'payment_references', ogm);

  await updateDoc(refDoc, {
    status: 'MATCHED',
    matched_transaction_id: transactionId,
    matched_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  logger.info(`[OGM] Marked ${formatOgmDisplay(ogm)} as MATCHED → transaction ${transactionId}`);
}

/**
 * Get all payment references for a club, optionally filtered by status.
 *
 * @param clubId - Club identifier
 * @param status - Optional status filter
 * @param maxResults - Maximum number of results (default 50)
 * @returns Array of PaymentReference
 */
export async function listPaymentReferences(
  clubId: string,
  status?: OgmStatus,
  maxResults: number = 50
): Promise<PaymentReference[]> {
  const refsCollection = collection(db, 'clubs', clubId, 'payment_references');

  let q;
  if (status) {
    q = query(
      refsCollection,
      where('status', '==', status),
      orderBy('created_at', 'desc'),
      limit(maxResults)
    );
  } else {
    q = query(
      refsCollection,
      orderBy('created_at', 'desc'),
      limit(maxResults)
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data() as PaymentReference);
}

/**
 * Update the context_id of a payment reference.
 * Used when the demande is created after the OGM (e.g., in reimbursement flow).
 *
 * @param clubId - Club identifier
 * @param ogm - 12-digit OGM
 * @param contextId - The new context ID (demande_id, operation_id, etc.)
 */
export async function updatePaymentReferenceContext(
  clubId: string,
  ogm: string,
  contextId: string
): Promise<void> {
  const refDoc = doc(db, 'clubs', clubId, 'payment_references', ogm);

  await updateDoc(refDoc, {
    context_id: contextId,
    updated_at: serverTimestamp(),
  });
}
