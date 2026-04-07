import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ExerciceLIFRAS, NiveauLIFRAS } from '@/types/lifras.types';
import { logger } from '@/utils/logger';

const COLLECTION_NAME = 'exercices_lifras';

export const lifrasService = {
  // Récupérer tous les exercices
  async getAllExercices(clubId: string): Promise<ExerciceLIFRAS[]> {
    try {
      const exercicesRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
      const snapshot = await getDocs(exercicesRef);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        created_at: doc.data().created_at?.toDate(),
        updated_at: doc.data().updated_at?.toDate()
      } as ExerciceLIFRAS));
    } catch (error) {
      logger.error('Erreur lors de la récupération des exercices:', error);
      return [];
    }
  },

  // Récupérer les exercices par niveau
  // Loads all exercises and filters client-side to avoid composite index requirements
  // and to handle both 'P3' and '3' format stored in Firestore
  async getExercicesByNiveau(clubId: string, niveau: NiveauLIFRAS): Promise<ExerciceLIFRAS[]> {
    try {
      const allExercices = await this.getAllExercices(clubId);

      // Filter for the requested niveau + TN (Tous Niveaux) exercises
      const filtered = allExercices.filter(ex =>
        ex.niveau === niveau || ex.niveau === 'TN'
      );

      // Sort by code for consistent display
      filtered.sort((a, b) => a.code.localeCompare(b.code));

      return filtered;
    } catch (error) {
      logger.error(`Erreur lors de la récupération des exercices pour le niveau ${niveau}:`, error);
      return [];
    }
  },

  // Créer ou mettre à jour un exercice
  async saveExercice(clubId: string, exercice: Omit<ExerciceLIFRAS, 'id'>, exerciceId?: string): Promise<string> {
    try {
      const id = exerciceId || doc(collection(db, 'clubs', clubId, COLLECTION_NAME)).id;
      const exerciceRef = doc(db, 'clubs', clubId, COLLECTION_NAME, id);

      // Filter out undefined values (Firestore rejects them)
      const data: Record<string, any> = {
        code: exercice.code,
        niveau: exercice.niveau,
        description: exercice.description,
        updated_at: new Date(),
        created_at: exercice.created_at || new Date(),
      };
      if (exercice.specialite) {
        data.specialite = exercice.specialite;
      }

      await setDoc(exerciceRef, data);

      return id;
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde de l\'exercice:', error);
      throw error;
    }
  },

  // Supprimer un exercice
  async deleteExercice(clubId: string, exerciceId: string): Promise<void> {
    try {
      const exerciceRef = doc(db, 'clubs', clubId, COLLECTION_NAME, exerciceId);
      await deleteDoc(exerciceRef);
    } catch (error) {
      logger.error('Erreur lors de la suppression de l\'exercice:', error);
      throw error;
    }
  },

  // Import en masse des exercices
  async importExercices(clubId: string, exercices: Omit<ExerciceLIFRAS, 'id'>[]): Promise<void> {
    try {
      const promises = exercices.map(exercice =>
        this.saveExercice(clubId, exercice)
      );
      await Promise.all(promises);
    } catch (error) {
      logger.error('Erreur lors de l\'import des exercices:', error);
      throw error;
    }
  },

  // Récupérer la liste des spécialités existantes (pour les exercices TN)
  async getSpecialites(clubId: string): Promise<string[]> {
    try {
      const exercices = await this.getAllExercices(clubId);
      const specialites = exercices
        .filter(ex => ex.niveau === 'TN' && ex.specialite)
        .map(ex => ex.specialite as string);
      return [...new Set(specialites)].sort();
    } catch (error) {
      logger.error('Erreur lors de la récupération des spécialités:', error);
      return [];
    }
  }
};
