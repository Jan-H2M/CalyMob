import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { AIExpenseMatch } from '@/types';

/**
 * Service pour gérer le stockage des correspondances AI dans Firebase
 */
export class AIMatchStorageService {

  /**
   * Sauvegarde une nouvelle correspondance AI dans Firebase
   */
  static async saveMatch(
    clubId: string,
    transactionId: string,
    demandeId: string,
    confidence: number,
    reasoning: string,
    userId: string
  ): Promise<string> {
    const matchesRef = collection(db, 'clubs', clubId, 'ai_expense_matches');
    const newMatchRef = doc(matchesRef);

    const matchData: Omit<AIExpenseMatch, 'id'> = {
      club_id: clubId,
      transaction_id: transactionId,
      demande_id: demandeId,
      confidence,
      reasoning,
      statut: 'pending',
      created_at: new Date(),
      created_by: userId
    };

    await setDoc(newMatchRef, {
      ...matchData,
      created_at: Timestamp.fromDate(matchData.created_at)
    });

    return newMatchRef.id;
  }

  /**
   * Récupère toutes les correspondances AI pour un club
   */
  static async getAllMatches(clubId: string): Promise<AIExpenseMatch[]> {
    console.log(`[AIMatchStorage] Getting all matches for club: ${clubId}`);
    const matchesRef = collection(db, 'clubs', clubId, 'ai_expense_matches');
    const q = query(matchesRef, orderBy('created_at', 'desc'));
    const snapshot = await getDocs(q);

    console.log(`[AIMatchStorage] Found ${snapshot.size} documents`);

    const matches = snapshot.docs.map(doc => {
      const data = doc.data();
      console.log(`[AIMatchStorage] Document ${doc.id}:`, data);
      return {
        id: doc.id,
        ...data,
        created_at: data.created_at?.toDate() || new Date(),
        validated_at: data.validated_at?.toDate()
      } as AIExpenseMatch;
    });

    console.log(`[AIMatchStorage] Mapped matches:`, matches);
    return matches;
  }

  /**
   * Récupère les correspondances par statut
   */
  static async getMatchesByStatus(
    clubId: string,
    statut: 'pending' | 'validated' | 'rejected'
  ): Promise<AIExpenseMatch[]> {
    const matchesRef = collection(db, 'clubs', clubId, 'ai_expense_matches');
    const q = query(
      matchesRef,
      where('statut', '==', statut),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate() || new Date(),
      validated_at: doc.data().validated_at?.toDate()
    } as AIExpenseMatch));
  }

  /**
   * Récupère une correspondance spécifique
   */
  static async getMatch(clubId: string, matchId: string): Promise<AIExpenseMatch | null> {
    const matchRef = doc(db, 'clubs', clubId, 'ai_expense_matches', matchId);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return null;
    }

    return {
      id: matchSnap.id,
      ...matchSnap.data(),
      created_at: matchSnap.data().created_at?.toDate() || new Date(),
      validated_at: matchSnap.data().validated_at?.toDate()
    } as AIExpenseMatch;
  }

  /**
   * Met à jour le statut d'une correspondance (validation ou rejet)
   */
  static async updateMatchStatus(
    clubId: string,
    matchId: string,
    statut: 'validated' | 'rejected',
    userId: string
  ): Promise<void> {
    const matchRef = doc(db, 'clubs', clubId, 'ai_expense_matches', matchId);

    await updateDoc(matchRef, {
      statut,
      validated_by: userId,
      validated_at: Timestamp.now()
    });
  }

  /**
   * Supprime une correspondance
   */
  static async deleteMatch(clubId: string, matchId: string): Promise<void> {
    const matchRef = doc(db, 'clubs', clubId, 'ai_expense_matches', matchId);
    await deleteDoc(matchRef);
  }

  /**
   * Vérifie si une correspondance existe déjà pour une transaction
   */
  static async matchExistsForTransaction(
    clubId: string,
    transactionId: string
  ): Promise<boolean> {
    const matchesRef = collection(db, 'clubs', clubId, 'ai_expense_matches');
    const q = query(
      matchesRef,
      where('transaction_id', '==', transactionId),
      where('statut', '==', 'pending')
    );
    const snapshot = await getDocs(q);

    return !snapshot.empty;
  }

  /**
   * Compte les correspondances par statut
   */
  static async getMatchesStats(clubId: string): Promise<{
    pending: number;
    validated: number;
    rejected: number;
    total: number;
  }> {
    const matchesRef = collection(db, 'clubs', clubId, 'ai_expense_matches');
    const snapshot = await getDocs(matchesRef);

    const stats = {
      pending: 0,
      validated: 0,
      rejected: 0,
      total: snapshot.size
    };

    snapshot.forEach(doc => {
      const statut = doc.data().statut;
      if (statut === 'pending') stats.pending++;
      else if (statut === 'validated') stats.validated++;
      else if (statut === 'rejected') stats.rejected++;
    });

    return stats;
  }
}
