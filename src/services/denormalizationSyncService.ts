/**
 * DenormalizationSyncService - Service voor het synchroniseren van gedenormaliseerde velden
 *
 * Dit service behandelt de propagatie van naamswijzigingen naar alle documenten
 * die een gecachte kopie van die naam bewaren.
 *
 * Twee use cases:
 * 1. Code comptable label wijziging → update `code_comptable_label` in demandes_remboursement
 * 2. Operatie titel wijziging → update `operation_titre`, `evenement_titre`, `entity_name`
 *    in demandes, inscriptions, transactions en messages
 *
 * Wordt aangeroepen:
 * - Automatisch vanuit AccountCodeService.saveCode() en OperationService.updateOperation()
 * - Manueel via sync-knoppen in Paramètres Généraux
 */

import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore';
import { logger } from '@/utils/logger';
import { AccountCodeService } from '@/services/accountCodeService';
import { OperationService } from '@/services/operationService';

export interface SyncResult {
  success: boolean;
  updatedCount: number;
  errors: string[];
  message: string;
  // Detail counts for operation titre sync
  updatedDemandes?: number;
  updatedInscriptions?: number;
  updatedTransactions?: number;
  updatedMessages?: number;
  totalProcessed?: number;
}

export class DenormalizationSyncService {

  // ──────────────────────────────────────────────────
  // Code Comptable Label Sync
  // ──────────────────────────────────────────────────

  /**
   * Sync de label van één code comptable naar alle demandes_remboursement
   * die dat code gebruiken.
   */
  static async syncCodeComptableLabel(
    clubId: string,
    code: string,
    newLabel: string
  ): Promise<SyncResult> {
    const errors: string[] = [];
    let updatedCount = 0;

    try {
      // Query demandes_remboursement met dit code comptable
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const q = query(demandesRef, where('code_comptable', '==', code));
      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        try {
          const currentLabel = docSnap.data().code_comptable_label;
          if (currentLabel !== newLabel) {
            await updateDoc(docSnap.ref, {
              code_comptable_label: newLabel,
              updated_at: serverTimestamp()
            });
            updatedCount++;
          }
        } catch (error) {
          const msg = `Erreur sync demande ${docSnap.id}: ${error}`;
          logger.warn(`[DenormalizationSync] ${msg}`);
          errors.push(msg);
        }
      }

      logger.debug(
        `[DenormalizationSync] syncCodeComptableLabel: ${updatedCount} demandes mises à jour pour code ${code}`
      );

      return {
        success: errors.length === 0,
        updatedCount,
        errors,
        message: `${updatedCount} demande(s) mise(s) à jour pour le code ${code}`
      };
    } catch (error) {
      const msg = `Erreur lors de la synchronisation du code ${code}: ${error}`;
      logger.error(`[DenormalizationSync] ${msg}`);
      return { success: false, updatedCount: 0, errors: [msg], message: msg };
    }
  }

  // ──────────────────────────────────────────────────
  // Operation Titre Sync
  // ──────────────────────────────────────────────────

  /**
   * Sync de titel van één operatie naar alle gelinkte documenten:
   * - demandes_remboursement (operation_titre + evenement_titre)
   * - inscriptions_evenements (evenement_titre)
   * - transactions_bancaires (matched_entities[].entity_name)
   * - operations/{id}/messages (operation_titre)
   */
  static async syncOperationTitre(
    clubId: string,
    operationId: string,
    newTitre: string
  ): Promise<SyncResult> {
    const errors: string[] = [];
    let updatedDemandes = 0;
    let updatedInscriptions = 0;
    let updatedTransactions = 0;
    let updatedMessages = 0;

    // 1. Update demandes_remboursement
    try {
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const qDemandes = query(demandesRef, where('operation_id', '==', operationId));
      const demandesSnap = await getDocs(qDemandes);

      for (const docSnap of demandesSnap.docs) {
        try {
          await updateDoc(docSnap.ref, {
            operation_titre: newTitre,
            evenement_titre: newTitre, // legacy field
            updated_at: serverTimestamp()
          });
          updatedDemandes++;
        } catch (error) {
          errors.push(`Erreur sync demande ${docSnap.id}: ${error}`);
        }
      }

      // Also check demandes linked via legacy evenement_id field
      const qDemandesLegacy = query(demandesRef, where('evenement_id', '==', operationId));
      const demandesLegacySnap = await getDocs(qDemandesLegacy);
      const alreadyUpdated = new Set(demandesSnap.docs.map(d => d.id));

      for (const docSnap of demandesLegacySnap.docs) {
        if (alreadyUpdated.has(docSnap.id)) continue; // Skip already updated
        try {
          await updateDoc(docSnap.ref, {
            operation_titre: newTitre,
            evenement_titre: newTitre,
            updated_at: serverTimestamp()
          });
          updatedDemandes++;
        } catch (error) {
          errors.push(`Erreur sync demande legacy ${docSnap.id}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Erreur query demandes: ${error}`);
    }

    // 2. Update inscriptions_evenements
    try {
      const inscriptionsRef = collection(db, 'clubs', clubId, 'inscriptions_evenements');
      const qInscriptions = query(inscriptionsRef, where('evenement_id', '==', operationId));
      const inscriptionsSnap = await getDocs(qInscriptions);

      for (const docSnap of inscriptionsSnap.docs) {
        try {
          await updateDoc(docSnap.ref, {
            evenement_titre: newTitre,
            updated_at: serverTimestamp()
          });
          updatedInscriptions++;
        } catch (error) {
          errors.push(`Erreur sync inscription ${docSnap.id}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Erreur query inscriptions: ${error}`);
    }

    // 3. Update matched_entities in transactions_bancaires
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      // Firestore kan niet direct filteren op array element properties,
      // dus we moeten alle transacties met matched_entities doorzoeken.
      // We filteren op transacties die reconcilie=true hebben (die hebben matched_entities)
      const qTransactions = query(transactionsRef, where('reconcilie', '==', true));
      const transactionsSnap = await getDocs(qTransactions);

      for (const docSnap of transactionsSnap.docs) {
        try {
          const data = docSnap.data();
          const matchedEntities = data.matched_entities as any[] | undefined;

          if (!matchedEntities || matchedEntities.length === 0) continue;

          // Check if any matched entity references this operation
          let needsUpdate = false;
          const updatedEntities = matchedEntities.map((entity: any) => {
            if (entity.entity_id === operationId && entity.entity_name !== newTitre) {
              needsUpdate = true;
              return { ...entity, entity_name: newTitre };
            }
            return entity;
          });

          if (needsUpdate) {
            await updateDoc(docSnap.ref, {
              matched_entities: updatedEntities,
              updated_at: serverTimestamp()
            });
            updatedTransactions++;
          }
        } catch (error) {
          errors.push(`Erreur sync transaction ${docSnap.id}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Erreur query transactions: ${error}`);
    }

    // 4. Update messages subcollection
    try {
      const messagesRef = collection(db, 'clubs', clubId, 'operations', operationId, 'messages');
      const messagesSnap = await getDocs(messagesRef);

      for (const docSnap of messagesSnap.docs) {
        try {
          const data = docSnap.data();
          if (data.operation_titre !== newTitre) {
            await updateDoc(docSnap.ref, {
              operation_titre: newTitre
            });
            updatedMessages++;
          }
        } catch (error) {
          errors.push(`Erreur sync message ${docSnap.id}: ${error}`);
        }
      }
    } catch (error) {
      errors.push(`Erreur query messages: ${error}`);
    }

    const totalUpdated = updatedDemandes + updatedInscriptions + updatedTransactions + updatedMessages;

    logger.debug(
      `[DenormalizationSync] syncOperationTitre ${operationId}: ` +
      `${updatedDemandes} demandes, ${updatedInscriptions} inscriptions, ` +
      `${updatedTransactions} transactions, ${updatedMessages} messages`
    );

    return {
      success: errors.length === 0,
      updatedCount: totalUpdated,
      updatedDemandes,
      updatedInscriptions,
      updatedTransactions,
      updatedMessages,
      errors,
      message: `${totalUpdated} document(s) mis à jour pour l'opération`
    };
  }

  // ──────────────────────────────────────────────────
  // Bulk Sync (voor manuele knoppen)
  // ──────────────────────────────────────────────────

  /**
   * Sync ALLE code comptable labels naar demandes_remboursement.
   * Doorloopt elke demande en controleert of de gecachte label klopt.
   */
  static async syncAllCodeComptableLabels(
    clubId: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<SyncResult> {
    const errors: string[] = [];
    let updatedCount = 0;

    try {
      // Haal alle demandes op die een code_comptable hebben
      const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const snapshot = await getDocs(demandesRef);

      const demandesWithCode = snapshot.docs.filter(d => d.data().code_comptable);
      const total = demandesWithCode.length;

      for (let i = 0; i < demandesWithCode.length; i++) {
        const docSnap = demandesWithCode[i];
        const data = docSnap.data();

        try {
          const code = data.code_comptable;
          const currentLabel = data.code_comptable_label || '';
          const correctLabel = AccountCodeService.getByCode(code)?.label || '';

          if (currentLabel !== correctLabel && correctLabel) {
            await updateDoc(docSnap.ref, {
              code_comptable_label: correctLabel,
              updated_at: serverTimestamp()
            });
            updatedCount++;
          }
        } catch (error) {
          errors.push(`Erreur sync demande ${docSnap.id}: ${error}`);
        }

        if (onProgress) {
          onProgress(i + 1, total);
        }
      }

      return {
        success: errors.length === 0,
        updatedCount,
        totalProcessed: total,
        errors,
        message: `${updatedCount} demande(s) mise(s) à jour sur ${total} vérifiée(s)`
      };
    } catch (error) {
      const msg = `Erreur lors de la synchronisation globale des codes: ${error}`;
      logger.error(`[DenormalizationSync] ${msg}`);
      return { success: false, updatedCount: 0, errors: [msg], message: msg };
    }
  }

  /**
   * Sync ALLE operatie titels naar gelinkte documenten.
   * Doorloopt elke operatie en synchroniseert de titel overal.
   */
  static async syncAllOperationTitres(
    clubId: string,
    onProgress?: (current: number, total: number) => void
  ): Promise<SyncResult> {
    const errors: string[] = [];
    let totalDemandes = 0;
    let totalInscriptions = 0;
    let totalTransactions = 0;
    let totalMessages = 0;

    try {
      // Haal alle operaties op
      const operations = await OperationService.getAllOperations(clubId);
      const total = operations.length;

      for (let i = 0; i < operations.length; i++) {
        const operation = operations[i];

        try {
          const result = await this.syncOperationTitre(clubId, operation.id, operation.titre);

          totalDemandes += result.updatedDemandes || 0;
          totalInscriptions += result.updatedInscriptions || 0;
          totalTransactions += result.updatedTransactions || 0;
          totalMessages += result.updatedMessages || 0;

          if (result.errors.length > 0) {
            errors.push(...result.errors);
          }
        } catch (error) {
          errors.push(`Erreur sync opération ${operation.id}: ${error}`);
        }

        if (onProgress) {
          onProgress(i + 1, total);
        }
      }

      const totalUpdated = totalDemandes + totalInscriptions + totalTransactions + totalMessages;

      return {
        success: errors.length === 0,
        updatedCount: totalUpdated,
        updatedDemandes: totalDemandes,
        updatedInscriptions: totalInscriptions,
        updatedTransactions: totalTransactions,
        updatedMessages: totalMessages,
        totalProcessed: total,
        errors,
        message: `${totalUpdated} document(s) mis à jour sur ${total} opération(s) vérifiée(s)`
      };
    } catch (error) {
      const msg = `Erreur lors de la synchronisation globale des opérations: ${error}`;
      logger.error(`[DenormalizationSync] ${msg}`);
      return {
        success: false,
        updatedCount: 0,
        updatedDemandes: 0,
        updatedInscriptions: 0,
        updatedTransactions: 0,
        updatedMessages: 0,
        errors: [msg],
        message: msg
      };
    }
  }
}
