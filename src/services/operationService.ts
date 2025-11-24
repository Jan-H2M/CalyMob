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
  Timestamp
} from 'firebase/firestore';
import { Operation, TypeOperation } from '@/types';

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
   */
  static async updateOperation(
    clubId: string,
    operationId: string,
    updates: Partial<Operation>
  ): Promise<void> {
    const operationRef = doc(db, 'clubs', clubId, 'operations', operationId);

    await updateDoc(operationRef, {
      ...updates,
      updated_at: serverTimestamp()
    });
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
}
