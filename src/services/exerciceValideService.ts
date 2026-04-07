import { logger } from '@/utils/logger';
/**
 * Service pour gérer les exercices validés par membre
 * Collection: /clubs/{clubId}/members/{memberId}/exercices_valides/{exerciceValideId}
 */

import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExerciceValide, ExerciceValideCreate, ExerciceValideUpdate } from '@/types/exerciceValide.types';

const COLLECTION_NAME = 'exercices_valides';

/**
 * Convertit un document Firestore en ExerciceValide
 */
function docToExerciceValide(doc: any): ExerciceValide {
  const data = doc.data();
  return {
    id: doc.id,
    exercice_id: data.exercice_id,
    exercice_code: data.exercice_code,
    exercice_description: data.exercice_description,
    exercice_niveau: data.exercice_niveau,
    exercice_specialite: data.exercice_specialite,
    date_validation: data.date_validation?.toDate?.() || new Date(data.date_validation),
    moniteur_nom: data.moniteur_nom,
    moniteur_id: data.moniteur_id,
    notes: data.notes,
    lieu: data.lieu,
    created_at: data.created_at?.toDate?.() || new Date(data.created_at),
    updated_at: data.updated_at?.toDate?.() || new Date(data.updated_at),
    created_by: data.created_by
  };
}

export const exerciceValideService = {
  /**
   * Récupère tous les exercices validés pour un membre
   * Triés par date de validation (plus récent en premier)
   */
  async getExercicesValides(clubId: string, memberId: string): Promise<ExerciceValide[]> {
    try {
      const exercicesRef = collection(db, 'clubs', clubId, 'members', memberId, COLLECTION_NAME);
      const q = query(exercicesRef, orderBy('date_validation', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(docToExerciceValide);
    } catch (error) {
      logger.error('Erreur lors de la récupération des exercices validés:', error);
      return [];
    }
  },

  /**
   * Ajoute un exercice validé pour un membre
   */
  async addExerciceValide(
    clubId: string,
    memberId: string,
    data: ExerciceValideCreate
  ): Promise<string> {
    try {
      const exercicesRef = collection(db, 'clubs', clubId, 'members', memberId, COLLECTION_NAME);

      const docData = {
        ...data,
        date_validation: data.date_validation instanceof Date
          ? Timestamp.fromDate(data.date_validation)
          : data.date_validation,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now()
      };

      const docRef = await addDoc(exercicesRef, docData);
      return docRef.id;
    } catch (error) {
      logger.error('Erreur lors de l\'ajout de l\'exercice validé:', error);
      throw error;
    }
  },

  /**
   * Met à jour un exercice validé
   */
  async updateExerciceValide(
    clubId: string,
    memberId: string,
    exerciceValideId: string,
    data: ExerciceValideUpdate
  ): Promise<void> {
    try {
      const docRef = doc(db, 'clubs', clubId, 'members', memberId, COLLECTION_NAME, exerciceValideId);

      const updateData: any = {
        ...data,
        updated_at: Timestamp.now()
      };

      // Convertir la date si présente
      if (data.date_validation instanceof Date) {
        updateData.date_validation = Timestamp.fromDate(data.date_validation);
      }

      await updateDoc(docRef, updateData);
    } catch (error) {
      logger.error('Erreur lors de la mise à jour de l\'exercice validé:', error);
      throw error;
    }
  },

  /**
   * Supprime un exercice validé
   */
  async deleteExerciceValide(
    clubId: string,
    memberId: string,
    exerciceValideId: string
  ): Promise<void> {
    try {
      const docRef = doc(db, 'clubs', clubId, 'members', memberId, COLLECTION_NAME, exerciceValideId);
      await deleteDoc(docRef);
    } catch (error) {
      logger.error('Erreur lors de la suppression de l\'exercice validé:', error);
      throw error;
    }
  },

  /**
   * Compte le nombre d'exercices validés pour un membre
   */
  async countExercicesValides(clubId: string, memberId: string): Promise<number> {
    try {
      const exercicesRef = collection(db, 'clubs', clubId, 'members', memberId, COLLECTION_NAME);
      const snapshot = await getDocs(exercicesRef);
      return snapshot.size;
    } catch (error) {
      logger.error('Erreur lors du comptage des exercices validés:', error);
      return 0;
    }
  }
};
