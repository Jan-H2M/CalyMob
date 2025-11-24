/**
 * Service centralisé pour nettoyer les liaisons orphelines
 *
 * Gère le nettoyage des références entre entités lorsqu'une entité est supprimée :
 * - Dépenses → Transactions (matched_entities)
 * - Événements → Transactions, Inscriptions, Dépenses
 * - Inscriptions → Transactions
 * - Transactions → Inscriptions (transaction_id)
 */

import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import {
  TransactionBancaire,
  DemandeRemboursement,
  Evenement,
  InscriptionEvenement,
  MatchedEntity
} from '@/types';

// Statistiques de nettoyage pour une seule entité
export interface CleanupStats {
  transactionsUpdated: number;
  inscriptionsUpdated: number;
  expensesUpdated: number;
  eventsUpdated: number;
  linksRemoved: number;
  entityType: string;
  entityId: string;
}

// Statistiques globales pour nettoyage complet
export interface GlobalCleanupStats {
  transactionsUpdated: number;
  inscriptionsUpdated: number;
  expensesUpdated: number;
  eventsUpdated: number;
  totalLinksRemoved: number;
  orphanedExpenses: number;
  orphanedEvents: number;
  orphanedInscriptions: number;
  orphanedMembers: number;
  processingTimeMs: number;
}

/**
 * Nettoie les liaisons orphelines après suppression d'une dépense
 */
export async function cleanAfterExpenseDelete(
  expenseId: string,
  clubId: string
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    transactionsUpdated: 0,
    inscriptionsUpdated: 0,
    expensesUpdated: 0,
    eventsUpdated: 0,
    linksRemoved: 0,
    entityType: 'expense',
    entityId: expenseId
  };

  try {
    // 1. Nettoyer matched_entities dans les transactions
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnapshot = await getDocs(transactionsRef);

    for (const txDoc of transactionsSnapshot.docs) {
      const tx = txDoc.data() as TransactionBancaire;

      // Vérifier si cette transaction référence la dépense
      const hasExpenseLink = tx.matched_entities?.some(
        e => (e.entity_type === 'expense' || e.entity_type === 'demand') && e.entity_id === expenseId
      );

      if (hasExpenseLink) {
        // Filtrer les matched_entities pour retirer cette dépense
        const updatedEntities = (tx.matched_entities || []).filter(
          e => !(e.entity_type === 'expense' || e.entity_type === 'demand') || e.entity_id !== expenseId
        );

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);

        // Si matched_entities devient vide, mettre reconcilie à false
        const updateData: any = {
          matched_entities: updatedEntities
        };

        if (updatedEntities.length === 0) {
          updateData.reconcilie = false;
        }

        await updateDoc(txRef, updateData);

        stats.transactionsUpdated++;
        stats.linksRemoved++;
      }

      // Vérifier le champ legacy expense_claim_id
      if (tx.expense_claim_id === expenseId) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);

        // Si la transaction n'a plus de matched_entities non plus, mettre reconcilie à false
        const hasOtherLinks = tx.matched_entities && tx.matched_entities.length > 0;
        const updateData: any = {
          expense_claim_id: null
        };

        if (!hasOtherLinks) {
          updateData.reconcilie = false;
        }

        await updateDoc(txRef, updateData);

        stats.transactionsUpdated++;
        stats.linksRemoved++;
      }
    }

    console.log(`✅ Nettoyage dépense ${expenseId}: ${stats.transactionsUpdated} transactions mises à jour`);
    return stats;
  } catch (error) {
    console.error('❌ Erreur nettoyage après suppression dépense:', error);
    throw error;
  }
}

/**
 * Nettoie les liaisons orphelines après suppression d'un événement
 * CASCADE: Supprime aussi toutes les inscriptions liées
 */
export async function cleanAfterEventDelete(
  eventId: string,
  clubId: string
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    transactionsUpdated: 0,
    inscriptionsUpdated: 0,
    expensesUpdated: 0,
    eventsUpdated: 0,
    linksRemoved: 0,
    entityType: 'event',
    entityId: eventId
  };

  try {
    // 1. Nettoyer matched_entities dans les transactions
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnapshot = await getDocs(transactionsRef);

    for (const txDoc of transactionsSnapshot.docs) {
      const tx = txDoc.data() as TransactionBancaire;

      const hasEventLink = tx.matched_entities?.some(
        e => e.entity_type === 'event' && e.entity_id === eventId
      );

      if (hasEventLink) {
        const updatedEntities = (tx.matched_entities || []).filter(
          e => e.entity_type !== 'event' || e.entity_id !== eventId
        );

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);

        // Si matched_entities devient vide, mettre reconcilie à false
        const updateData: any = {
          matched_entities: updatedEntities
        };

        if (updatedEntities.length === 0) {
          updateData.reconcilie = false;
        }

        await updateDoc(txRef, updateData);

        stats.transactionsUpdated++;
        stats.linksRemoved++;
      }

      // Nettoyer champ legacy evenement_id
      if (tx.evenement_id === eventId) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);

        // Si la transaction n'a plus de matched_entities non plus, mettre reconcilie à false
        const hasOtherLinks = tx.matched_entities && tx.matched_entities.length > 0;
        const updateData: any = {
          evenement_id: null
        };

        if (!hasOtherLinks) {
          updateData.reconcilie = false;
        }

        await updateDoc(txRef, updateData);

        stats.transactionsUpdated++;
        stats.linksRemoved++;
      }
    }

    // 2. Supprimer toutes les inscriptions liées (CASCADE)
    const inscriptionsRef = collection(db, 'clubs', clubId, 'inscriptions');
    const inscriptionsQuery = query(inscriptionsRef, where('evenement_id', '==', eventId));
    const inscriptionsSnapshot = await getDocs(inscriptionsQuery);

    for (const inscriptionDoc of inscriptionsSnapshot.docs) {
      await deleteDoc(inscriptionDoc.ref);
      stats.inscriptionsUpdated++;
    }

    // 3. Retirer evenement_id des dépenses
    const expensesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
    const expensesQuery = query(expensesRef, where('evenement_id', '==', eventId));
    const expensesSnapshot = await getDocs(expensesQuery);

    for (const expenseDoc of expensesSnapshot.docs) {
      await updateDoc(expenseDoc.ref, {
        evenement_id: null,
        evenement_titre: null
      });
      stats.expensesUpdated++;
    }

    console.log(`✅ Nettoyage événement ${eventId}: ${stats.transactionsUpdated} TX, ${stats.inscriptionsUpdated} inscriptions supprimées, ${stats.expensesUpdated} dépenses`);
    return stats;
  } catch (error) {
    console.error('❌ Erreur nettoyage après suppression événement:', error);
    throw error;
  }
}

/**
 * Nettoie les liaisons orphelines après suppression d'une inscription
 */
export async function cleanAfterInscriptionDelete(
  inscriptionId: string,
  clubId: string
): Promise<CleanupStats> {
  const stats: CleanupStats = {
    transactionsUpdated: 0,
    inscriptionsUpdated: 0,
    expensesUpdated: 0,
    eventsUpdated: 0,
    linksRemoved: 0,
    entityType: 'inscription',
    entityId: inscriptionId
  };

  try {
    // Nettoyer matched_entities dans les transactions
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnapshot = await getDocs(transactionsRef);

    for (const txDoc of transactionsSnapshot.docs) {
      const tx = txDoc.data() as TransactionBancaire;

      const hasInscriptionLink = tx.matched_entities?.some(
        e => e.entity_type === 'inscription' && e.entity_id === inscriptionId
      );

      if (hasInscriptionLink) {
        const updatedEntities = (tx.matched_entities || []).filter(
          e => e.entity_type !== 'inscription' || e.entity_id !== inscriptionId
        );

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);

        // Si matched_entities devient vide, mettre reconcilie à false
        const updateData: any = {
          matched_entities: updatedEntities
        };

        if (updatedEntities.length === 0) {
          updateData.reconcilie = false;
        }

        await updateDoc(txRef, updateData);

        stats.transactionsUpdated++;
        stats.linksRemoved++;
      }
    }

    console.log(`✅ Nettoyage inscription ${inscriptionId}: ${stats.transactionsUpdated} transactions mises à jour`);
    return stats;
  } catch (error) {
    console.error('❌ Erreur nettoyage après suppression inscription:', error);
    throw error;
  }
}

/**
 * FONCTION GLOBALE : Nettoie TOUTES les liaisons orphelines
 *
 * Utile pour :
 * - Tests et développement
 * - Nettoyage après imports/suppressions multiples
 * - Maintenance de la base de données
 */
export async function cleanAllOrphans(clubId: string): Promise<GlobalCleanupStats> {
  const startTime = Date.now();

  const stats: GlobalCleanupStats = {
    transactionsUpdated: 0,
    inscriptionsUpdated: 0,
    expensesUpdated: 0,
    eventsUpdated: 0,
    totalLinksRemoved: 0,
    orphanedExpenses: 0,
    orphanedEvents: 0,
    orphanedInscriptions: 0,
    orphanedMembers: 0,
    processingTimeMs: 0
  };

  try {
    console.log('🧹 Début du nettoyage global des liaisons orphelines...');

    // 1. Charger tous les IDs existants
    console.log('📥 Chargement des IDs existants...');

    // 🆕 MIGRATION: Load from new collections (operations, operation_participants)
    const [expensesSnapshot, eventsSnapshot, inscriptionsSnapshot, membersSnapshot] = await Promise.all([
      getDocs(collection(db, 'clubs', clubId, 'demandes_remboursement')),
      getDocs(collection(db, 'clubs', clubId, 'operations')),
      getDocs(collection(db, 'clubs', clubId, 'operation_participants')),
      getDocs(collection(db, 'clubs', clubId, 'membres'))
    ]);

    const existingExpenseIds = new Set(expensesSnapshot.docs.map(d => d.id));
    const existingEventIds = new Set(eventsSnapshot.docs.map(d => d.id));
    const existingInscriptionIds = new Set(inscriptionsSnapshot.docs.map(d => d.id));
    const existingMemberIds = new Set(membersSnapshot.docs.map(d => d.id));

    console.log(`✅ IDs chargés: ${existingExpenseIds.size} dépenses, ${existingEventIds.size} événements, ${existingInscriptionIds.size} inscriptions, ${existingMemberIds.size} membres`);

    // 2. Nettoyer les transactions
    console.log('🔍 Vérification des transactions...');
    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnapshot = await getDocs(transactionsRef);

    for (const txDoc of transactionsSnapshot.docs) {
      const tx = txDoc.data() as TransactionBancaire;
      let needsUpdate = false;
      const updates: any = {};

      // Nettoyer matched_entities
      if (tx.matched_entities && tx.matched_entities.length > 0) {
        const originalCount = tx.matched_entities.length;
        const cleanedEntities = tx.matched_entities.filter(entity => {
          // Vérifier si l'entité existe encore
          switch (entity.entity_type) {
            case 'expense':
            case 'demand':
              if (!existingExpenseIds.has(entity.entity_id)) {
                stats.orphanedExpenses++;
                stats.totalLinksRemoved++;
                return false;
              }
              break;
            case 'event':
              if (!existingEventIds.has(entity.entity_id)) {
                stats.orphanedEvents++;
                stats.totalLinksRemoved++;
                return false;
              }
              break;
            case 'inscription':
              if (!existingInscriptionIds.has(entity.entity_id)) {
                stats.orphanedInscriptions++;
                stats.totalLinksRemoved++;
                return false;
              }
              break;
            case 'member':
              if (!existingMemberIds.has(entity.entity_id)) {
                stats.orphanedMembers++;
                stats.totalLinksRemoved++;
                return false;
              }
              break;
          }
          return true;
        });

        if (cleanedEntities.length !== originalCount) {
          updates.matched_entities = cleanedEntities;
          needsUpdate = true;
        }
      }

      // Nettoyer champs legacy
      if (tx.expense_claim_id && !existingExpenseIds.has(tx.expense_claim_id)) {
        updates.expense_claim_id = null;
        stats.orphanedExpenses++;
        stats.totalLinksRemoved++;
        needsUpdate = true;
      }

      if (tx.evenement_id && !existingEventIds.has(tx.evenement_id)) {
        updates.evenement_id = null;
        stats.orphanedEvents++;
        stats.totalLinksRemoved++;
        needsUpdate = true;
      }

      // Appliquer les mises à jour si nécessaire
      if (needsUpdate) {
        // Si matched_entities devient vide ET qu'il n'y a plus de champs legacy, mettre reconcilie à false
        const finalMatchedEntities = updates.matched_entities !== undefined ? updates.matched_entities : tx.matched_entities;
        const finalExpenseClaimId = updates.expense_claim_id !== undefined ? updates.expense_claim_id : tx.expense_claim_id;
        const finalEvenementId = updates.evenement_id !== undefined ? updates.evenement_id : tx.evenement_id;

        const hasNoLinks = (!finalMatchedEntities || finalMatchedEntities.length === 0) &&
                          !finalExpenseClaimId &&
                          !finalEvenementId;

        if (hasNoLinks) {
          updates.reconcilie = false;
        }

        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);
        await updateDoc(txRef, updates);
        stats.transactionsUpdated++;
      }
    }

    // 3. Nettoyer les inscriptions (transaction_id orphelin)
    console.log('🔍 Vérification des inscriptions...');
    const allTransactionIds = new Set(transactionsSnapshot.docs.map(d => d.id));

    for (const inscriptionDoc of inscriptionsSnapshot.docs) {
      const inscription = inscriptionDoc.data() as InscriptionEvenement;

      if (inscription.transaction_id && !allTransactionIds.has(inscription.transaction_id)) {
        await updateDoc(inscriptionDoc.ref, {
          transaction_id: null,
          transaction_montant: null
        });
        stats.inscriptionsUpdated++;
        stats.totalLinksRemoved++;
      }
    }

    // 4. Nettoyer les dépenses (evenement_id orphelin)
    console.log('🔍 Vérification des dépenses...');
    for (const expenseDoc of expensesSnapshot.docs) {
      const expense = expenseDoc.data() as DemandeRemboursement;

      if (expense.evenement_id && !existingEventIds.has(expense.evenement_id)) {
        await updateDoc(expenseDoc.ref, {
          evenement_id: null,
          evenement_titre: null
        });
        stats.expensesUpdated++;
        stats.totalLinksRemoved++;
      }
    }

    stats.processingTimeMs = Date.now() - startTime;

    console.log('✅ Nettoyage global terminé!');
    console.log(`   📊 Statistiques:`);
    console.log(`   • ${stats.transactionsUpdated} transactions mises à jour`);
    console.log(`   • ${stats.inscriptionsUpdated} inscriptions mises à jour`);
    console.log(`   • ${stats.expensesUpdated} dépenses mises à jour`);
    console.log(`   • ${stats.totalLinksRemoved} liaisons orphelines supprimées`);
    console.log(`   • Temps: ${stats.processingTimeMs}ms`);

    return stats;
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage global:', error);
    throw error;
  }
}

// Export par défaut du service complet
/**
 * Répare tous les statuts de réconciliation en les recalculant
 * à partir de l'état réel des liaisons
 */
export async function repairReconciliationStatus(clubId: string): Promise<{
  transactionsChecked: number;
  transactionsFixed: number;
  processingTimeMs: number;
}> {
  const startTime = performance.now();
  const stats = {
    transactionsChecked: 0,
    transactionsFixed: 0,
    processingTimeMs: 0
  };

  try {
    console.log('🔧 Réparation des statuts de réconciliation...');

    const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
    const transactionsSnapshot = await getDocs(transactionsRef);

    for (const txDoc of transactionsSnapshot.docs) {
      const tx = txDoc.data() as TransactionBancaire;
      stats.transactionsChecked++;

      // Calculer le statut de réconciliation réel
      const hasMatchedEntities = tx.matched_entities && tx.matched_entities.length > 0;
      const hasLegacyLinks = !!tx.expense_claim_id || !!tx.evenement_id;
      const shouldBeReconciled = hasMatchedEntities || hasLegacyLinks;

      // Si le statut ne correspond pas, corriger
      if (tx.reconcilie !== shouldBeReconciled) {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', txDoc.id);
        await updateDoc(txRef, {
          reconcilie: shouldBeReconciled
        });

        stats.transactionsFixed++;
        console.log(`✅ Transaction ${txDoc.id}: reconcilie ${tx.reconcilie} → ${shouldBeReconciled}`);
      }
    }

    stats.processingTimeMs = Math.round(performance.now() - startTime);
    console.log(`✅ Réparation terminée: ${stats.transactionsFixed}/${stats.transactionsChecked} transactions corrigées en ${stats.processingTimeMs}ms`);

    return stats;
  } catch (error) {
    console.error('❌ Erreur lors de la réparation des statuts:', error);
    throw error;
  }
}

export const linkCleanupService = {
  cleanAfterExpenseDelete,
  cleanAfterEventDelete,
  cleanAfterInscriptionDelete,
  cleanAllOrphans,
  repairReconciliationStatus
};
