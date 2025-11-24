/**
 * Service de matching automatique entre dépenses et transactions bancaires
 * Utilise le numéro de séquence dans le nom du fichier pour lier automatiquement
 */

import { collection, query, where, getDocs, getDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TransactionBancaire, MatchedEntity } from '@/types';

/**
 * Extrait le numéro de séquence depuis un nom de fichier
 * Format attendu: YYYY-NNN au début du nom (ex: "2024-123_facture.pdf")
 * Supporte aussi le format multi-documents: YYYY-NNN-X (ex: "2024-123-2_recu.pdf")
 *
 * @param filename Nom du fichier (avec ou sans extension)
 * @returns Numéro de séquence (ex: "2024-123") ou null si non trouvé
 *
 * @example
 * extractSequenceFromFilename("2024-123_facture_hotel.pdf") // "2024-123"
 * extractSequenceFromFilename("2024-123-1_facture.pdf") // "2024-123"
 * extractSequenceFromFilename("2024-123-2_recu.pdf") // "2024-123"
 * extractSequenceFromFilename("2025-45_recu.jpg") // "2025-45"
 * extractSequenceFromFilename("facture.pdf") // null
 */
export function extractSequenceFromFilename(filename: string): string | null {
  // Regex pour capturer YYYY-NNN au début du nom
  // Ignore le suffixe -X si présent (pour multi-documents)
  // Exemple: 2024-123, 2025-45, 2023-1, 2024-123-1, 2024-123-2
  const regex = /^(\d{4}-\d+)(?:-\d+)?/;
  const match = filename.match(regex);

  if (match && match[1]) {
    console.log(`✅ Numéro de séquence extrait: "${match[1]}" depuis "${filename}"`);
    return match[1];
  }

  console.log(`ℹ️ Aucun numéro de séquence trouvé dans "${filename}"`);
  return null;
}

/**
 * Cherche une transaction bancaire par son numéro de séquence
 *
 * @param sequence Numéro de séquence (ex: "2024-123")
 * @param clubId ID du club
 * @returns Transaction trouvée ou null
 */
export async function findTransactionBySequence(
  sequence: string,
  clubId: string
): Promise<TransactionBancaire | null> {
  try {
    console.log(`🔍 Recherche transaction avec numero_sequence="${sequence}" pour club="${clubId}"`);

    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const q = query(transactionsRef, where('numero_sequence', '==', sequence));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log(`⚠️ Aucune transaction trouvée avec numero_sequence="${sequence}"`);
      return null;
    }

    if (snapshot.size > 1) {
      console.warn(`⚠️ Plusieurs transactions trouvées avec numero_sequence="${sequence}". Utilisation de la première.`);
    }

    const txDoc = snapshot.docs[0];
    const transaction = {
      id: txDoc.id,
      ...txDoc.data()
    } as TransactionBancaire;

    console.log(`✅ Transaction trouvée: ID=${transaction.id}, Montant=${transaction.montant}€, Contrepartie="${transaction.contrepartie_nom}"`);
    return transaction;

  } catch (error) {
    console.error(`❌ Erreur lors de la recherche de transaction:`, error);
    return null;
  }
}

/**
 * Lie automatiquement une dépense à une transaction bancaire
 * Met à jour le matched_entities de la transaction
 *
 * @param demandeId ID de la demande de remboursement
 * @param demandeName Nom du demandeur (pour affichage)
 * @param transactionId ID de la transaction bancaire
 * @param clubId ID du club
 */
export async function autoLinkExpenseToTransaction(
  demandeId: string,
  demandeName: string,
  transactionId: string,
  clubId: string
): Promise<void> {
  try {
    console.log(`🔗 Liaison automatique: Dépense ${demandeId} → Transaction ${transactionId}`);

    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);

    const matchedEntity: MatchedEntity = {
      entity_type: 'expense',
      entity_id: demandeId,
      entity_name: demandeName,
      confidence: 100, // Confiance maximale car basé sur le numéro de séquence
      matched_at: new Date(),
      matched_by: 'auto',
      notes: 'Liaison automatique via numéro de séquence dans le nom du fichier'
    };

    // Ajouter l'entité liée dans matched_entities (évite les doublons grâce à arrayUnion)
    await updateDoc(transactionRef, {
      matched_entities: arrayUnion(matchedEntity),
      reconcilie: true, // Marquer comme réconcilié
      updated_at: new Date()
    });

    console.log(`✅ Liaison créée avec succès`);

  } catch (error) {
    console.error(`❌ Erreur lors de la liaison automatique:`, error);
    throw error;
  }
}

/**
 * Délier une dépense d'une transaction bancaire
 *
 * @param demandeId ID de la dépense à délier
 * @param transactionId ID de la transaction bancaire
 * @param clubId ID du club
 */
export async function unlinkExpenseFromTransaction(
  demandeId: string,
  transactionId: string,
  clubId: string
): Promise<void> {
  try {
    console.log(`🔓 Déliage: Dépense ${demandeId} ← Transaction ${transactionId}`);

    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);
    const transactionDoc = await getDoc(transactionRef);

    if (!transactionDoc.exists()) {
      throw new Error('Transaction non trouvée');
    }

    const transactionData = transactionDoc.data();
    const matchedEntities = (transactionData.matched_entities || []) as MatchedEntity[];

    // Filtrer pour retirer la dépense
    const updatedEntities = matchedEntities.filter(
      (entity) => !((entity.entity_type === 'expense' || entity.entity_type === 'demand') && entity.entity_id === demandeId)
    );

    // Mettre à jour la transaction
    await updateDoc(transactionRef, {
      matched_entities: updatedEntities,
      reconcilie: updatedEntities.length > 0, // Si plus d'entités, reste réconcilié
      updated_at: new Date()
    });

    console.log(`✅ Déliage effectué avec succès`);

  } catch (error) {
    console.error(`❌ Erreur lors du déliage:`, error);
    throw error;
  }
}

/**
 * Analyse un fichier uploadé et tente de trouver la transaction correspondante
 * Retourne les informations de matching
 *
 * @param filename Nom du fichier uploadé
 * @param clubId ID du club
 * @returns Objet avec les infos de matching
 */
export async function analyzeFileForTransactionMatch(
  filename: string,
  clubId: string
): Promise<{
  sequence: string | null;
  transaction: TransactionBancaire | null;
  matched: boolean;
}> {
  const sequence = extractSequenceFromFilename(filename);

  if (!sequence) {
    return {
      sequence: null,
      transaction: null,
      matched: false
    };
  }

  const transaction = await findTransactionBySequence(sequence, clubId);

  return {
    sequence,
    transaction,
    matched: !!transaction
  };
}

/**
 * Analyse un batch de fichiers pour le matching
 * Utile pour l'import batch
 *
 * @param filenames Tableau de noms de fichiers
 * @param clubId ID du club
 * @returns Map de résultats (filename → infos de matching)
 */
export async function analyzeBatchForTransactionMatch(
  filenames: string[],
  clubId: string
): Promise<Map<string, {
  sequence: string | null;
  transaction: TransactionBancaire | null;
  matched: boolean;
}>> {
  const results = new Map();

  console.log(`📊 Analyse de ${filenames.length} fichiers pour matching automatique`);

  for (const filename of filenames) {
    const result = await analyzeFileForTransactionMatch(filename, clubId);
    results.set(filename, result);
  }

  const matchedCount = Array.from(results.values()).filter(r => r.matched).length;
  console.log(`✅ ${matchedCount}/${filenames.length} fichiers liés automatiquement à des transactions`);

  return results;
}
