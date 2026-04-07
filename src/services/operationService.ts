import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  limit
} from 'firebase/firestore';
import { Operation, TypeOperation, EventCategory } from '@/types';
import { logger } from '@/utils/logger';

/**
 * Service de gestion des opérations (événements, cotisations, dons, ventes, subventions)
 */
export class OperationService {
  /**
   * Créer une nouvelle opération
   */
  static async createOperation(
    clubId: string,
    operation: Omit<Operation, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');

    // Ensure fiscal_year_id is present (required by Firestore Rules)
    if (!operation.fiscal_year_id) {
      throw new Error('fiscal_year_id is required to create an operation');
    }

    const docRef = await addDoc(operationsRef, {
      ...operation,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    return docRef.id;
  }

  /**
   * Mettre à jour une opération
   * @param auditInfo Optional audit information for field tracking
   */
  static async updateOperation(
    clubId: string,
    operationId: string,
    updates: Partial<Operation>,
    auditInfo?: {
      userId: string;
      userName: string;
      currentOperation?: Operation;
      fieldsToAudit?: string[];
    }
  ): Promise<void> {
    const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);

    // Build the update object
    const firestoreUpdates: any = {
      ...updates,
      updated_at: serverTimestamp()
    };

    // ✅ Add field audit trail if audit info provided
    if (auditInfo && auditInfo.currentOperation) {
      const criticalFields = auditInfo.fieldsToAudit || ['montant_prevu', 'statut', 'date_debut', 'date_fin', 'titre'];
      const auditEntries: any[] = [];

      for (const field of criticalFields) {
        const oldValue = auditInfo.currentOperation[field as keyof Operation];
        const newValue = updates[field as keyof Operation];

        if (field in updates && oldValue !== newValue) {
          auditEntries.push({
            field,
            old_value: oldValue,
            new_value: newValue,
            changed_by: auditInfo.userId,
            changed_by_name: auditInfo.userName,
            changed_at: new Date()
          });
        }
      }

      if (auditEntries.length > 0) {
        firestoreUpdates.field_history = [
          ...(auditInfo.currentOperation.field_history || []),
          ...auditEntries
        ];
        firestoreUpdates.fields_modified = true;
      }
    }

    await updateDoc(operationRef, firestoreUpdates);

    // Auto-sync: propageer titel wijziging naar gedenormaliseerde documenten
    if (
      auditInfo?.currentOperation &&
      updates.titre &&
      updates.titre !== auditInfo.currentOperation.titre
    ) {
      try {
        const { DenormalizationSyncService } = await import('@/services/denormalizationSyncService');
        const result = await DenormalizationSyncService.syncOperationTitre(clubId, operationId, updates.titre);
        logger.debug(`[OperationService] Titre sync: ${result.message}`);
      } catch (syncError) {
        logger.warn(`[OperationService] Titre sync failed (non-blocking):`, syncError);
      }
    }
  }

  /**
   * Supprimer une opération
   */
  static async deleteOperation(clubId: string, operationId: string): Promise<void> {
    const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);
    await deleteDoc(operationRef);
  }

  /**
   * Récupérer une opération par ID
   */
  static async getOperationById(clubId: string, operationId: string): Promise<Operation | null> {
    const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);
    const docSnap = await getDoc(operationRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      ...data,
      id: docSnap.id,
      created_at: data.created_at?.toDate() || new Date(),
      updated_at: data.updated_at?.toDate() || new Date(),
      date_debut: data.date_debut?.toDate(),
      date_fin: data.date_fin?.toDate(),
      periode_debut: data.periode_debut?.toDate(),
      periode_fin: data.periode_fin?.toDate()
    } as Operation;
  }

  /**
   * Récupérer toutes les opérations
   */
  static async getAllOperations(clubId: string): Promise<Operation[]> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');
    const q = query(operationsRef, orderBy('created_at', 'desc'));

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date(),
        date_debut: data.date_debut?.toDate(),
        date_fin: data.date_fin?.toDate(),
        periode_debut: data.periode_debut?.toDate(),
        periode_fin: data.periode_fin?.toDate()
      } as Operation;
    });
  }

  /**
   * Récupérer opérations par type
   */
  static async getOperationsByType(
    clubId: string,
    type: TypeOperation
  ): Promise<Operation[]> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');
    const q = query(
      operationsRef,
      where('type', '==', type),
      orderBy('created_at', 'desc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date(),
        date_debut: data.date_debut?.toDate(),
        date_fin: data.date_fin?.toDate(),
        periode_debut: data.periode_debut?.toDate(),
        periode_fin: data.periode_fin?.toDate()
      } as Operation;
    });
  }

  /**
   * Récupérer événements (type='evenement')
   * Helper pour compatibilité avec ancien code
   */
  static async getEvenements(clubId: string): Promise<Operation[]> {
    return this.getOperationsByType(clubId, 'evenement');
  }

  /**
   * Récupérer cotisations
   */
  static async getCotisations(clubId: string): Promise<Operation[]> {
    return this.getOperationsByType(clubId, 'cotisation');
  }

  /**
   * Récupérer opérations par statut
   */
  static async getOperationsByStatus(
    clubId: string,
    statut: 'brouillon' | 'ouvert' | 'ferme' | 'annule'
  ): Promise<Operation[]> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');
    const q = query(
      operationsRef,
      where('statut', '==', statut),
      orderBy('created_at', 'desc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date(),
        date_debut: data.date_debut?.toDate(),
        date_fin: data.date_fin?.toDate(),
        periode_debut: data.periode_debut?.toDate(),
        periode_fin: data.periode_fin?.toDate()
      } as Operation;
    });
  }

  /**
   * Récupérer opérations pour une période
   */
  static async getOperationsForPeriod(
    clubId: string,
    startDate: Date,
    endDate: Date,
    type?: TypeOperation
  ): Promise<Operation[]> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');

    let q;
    if (type) {
      q = query(
        operationsRef,
        where('type', '==', type),
        where('date_debut', '>=', Timestamp.fromDate(startDate)),
        where('date_debut', '<=', Timestamp.fromDate(endDate)),
        orderBy('date_debut', 'asc')
      );
    } else {
      q = query(
        operationsRef,
        where('date_debut', '>=', Timestamp.fromDate(startDate)),
        where('date_debut', '<=', Timestamp.fromDate(endDate)),
        orderBy('date_debut', 'asc')
      );
    }

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        created_at: data.created_at?.toDate() || new Date(),
        updated_at: data.updated_at?.toDate() || new Date(),
        date_debut: data.date_debut?.toDate(),
        date_fin: data.date_fin?.toDate(),
        periode_debut: data.periode_debut?.toDate(),
        periode_fin: data.periode_fin?.toDate()
      } as Operation;
    });
  }

  /**
   * Valider une opération selon son type
   */
  static validateOperation(operation: Partial<Operation>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Champs communs
    if (!operation.type) errors.push('Type obligatoire');
    if (!operation.titre) errors.push('Titre obligatoire');
    if (!operation.statut) errors.push('Statut obligatoire');
    if (!operation.organisateur_id) errors.push('Organisateur obligatoire');

    // Validation spécifique événements
    if (operation.type === 'evenement') {
      if (!operation.date_debut) errors.push('Date début obligatoire pour événements');
      if (!operation.date_fin) errors.push('Date fin obligatoire pour événements');
      if (operation.date_debut && operation.date_fin && operation.date_debut > operation.date_fin) {
        errors.push('Date début doit être avant date fin');
      }
    }

    // Validation spécifique cotisations
    if (operation.type === 'cotisation') {
      if (!operation.periode_debut) errors.push('Période début obligatoire pour cotisations');
      if (!operation.periode_fin) errors.push('Période fin obligatoire pour cotisations');
      if (operation.periode_debut && operation.periode_fin && operation.periode_debut > operation.periode_fin) {
        errors.push('Période début doit être avant période fin');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert a sequential number to 4 base-26 letters (A=0, B=1, ..., Z=25)
   * Example: 0 → AAAA, 1 → AAAB, 6 → AAAG, 26 → AABA
   */
  static numberToLetterCode(n: number): string {
    const d3 = Math.floor(n / (26 * 26 * 26)) % 26;
    const d2 = Math.floor(n / (26 * 26)) % 26;
    const d1 = Math.floor(n / 26) % 26;
    const d0 = n % 26;
    return String.fromCharCode(65 + d3)
      + String.fromCharCode(65 + d2)
      + String.fromCharCode(65 + d1)
      + String.fromCharCode(65 + d0);
  }

  /**
   * Decode 4 base-26 letters back to a sequential number
   * Example: AAAB → 1, AAAG → 6, AABA → 26
   */
  static letterCodeToNumber(code: string): number {
    return (code.charCodeAt(0) - 65) * 26 * 26 * 26
      + (code.charCodeAt(1) - 65) * 26 * 26
      + (code.charCodeAt(2) - 65) * 26
      + (code.charCodeAt(3) - 65);
  }

  /**
   * Generate a unique event number for bank reconciliation
   * Format: PXXXX for dive events (plongee), SXXXX for other events (sortie)
   * Uses base-26 letter encoding (no digits) for banking compatibility
   *
   * Examples: PAAAB (dive #1), PAAAG (dive #6), SAAAE (sortie #4)
   * Letter codes sort alphabetically and are deterministic/reversible.
   *
   * @param clubId - Club ID
   * @param isDiveEvent - True if this is a dive event (plongee), false for other events (sortie)
   * @returns A unique 5-letter event code starting with P (dive) or S (other)
   */
  static async generateEventNumber(clubId: string, isDiveEvent: boolean): Promise<string> {
    const prefix = isDiveEvent ? 'P' : 'S';

    // Query all operations with event_number in this prefix range
    // Letter codes sort alphabetically: PAAAA < PAAAB < ... < PZZZZ
    const operationsRef = collection(db, 'clubs', clubId, 'operations');
    const q = query(
      operationsRef,
      where('event_number', '>=', prefix + 'AAAA'),
      where('event_number', '<=', prefix + 'ZZZZ'),
      orderBy('event_number', 'desc'),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // First event of this type - start at 1 (AAAB)
      return prefix + this.numberToLetterCode(1);
    }

    // Get the highest existing code and increment
    const lastEventNumber = snapshot.docs[0].data().event_number as string;
    const lastNumber = this.letterCodeToNumber(lastEventNumber.substring(1));
    const nextNumber = lastNumber + 1;

    return prefix + this.numberToLetterCode(nextNumber);
  }

  /**
   * Check if an operation is a dive event based on event_category
   */
  static isDiveEvent(operation: Partial<Operation>): boolean {
    return operation.type === 'evenement' && operation.event_category === 'plongee';
  }
}
