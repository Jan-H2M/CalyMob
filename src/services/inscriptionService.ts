import { db } from '@/lib/firebase';
import { doc, updateDoc, serverTimestamp, getDoc, getDocs, collection } from 'firebase/firestore';
import { InscriptionEvenement, TransactionBancaire } from '@/types';

/**
 * Service for managing inscription-transaction linking
 *
 * Architecture: One-to-One linking model
 * - One inscription can link to ONE transaction (or none for cash)
 * - One transaction can link to ONE inscription (or none/event-level)
 * - Multi-person payments are handled via transaction ventilation system
 */

export interface LinkInscriptionResult {
  success: boolean;
  message: string;
  inscription?: InscriptionEvenement;
  transaction?: TransactionBancaire;
}

export interface MatchQuality {
  overall: number;          // 0-100 score
  nameMatch: number;        // 0-100
  dateProximity: number;    // 0-100
  amountMatch: number;      // 0-100
  warnings: string[];
}

export interface AutoMatchResult {
  matched: Array<{
    inscription: InscriptionEvenement;
    transaction: TransactionBancaire;
    confidence: number;
    quality: MatchQuality;
  }>;
  needsSplit: Array<{
    inscription: InscriptionEvenement;
    transaction: TransactionBancaire;
    suggestedSplits: number;
    message: string;
  }>;
  cashSuggested: InscriptionEvenement[];
  unmatched: InscriptionEvenement[];
  availableTransactions: TransactionBancaire[];  // NEW: All available for manual selection
  totalAmount: number;
  matchedAmount: number;
}

/**
 * Calculate name similarity score (0-100)
 * IMPROVED: Supports compound names, inverted names, titles
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;

  // Normalize: lowercase, remove spaces, accents, titles
  const normalize = (s: string) => s.toLowerCase()
    .replace(/\b(mr|mme|mlle|dr|prof|m\.|mme\.|dr\.)\b/g, '') // Remove titles
    .replace(/\s+/g, '')
    .replace(/-/g, '') // Remove hyphens in compound names
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const n1 = normalize(name1);
  const n2 = normalize(name2);

  // Exact match after normalization
  if (n1 === n2) return 100;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 90;

  // Extract words (support for compound names like Jean-Pierre)
  const extractWords = (s: string) => s.toLowerCase()
    .replace(/\b(mr|mme|mlle|dr|prof|m\.|mme\.|dr\.)\b/g, '')
    .split(/[\s-]+/)
    .filter(w => w.length > 1); // Ignore single letters

  const words1 = extractWords(name1);
  const words2 = extractWords(name2);

  // Try inverted order (Nom Prénom vs Prénom Nom)
  const joined1 = words1.join('');
  const joined2 = words2.join('');
  const reversed2 = words2.reverse().join('');

  if (joined1 === reversed2) return 95; // Inverted match

  // Count matching words
  let matchingWords = 0;
  let perfectMatches = 0;

  for (const w1 of words1) {
    for (const w2 of words2) {
      if (w1 === w2) {
        perfectMatches++;
        matchingWords++;
        break;
      } else if (w1.includes(w2) || w2.includes(w1)) {
        matchingWords++;
        break;
      }
    }
  }

  if (perfectMatches > 0) {
    // At least one perfect word match
    const ratio = perfectMatches / Math.max(words1.length, words2.length);
    return Math.round(70 + (ratio * 20)); // 70-90%
  }

  if (matchingWords > 0) {
    // Partial matches
    const ratio = matchingWords / Math.max(words1.length, words2.length);
    return Math.round(ratio * 70); // 0-70%
  }

  // Levenshtein distance for remaining cases (simple version)
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 0;

  let distance = 0;
  for (let i = 0; i < Math.min(n1.length, n2.length); i++) {
    if (n1[i] !== n2[i]) distance++;
  }
  distance += Math.abs(n1.length - n2.length);

  const similarity = Math.max(0, 100 - (distance / maxLen) * 100);
  return Math.round(Math.min(similarity, 50)); // Cap at 50% for fuzzy matches
}

/**
 * Calculate date proximity score (0-100)
 * Closer dates get higher scores
 */
function calculateDateProximity(date1: Date, date2: Date): number {
  const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff === 0) return 100;        // Same day
  if (daysDiff <= 3) return 90;          // Within 3 days
  if (daysDiff <= 7) return 75;          // Within 1 week
  if (daysDiff <= 14) return 60;         // Within 2 weeks
  if (daysDiff <= 30) return 40;         // Within 1 month
  if (daysDiff <= 60) return 20;         // Within 2 months
  return 0;                               // Too far apart
}

/**
 * Calculate match quality for an inscription-transaction pair
 */
export function calculateMatchQuality(
  inscription: InscriptionEvenement,
  transaction: TransactionBancaire
): MatchQuality {
  const warnings: string[] = [];

  // Amount match (0-100)
  const amountDiff = Math.abs(transaction.montant - inscription.prix);
  let amountMatch = 100;
  if (amountDiff > 0.01) {
    amountMatch = Math.max(0, 100 - (amountDiff / inscription.prix) * 200);
    if (amountDiff > 0.50) {
      warnings.push(`Différence de montant: ${amountDiff.toFixed(2)}€`);
    }
  }

  // Name match (0-100) - Check both contrepartie_nom AND communication
  const inscriptionName = `${inscription.membre_prenom || ''} ${inscription.membre_nom || ''}`.trim();
  const transactionName = transaction.contrepartie_nom || '';
  const transactionComm = transaction.communication || '';

  // Try matching against counterparty name
  let nameMatch = calculateNameSimilarity(inscriptionName, transactionName);

  // IMPROVED: Also try matching against communication field
  const commMatch = calculateNameSimilarity(inscriptionName, transactionComm);
  nameMatch = Math.max(nameMatch, commMatch); // Use best match

  if (nameMatch < 50) {
    warnings.push(`Noms différents: ${inscriptionName} ≠ ${transactionName}`);
  }

  // Date proximity (0-100)
  const inscriptionDate = inscription.date_inscription || new Date();
  const transactionDate = transaction.date_execution || new Date();
  const dateProximity = calculateDateProximity(inscriptionDate, transactionDate);

  // IMPROVED: Increased tolerance from 30 to 45 days
  const daysDiff = Math.abs((inscriptionDate.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff > 45) {
    warnings.push(`Dates éloignées: ${Math.round(daysDiff)} jours d'écart`);
  }

  // Overall score (weighted average)
  const overall = Math.round(
    amountMatch * 0.4 +        // 40% weight on amount
    nameMatch * 0.35 +         // 35% weight on name
    dateProximity * 0.25       // 25% weight on date
  );

  return {
    overall,
    nameMatch,
    dateProximity,
    amountMatch,
    warnings
  };
}

/**
 * Link an inscription to a bank transaction (one-to-one)
 *
 * Validations:
 * - Transaction must not be a parent (ventilated) transaction
 * - Transaction must not already be linked to another inscription
 * - Inscription must not already be linked to a transaction
 *
 * @throws Error if validation fails
 */
export async function linkInscriptionToTransaction(
  clubId: string,
  eventId: string,
  inscriptionId: string,
  transactionId: string
): Promise<LinkInscriptionResult> {
  try {
    console.log(`🔗 Linking inscription ${inscriptionId} to transaction ${transactionId}`);

    // Get inscription from operation_participants collection
    const inscriptionRef = doc(db, 'clubs', clubId, 'operation_participants', inscriptionId);
    const inscriptionSnap = await getDoc(inscriptionRef);

    if (!inscriptionSnap.exists()) {
      throw new Error('Inscription introuvable');
    }

    const inscription = {
      ...inscriptionSnap.data(),
      id: inscriptionSnap.id
    } as InscriptionEvenement;

    // VALIDATION 1: Check inscription is not already linked
    if (inscription.transaction_id) {
      throw new Error(
        'Cette inscription est déjà liée à une transaction. ' +
        'Veuillez d\'abord délier la transaction existante.'
      );
    }

    // Get transaction
    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (!transactionSnap.exists()) {
      throw new Error('Transaction introuvable');
    }

    const transaction = {
      ...transactionSnap.data(),
      id: transactionSnap.id,
      date_execution: transactionSnap.data().date_execution?.toDate?.() || new Date(),
      date_valeur: transactionSnap.data().date_valeur?.toDate?.() || new Date(),
      created_at: transactionSnap.data().created_at?.toDate?.() || new Date(),
      updated_at: transactionSnap.data().updated_at?.toDate?.() || new Date()
    } as TransactionBancaire;

    // VALIDATION 2: Check transaction is not a parent (ventilated)
    if (transaction.is_parent) {
      throw new Error(
        'Impossible de lier à une transaction ventilée (parent). ' +
        'Veuillez lier aux transactions enfants issues de la ventilation.'
      );
    }

    // VALIDATION 3: Check transaction is not already linked to another inscription
    const existingInscriptionLink = transaction.matched_entities?.find(
      e => e.entity_type === 'inscription'
    );

    if (existingInscriptionLink) {
      throw new Error(
        `Cette transaction est déjà liée à l'inscription de ${existingInscriptionLink.entity_name}. ` +
        `Utilisez "Ventiler" pour diviser la transaction si elle couvre plusieurs inscriptions.`
      );
    }

    // VALIDATION 4: Check transaction is positive (income)
    if (transaction.montant <= 0) {
      throw new Error(
        'Seules les transactions positives (revenus) peuvent être liées aux inscriptions.'
      );
    }

    // Update inscription
    await updateDoc(inscriptionRef, {
      transaction_id: transactionId,
      transaction_montant: transaction.montant,
      mode_paiement: 'bank',
      paye: true,
      date_paiement: new Date(),
      updated_at: serverTimestamp()
    });

    // Update transaction with inscription link
    const existingEntities = transaction.matched_entities || [];
    await updateDoc(transactionRef, {
      matched_entities: [
        ...existingEntities,
        {
          entity_type: 'inscription',
          entity_id: inscriptionId,
          entity_name: inscription.membre_nom || 'Inconnu',
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'manual'
        }
      ],
      reconcilie: true,
      updated_at: serverTimestamp()
    });

    console.log('✅ Inscription linked successfully');

    return {
      success: true,
      message: `Inscription de ${inscription.membre_nom} liée à la transaction de ${transaction.montant}€`,
      inscription,
      transaction
    };
  } catch (error: any) {
    console.error('❌ Error linking inscription:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la liaison'
    };
  }
}

/**
 * Unlink inscription from transaction
 *
 * @param markUnpaid - If true, mark inscription as unpaid. If false, keep as paid (assume cash)
 */
export async function unlinkInscriptionTransaction(
  clubId: string,
  eventId: string,
  inscriptionId: string,
  markUnpaid: boolean = false
): Promise<LinkInscriptionResult> {
  try {
    console.log(`🔓 Unlinking inscription ${inscriptionId} (markUnpaid: ${markUnpaid})`);

    // Get inscription from operation_participants collection
    const inscriptionRef = doc(db, 'clubs', clubId, 'operation_participants', inscriptionId);
    const inscriptionSnap = await getDoc(inscriptionRef);

    if (!inscriptionSnap.exists()) {
      throw new Error('Inscription introuvable');
    }

    const inscription = {
      ...inscriptionSnap.data(),
      id: inscriptionSnap.id
    } as InscriptionEvenement;

    if (!inscription.transaction_id) {
      throw new Error('Cette inscription n\'est pas liée à une transaction');
    }

    const transactionId = inscription.transaction_id;

    // Update inscription
    const inscriptionUpdates: any = {
      transaction_id: null,
      transaction_montant: 0,
      updated_at: serverTimestamp()
    };

    if (markUnpaid) {
      // Mark as completely unpaid
      inscriptionUpdates.paye = false;
      inscriptionUpdates.mode_paiement = null;
      inscriptionUpdates.date_paiement = null;
    } else {
      // Keep as paid, assume cash
      inscriptionUpdates.mode_paiement = 'cash';
      // Keep paye=true and date_paiement
    }

    await updateDoc(inscriptionRef, inscriptionUpdates);

    // Remove inscription link from transaction
    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
    const transactionSnap = await getDoc(transactionRef);

    if (transactionSnap.exists()) {
      const transaction = transactionSnap.data();
      const updatedEntities = (transaction.matched_entities || []).filter(
        (e: any) => !(e.entity_type === 'inscription' && e.entity_id === inscriptionId)
      );

      await updateDoc(transactionRef, {
        matched_entities: updatedEntities,
        reconcilie: updatedEntities.length > 0,
        updated_at: serverTimestamp()
      });
    }

    console.log('✅ Inscription unlinked successfully');

    return {
      success: true,
      message: markUnpaid
        ? 'Transaction déliée et inscription marquée comme non payée'
        : 'Transaction déliée (inscription reste marquée comme payée en espèces)'
    };
  } catch (error: any) {
    console.error('❌ Error unlinking inscription:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors du délien'
    };
  }
}

/**
 * Mark inscription as paid in cash (no transaction)
 */
export async function markInscriptionPaidCash(
  clubId: string,
  eventId: string,
  inscriptionId: string,
  comment?: string
): Promise<LinkInscriptionResult> {
  try {
    console.log(`💵 Marking inscription ${inscriptionId} as paid in cash`);

    const inscriptionRef = doc(db, 'clubs', clubId, 'evenements', eventId, 'inscriptions', inscriptionId);
    const inscriptionSnap = await getDoc(inscriptionRef);

    if (!inscriptionSnap.exists()) {
      throw new Error('Inscription introuvable');
    }

    const updates: any = {
      paye: true,
      mode_paiement: 'cash',
      date_paiement: new Date(),
      updated_at: serverTimestamp()
    };

    if (comment) {
      updates.commentaire = comment;
    }

    await updateDoc(inscriptionRef, updates);

    console.log('✅ Inscription marked as paid in cash');

    return {
      success: true,
      message: 'Inscription marquée comme payée en espèces'
    };
  } catch (error: any) {
    console.error('❌ Error marking as cash:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors du marquage'
    };
  }
}

/**
 * Mark inscription as unpaid
 */
export async function markInscriptionUnpaid(
  clubId: string,
  eventId: string,
  inscriptionId: string
): Promise<LinkInscriptionResult> {
  try {
    console.log(`❌ Marking inscription ${inscriptionId} as unpaid`);

    const inscriptionRef = doc(db, 'clubs', clubId, 'evenements', eventId, 'inscriptions', inscriptionId);

    await updateDoc(inscriptionRef, {
      paye: false,
      mode_paiement: null,
      date_paiement: null,
      updated_at: serverTimestamp()
    });

    console.log('✅ Inscription marked as unpaid');

    return {
      success: true,
      message: 'Inscription marquée comme non payée'
    };
  } catch (error: any) {
    console.error('❌ Error marking as unpaid:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors du marquage'
    };
  }
}

/**
 * Update inscription comment
 */
export async function updateInscriptionComment(
  clubId: string,
  eventId: string,
  inscriptionId: string,
  comment: string
): Promise<LinkInscriptionResult> {
  try {
    const inscriptionRef = doc(db, 'clubs', clubId, 'evenements', eventId, 'inscriptions', inscriptionId);

    await updateDoc(inscriptionRef, {
      commentaire: comment,
      updated_at: serverTimestamp()
    });

    return {
      success: true,
      message: 'Commentaire mis à jour'
    };
  } catch (error: any) {
    console.error('❌ Error updating comment:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors de la mise à jour'
    };
  }
}

/**
 * Auto-match all inscriptions to transactions
 *
 * Algorithm:
 * 1. Find exact amount matches (±0.01€) - 100% confidence
 * 2. Find close matches (±0.50€) - 90% confidence
 * 3. Detect transactions that are multiples of inscription prices (suggest split)
 * 4. Suggest cash payment for unmatched
 */
export async function autoMatchAllInscriptions(
  clubId: string,
  eventId: string,
  options: {
    autoMarkCashPayments?: boolean;
    dateTolerance?: number; // Days ±
    amountTolerance?: number; // Euros ±
  } = {}
): Promise<AutoMatchResult> {
  const {
    autoMarkCashPayments = false,
    dateTolerance = 45, // IMPROVED: Increased from 30 to 45 days
    amountTolerance = 0.50
  } = options;

  console.log('🔄 Starting auto-match for all inscriptions...');

  const result: AutoMatchResult = {
    matched: [],
    needsSplit: [],
    cashSuggested: [],
    unmatched: [],
    totalAmount: 0,
    matchedAmount: 0
  };

  try {
    // Load all inscriptions for this event
    // 🆕 MIGRATION: Load from 'operation_participants' collection
    const inscriptionsRef = collection(db, 'clubs', clubId, 'operation_participants');
    const inscQuery = query(inscriptionsRef, where('operation_id', '==', eventId));
    const inscriptionsSnap = await getDocs(inscQuery);

    const inscriptions: InscriptionEvenement[] = inscriptionsSnap.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      date_inscription: doc.data().date_inscription?.toDate?.() || new Date(),
      date_paiement: doc.data().date_paiement?.toDate?.(),
      created_at: doc.data().created_at?.toDate?.(),
      updated_at: doc.data().updated_at?.toDate?.()
    } as InscriptionEvenement));

    // Filter: Only inscriptions not yet linked and not paid
    const unlinkInscriptions = inscriptions.filter(i => !i.transaction_id && !i.paye);

    console.log(`  Found ${unlinkInscriptions.length} unlinked inscriptions`);

    if (unlinkInscriptions.length === 0) {
      return result;
    }

    // Load all available transactions
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnap = await getDocs(transactionsRef);

    let availableTransactions: TransactionBancaire[] = transactionsSnap.docs.map(doc => ({
      ...doc.data(),
      id: doc.id,
      date_execution: doc.data().date_execution?.toDate?.() || new Date(),
      date_valeur: doc.data().date_valeur?.toDate?.() || new Date(),
      created_at: doc.data().created_at?.toDate?.() || new Date(),
      updated_at: doc.data().updated_at?.toDate?.() || new Date()
    } as TransactionBancaire));

    // Filter: Only positive (income), not parent, not already linked to inscription
    const filteredTransactions = availableTransactions.filter(tx =>
      tx.montant > 0 &&
      !tx.is_parent &&
      !tx.matched_entities?.some(e => e.entity_type === 'inscription')
    );

    console.log(`  Found ${filteredTransactions.length} available transactions`);

    // Store ALL available transactions for manual selection
    result.availableTransactions = [...filteredTransactions];

    // Calculate total amount needed
    result.totalAmount = unlinkInscriptions.reduce((sum, i) => sum + i.prix, 0);

    // Copy for matching (we'll remove from this as we match)
    let transactionsPool = [...filteredTransactions];

    // Try to match each inscription
    for (const inscription of unlinkInscriptions) {
      // Try exact match first
      const exactMatch = transactionsPool.find(tx =>
        Math.abs(tx.montant - inscription.prix) < 0.01
      );

      if (exactMatch) {
        const quality = calculateMatchQuality(inscription, exactMatch);
        result.matched.push({
          inscription,
          transaction: exactMatch,
          confidence: 100,
          quality
        });
        result.matchedAmount += exactMatch.montant;
        // Remove from pool
        transactionsPool = transactionsPool.filter(tx => tx.id !== exactMatch.id);
        continue;
      }

      // Try close match (within tolerance)
      const closeMatch = transactionsPool.find(tx =>
        Math.abs(tx.montant - inscription.prix) <= amountTolerance
      );

      if (closeMatch) {
        const quality = calculateMatchQuality(inscription, closeMatch);
        result.matched.push({
          inscription,
          transaction: closeMatch,
          confidence: 90,
          quality
        });
        result.matchedAmount += closeMatch.montant;
        transactionsPool = transactionsPool.filter(tx => tx.id !== closeMatch.id);
        continue;
      }

      // Check if there's a transaction that's a multiple of this inscription price
      const multipleMatch = transactionsPool.find(tx => {
        const ratio = tx.montant / inscription.prix;
        return ratio >= 2 && ratio <= 10 && Math.abs(ratio - Math.round(ratio)) < 0.1;
      });

      if (multipleMatch) {
        const suggestedSplits = Math.round(multipleMatch.montant / inscription.prix);
        result.needsSplit.push({
          inscription,
          transaction: multipleMatch,
          suggestedSplits,
          message: `Transaction de ${multipleMatch.montant}€ devrait être ventilée en ${suggestedSplits} parts de ${inscription.prix}€`
        });
        continue;
      }

      // No match found - suggest cash payment
      result.cashSuggested.push(inscription);
      result.unmatched.push(inscription);
    }

    console.log(`✅ Auto-match complete: ${result.matched.length} matched, ${result.needsSplit.length} need split, ${result.cashSuggested.length} cash suggested`);

    // Auto-mark cash payments if requested
    if (autoMarkCashPayments && result.cashSuggested.length > 0) {
      console.log(`  Auto-marking ${result.cashSuggested.length} as cash payments...`);
      for (const inscription of result.cashSuggested) {
        await markInscriptionPaidCash(clubId, eventId, inscription.id, 'Auto-marqué comme paiement espèces (aucune transaction correspondante)');
      }
    }

    return result;
  } catch (error) {
    console.error('❌ Error during auto-match:', error);
    return result;
  }
}
