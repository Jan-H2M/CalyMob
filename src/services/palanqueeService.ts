import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { PalanqueeAssignments } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Service voor Palanquée Assignments
 *
 * Firestore path: clubs/{clubId}/operations/{operationId}/palanquees/assignments
 * Eén document per operatie met alle palanquée-toewijzingen.
 */

const PALANQUEES_DOC_ID = 'assignments';

function getPalanqueesDocRef(clubId: string, operationId: string) {
  return doc(db, 'clubs', clubId, 'operations', operationId, 'palanquees', PALANQUEES_DOC_ID);
}

/**
 * Haal palanquée assignments op voor een operatie.
 * Geeft null terug als er nog geen toewijzingen bestaan.
 */
export async function getPalanqueeAssignments(
  clubId: string,
  operationId: string
): Promise<PalanqueeAssignments | null> {
  try {
    const docRef = getPalanqueesDocRef(clubId, operationId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      palanquees: data.palanquees || [],
      updated_at: data.updated_at?.toDate?.() || undefined,
      updated_by: data.updated_by || undefined,
    };
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permissions')) {
      logger.warn('Palanquée assignments: accès refusé (règles non déployées ?)');
    } else {
      logger.error('Erreur lors du chargement des palanquées:', error);
    }
    throw error;
  }
}

/**
 * Sla palanquée assignments op voor een operatie.
 * Overschrijft het hele document (merge: false) omdat we altijd de volledige staat opslaan.
 */
export async function savePalanqueeAssignments(
  clubId: string,
  operationId: string,
  assignments: PalanqueeAssignments,
  userId: string
): Promise<void> {
  try {
    const docRef = getPalanqueesDocRef(clubId, operationId);
    await setDoc(docRef, {
      palanquees: assignments.palanquees,
      updated_at: serverTimestamp(),
      updated_by: userId,
    });
    logger.info(`Palanquées enregistrées pour l'opération ${operationId}`);
  } catch (error: any) {
    if (error?.code === 'permission-denied' || error?.message?.includes('permissions')) {
      logger.warn('Enregistrement des palanquées: accès refusé (règles non déployées ?)');
    } else {
      logger.error('Erreur lors de l\'enregistrement des palanquées:', error);
    }
    throw error;
  }
}
