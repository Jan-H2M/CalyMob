import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { TransactionBancaire, Operation, InscriptionEvenement } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Mapping event_category + type de transaction → code comptable par défaut.
 * Basé sur le plan comptable Calypso (calypso-accounts.ts).
 *
 * Pour les revenus (montant > 0), on utilise les codes (V).
 * Pour les dépenses (montant < 0), on utilise les codes (A).
 */
const DEFAULT_CODE_COMPTABLE: Record<string, { revenue: string; expense: string }> = {
  // Événements plongée (event_number commence par P)
  plongee: {
    revenue: '618-00-732',   // Sorties plongées (V)
    expense: '618-00-632',   // Sorties plongées (A)
  },
  // Événements sortie / non-plongée (event_number commence par S)
  sortie: {
    revenue: '619-00-733',   // Sorties non plongées (V)
    expense: '619-00-633',   // Sorties non plongées (A)
  },
  // Piscine
  piscine: {
    revenue: '700-00-720',   // Entrées bassin
    expense: '610-00-621',   // Location piscine
  },
};

/**
 * Service de matching automatique des transactions bancaires
 * basé sur le event_number (ex: PAAAK, SAABC) dans la communication.
 *
 * Pattern de communication: "[EVENT_NUMBER] [Nom événement] [Prénom NOM membre]"
 * Exemple: "PAAAK Croisette Frank VELLEMANS"
 *
 * Ce service fournit un matching 100% déterministe (pas de fuzzy matching)
 * puisque le event_number est un identifiant unique par événement.
 */

export interface EventNumberMatchResult {
  success: boolean;
  message: string;
  eventNumber?: string;
  operation?: Operation;
  inscription?: InscriptionEvenement;
  codeComptable?: string;
  /** Détails de ce qui a été fait */
  actions?: string[];
  /** Les updates appliquées à la transaction (pour mettre à jour l'UI sans re-fetch) */
  transactionUpdates?: Partial<TransactionBancaire>;
}

/**
 * Regex pour extraire un event_number depuis la communication bancaire.
 * Deux formats coexistent:
 *  - Nouveau: P ou S suivi de 4 lettres majuscules (ex: PAAAK, SAABC)
 *  - Ancien:  chiffre suivi de 5 caractères alphanumériques majuscules (ex: 5SDVXA, 2ABCDE)
 */
const EVENT_NUMBER_NEW_REGEX = /\b([PS][A-Z]{4})\b/;
const EVENT_NUMBER_OLD_REGEX = /\b(\d[A-Z0-9]{5})\b/;

/**
 * Extrait le event_number d'une communication bancaire.
 * Essaie d'abord le nouveau format (PAAAK), puis l'ancien (5SDVXA).
 */
export function extractEventNumber(communication: string): string | null {
  if (!communication) return null;
  // Nouveau format d'abord (plus spécifique)
  const newMatch = communication.match(EVENT_NUMBER_NEW_REGEX);
  if (newMatch) return newMatch[1];
  // Ancien format
  const oldMatch = communication.match(EVENT_NUMBER_OLD_REGEX);
  if (oldMatch) return oldMatch[1];
  return null;
}

/**
 * Extrait le nom du membre depuis la communication bancaire.
 * On enlève le event_number et le nom de l'événement (qui correspond au titre de l'opération),
 * et ce qui reste devrait être "Prénom NOM".
 */
function extractMemberName(communication: string, eventNumber: string, eventTitle: string): string | null {
  if (!communication) return null;

  // Enlever le event_number
  let remaining = communication.replace(eventNumber, '').trim();

  // Enlever le titre de l'événement (case-insensitive)
  if (eventTitle) {
    const titleRegex = new RegExp(eventTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    remaining = remaining.replace(titleRegex, '').trim();
  }

  return remaining || null;
}

/**
 * Normalise un nom pour la comparaison (lowercase, sans accents, espaces normalisés).
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare deux noms de manière flexible.
 * Vérifie si les mots du nom cherché sont tous présents dans le nom cible,
 * indépendamment de l'ordre (Frank VELLEMANS == VELLEMANS Frank).
 */
function namesMatch(searchName: string, candidateName: string): boolean {
  const normalizedSearch = normalizeName(searchName);
  const normalizedCandidate = normalizeName(candidateName);

  // Match exact
  if (normalizedSearch === normalizedCandidate) return true;

  // Comparer les mots individuels (ordre inversé possible)
  const searchWords = normalizedSearch.split(' ').filter(w => w.length > 1);
  const candidateWords = normalizedCandidate.split(' ').filter(w => w.length > 1);

  if (searchWords.length === 0 || candidateWords.length === 0) return false;

  // Tous les mots du search doivent être présents dans le candidate
  const allWordsMatch = searchWords.every(sw =>
    candidateWords.some(cw => cw === sw || cw.startsWith(sw) || sw.startsWith(cw))
  );

  return allWordsMatch;
}

/**
 * Cherche une opération par son event_number.
 */
async function findOperationByEventNumber(clubId: string, eventNumber: string): Promise<Operation | null> {
  const operationsRef = collection(db, 'clubs', clubId, 'operations');
  const q = query(operationsRef, where('event_number', '==', eventNumber));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const docData = snapshot.docs[0];
  return {
    ...docData.data(),
    id: docData.id,
    date_debut: docData.data().date_debut?.toDate?.(),
    date_fin: docData.data().date_fin?.toDate?.(),
    created_at: docData.data().created_at?.toDate?.(),
    updated_at: docData.data().updated_at?.toDate?.()
  } as Operation;
}

/**
 * Cherche l'inscription correspondante au membre dans les inscriptions de l'événement.
 */
async function findMatchingInscription(
  clubId: string,
  operationId: string,
  memberName: string | null
): Promise<InscriptionEvenement | null> {
  const inscriptionsRef = collection(db, 'clubs', clubId, 'operations', operationId, 'inscriptions');
  const snapshot = await getDocs(inscriptionsRef);

  if (snapshot.empty) return null;

  const inscriptions = snapshot.docs.map(d => ({
    ...d.data(),
    id: d.id,
    date_inscription: d.data().date_inscription?.toDate?.() || new Date(),
    date_paiement: d.data().date_paiement?.toDate?.(),
    created_at: d.data().created_at?.toDate?.(),
    updated_at: d.data().updated_at?.toDate?.()
  } as InscriptionEvenement));

  if (!memberName) return null;

  // Chercher par nom complet (prénom + nom ou nom + prénom)
  for (const insc of inscriptions) {
    const fullName = `${insc.membre_prenom || ''} ${insc.membre_nom || ''}`.trim();
    if (fullName && namesMatch(memberName, fullName)) {
      return insc;
    }
  }

  // Fallback: chercher uniquement par nom de famille
  for (const insc of inscriptions) {
    if (insc.membre_nom && namesMatch(memberName, insc.membre_nom)) {
      return insc;
    }
  }

  return null;
}

/**
 * Vérifie si une transaction peut être auto-matchée par event_number.
 * Retourne le event_number trouvé ou null.
 */
export function canAutoMatch(transaction: TransactionBancaire): string | null {
  // Seulement les transactions entrantes (positives)
  if (transaction.montant <= 0) return null;
  // Pas les transactions déjà réconciliées avec des entités
  if (transaction.matched_entities && transaction.matched_entities.length > 0) return null;
  // Pas les transactions parents (ventilées)
  if (transaction.is_parent) return null;

  return extractEventNumber(transaction.communication);
}

/**
 * Effectue le matching automatique complet pour une transaction.
 *
 * Actions réalisées si le matching réussit:
 * 1. Assigner le code_comptable de l'opération à la transaction
 * 2. Lier la transaction à l'activité (matched_entities type 'event')
 * 3. Si inscription trouvée: lier l'inscription à la transaction et marquer comme payée
 * 4. Mettre reconcilie = true
 */
export async function autoMatchByEventNumber(
  clubId: string,
  transaction: TransactionBancaire
): Promise<EventNumberMatchResult> {
  const actions: string[] = [];

  try {
    // 1. Extraire le event_number
    const eventNumber = extractEventNumber(transaction.communication);
    if (!eventNumber) {
      return {
        success: false,
        message: 'Aucun code événement trouvé dans la communication'
      };
    }

    logger.debug(`🔍 Auto-match: event_number "${eventNumber}" trouvé dans "${transaction.communication}"`);

    // 2. Chercher l'opération
    const operation = await findOperationByEventNumber(clubId, eventNumber);
    if (!operation) {
      return {
        success: false,
        message: `Aucune opération trouvée avec le code ${eventNumber}`,
        eventNumber
      };
    }

    logger.debug(`✅ Opération trouvée: "${operation.titre}" (${operation.id})`);

    // 3. Préparer les updates de la transaction
    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transaction.id);

    const existingEntities = transaction.matched_entities || [];

    // Ajouter le lien vers l'opération
    const eventEntity = {
      entity_type: 'event' as const,
      entity_id: operation.id,
      entity_name: operation.titre,
      confidence: 100,
      matched_at: new Date(),
      matched_by: 'auto' as const
    };

    const updatedEntities = [...existingEntities, eventEntity];
    actions.push(`Lié à l'activité "${operation.titre}"`);

    // Code comptable: d'abord celui de l'opération, sinon on le déduit du type d'événement
    let codeComptable = operation.code_comptable;

    if (!codeComptable) {
      // Déterminer le code comptable depuis le type d'événement
      // Nouveau format: P = plongée, S = sortie
      // Ancien format: chiffre — on se fie à event_category de l'opération
      const eventCategory = operation.event_category
        || (eventNumber.startsWith('P') ? 'plongee' : 'sortie');
      const defaultCodes = DEFAULT_CODE_COMPTABLE[eventCategory];
      if (defaultCodes) {
        codeComptable = transaction.montant > 0 ? defaultCodes.revenue : defaultCodes.expense;
        logger.debug(`📋 Code comptable déduit du type "${eventCategory}": ${codeComptable}`);
      }
    }

    const transactionUpdates: Record<string, any> = {
      matched_entities: updatedEntities,
      reconcilie: true,
      statut_reconciliation: 'reconcilie',
      operation_id: operation.id,
      evenement_id: operation.id,   // Legacy field - backward compatibility
      updated_at: serverTimestamp()
    };

    if (codeComptable) {
      transactionUpdates.code_comptable = codeComptable;
      actions.push(`Code comptable: ${codeComptable}`);
    }

    // 4. Chercher l'inscription correspondante
    const memberName = extractMemberName(transaction.communication, eventNumber, operation.titre);
    let matchedInscription: InscriptionEvenement | null = null;

    if (memberName) {
      logger.debug(`🔍 Recherche inscription pour "${memberName}"`);
      matchedInscription = await findMatchingInscription(clubId, operation.id, memberName);

      if (matchedInscription && !matchedInscription.transaction_id) {
        // Lier l'inscription à la transaction
        const inscriptionRef = doc(
          db, 'clubs', clubId, 'operations', operation.id, 'inscriptions', matchedInscription.id
        );

        await updateDoc(inscriptionRef, {
          transaction_id: transaction.id,
          transaction_montant: transaction.montant,
          mode_paiement: 'bank',
          paye: true,
          date_paiement: transaction.date_execution,
          updated_at: serverTimestamp()
        });

        // Ajouter aussi l'inscription dans matched_entities
        updatedEntities.push({
          entity_type: 'inscription' as const,
          entity_id: matchedInscription.id,
          entity_name: matchedInscription.membre_nom || memberName,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'auto' as const
        });
        transactionUpdates.matched_entities = updatedEntities;

        actions.push(`Inscription de ${matchedInscription.membre_prenom || ''} ${matchedInscription.membre_nom || ''} marquée payée`);

        logger.debug(`✅ Inscription liée: ${matchedInscription.membre_nom}`);
      } else if (matchedInscription?.paye) {
        actions.push(`Inscription de ${matchedInscription.membre_nom} déjà payée (pas modifiée)`);
      }
    }

    // 5. Appliquer les updates à la transaction
    await updateDoc(transactionRef, transactionUpdates);

    const message = actions.join(' • ');
    logger.debug(`✅ Auto-match complet: ${message}`);

    // Préparer les updates pour l'UI (sans serverTimestamp qui ne marche pas côté client)
    const uiUpdates: Partial<TransactionBancaire> = {
      matched_entities: updatedEntities,
      reconcilie: true,
      statut_reconciliation: 'reconcilie' as const,
      operation_id: operation.id,
      evenement_id: operation.id,   // Legacy field
      ...(codeComptable ? { code_comptable: codeComptable } : {})
    };

    return {
      success: true,
      message,
      eventNumber,
      operation,
      inscription: matchedInscription || undefined,
      codeComptable,
      actions,
      transactionUpdates: uiUpdates
    };

  } catch (error: any) {
    logger.error('❌ Erreur auto-match:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors du matching automatique'
    };
  }
}

/**
 * Annule un auto-match : délie la transaction de l'événement et retire le code comptable.
 *
 * IMPORTANT: Ne touche PAS aux inscriptions — elles viennent de CalyMob
 * et ne doivent pas être modifiées.
 *
 * Opérations:
 * 1. Transaction: vider matched_entities, operation_id, evenement_id, code_comptable
 * 2. Remettre statut → non_verifie, reconcilie → false
 */
export async function resetAutoMatch(
  clubId: string,
  transaction: TransactionBancaire
): Promise<EventNumberMatchResult> {
  const actions: string[] = [];

  try {
    const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transaction.id);

    // Lister ce qu'on délie (pour le message)
    const linkedEvents = (transaction.matched_entities || []).filter(
      e => e.entity_type === 'event'
    );
    for (const eventEntity of linkedEvents) {
      actions.push(`Délié de "${eventEntity.entity_name}"`);
    }

    // Reset complet de la transaction (sans toucher aux inscriptions)
    await updateDoc(transactionRef, {
      matched_entities: [],
      reconcilie: false,
      statut_reconciliation: 'non_verifie',
      operation_id: null,
      evenement_id: null,
      code_comptable: null,
      categorie: null,
      updated_at: serverTimestamp()
    });
    actions.push('Transaction remise à zéro');

    const message = actions.join(' • ');
    logger.debug(`🔄 Reset auto-match: ${message}`);

    // Updates UI
    const uiUpdates: Partial<TransactionBancaire> = {
      matched_entities: [],
      reconcilie: false,
      statut_reconciliation: 'non_verifie' as const,
      operation_id: undefined,
      evenement_id: undefined,
      code_comptable: undefined,
      categorie: undefined
    };

    return {
      success: true,
      message,
      actions,
      transactionUpdates: uiUpdates
    };

  } catch (error: any) {
    logger.error('❌ Erreur reset auto-match:', error);
    return {
      success: false,
      message: error.message || 'Erreur lors du reset'
    };
  }
}
