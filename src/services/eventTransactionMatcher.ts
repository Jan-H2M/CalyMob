/**
 * Service d'auto-matching des transactions bancaires pour les événements VP Dive
 *
 * Recherche automatiquement les transactions bancaires qui correspondent à un événement
 * et les lie automatiquement si la confiance est suffisante.
 *
 * Stratégies de matching:
 * 1. Montant exact (totalité des inscriptions)
 * 2. Montants individuels (paiements séparés par participant)
 * 3. Communication (titre événement ou lieu dans libellé)
 * 4. Date proche (±7 jours autour de l'événement)
 */

import { collection, getDocs, doc, updateDoc, arrayUnion, Timestamp, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TransactionBancaire, MatchedEntity } from '@/types';
import { VPDiveParticipant } from './vpDiveParser';

// Résultat d'un match transaction ↔ événement
export interface TransactionMatch {
  transaction: TransactionBancaire;
  confidence: number; // 0-100
  reason: string; // Raison du match
  participant_nom?: string; // Si lié à un participant spécifique
}

// Résultat après liaison automatique
export interface LinkedMatch {
  transaction_id: string;
  event_id: string;
  participant_nom?: string;
  confidence: number;
  reason: string;
  amount: number;
}

// Résultat global de l'auto-matching
export interface AutoMatchResult {
  autoLinked: LinkedMatch[]; // Matches liés automatiquement (confidence >= 80%)
  suggested: TransactionMatch[]; // Matches suggérés (50-79%)
  unmatched: TransactionMatch[]; // Matches faibles (< 50%)
  totalAmount: number; // Montant total attendu
  linkedAmount: number; // Montant total lié
  matchRate: number; // Taux de matching (%)
}

/**
 * Service principal d'auto-matching événement ↔ transactions
 */
export class EventTransactionMatcher {

  /**
   * Recherche et lie automatiquement les transactions bancaires pour un événement
   *
   * @param clubId ID du club
   * @param eventId ID de l'événement créé
   * @param eventData Données de l'événement VP Dive
   * @returns Résultat du matching avec statistiques
   */
  static async autoMatchEventTransactions(
    clubId: string,
    eventId: string,
    eventData: {
      titre: string;
      lieu: string;
      date_debut: Date;
      date_fin: Date;
      participants: VPDiveParticipant[];
      montant_total: number;
    }
  ): Promise<AutoMatchResult> {
    console.log(`🔗 Auto-matching transactions pour événement "${eventData.titre}" (${eventData.montant_total}€)`);

    try {
      // 1. Charger transactions candidates (revenus non réconciliés)
      const transactions = await this.loadCandidateTransactions(clubId, eventData);
      console.log(`📊 ${transactions.length} transactions candidates trouvées`);

      if (transactions.length === 0) {
        return {
          autoLinked: [],
          suggested: [],
          unmatched: [],
          totalAmount: eventData.montant_total,
          linkedAmount: 0,
          matchRate: 0
        };
      }

      // 2. Recherche par montant exact (paiement global)
      const exactMatches = this.findByExactAmount(transactions, eventData.montant_total);

      // 3. Recherche par montants individuels (paiements séparés)
      const participantMatches = this.findByParticipantAmounts(
        transactions,
        eventData.participants
      );

      // 4. Recherche par communication (titre événement/lieu)
      const communicationMatches = this.findByCommunication(
        transactions,
        eventData.titre,
        eventData.lieu
      );

      // 5. Fusionner résultats et calculer scores de confiance
      const allMatches = this.mergeAndScore(
        exactMatches,
        participantMatches,
        communicationMatches
      );

      console.log(`🎯 ${allMatches.length} matches trouvés`);

      // 6. Lier automatiquement les matches haute confiance (>= 80%)
      const highConfidence = allMatches.filter(m => m.confidence >= 80);
      const linked = await this.linkHighConfidenceMatches(
        clubId,
        eventId,
        eventData.titre,
        highConfidence
      );

      console.log(`✅ ${linked.length} transactions liées automatiquement`);

      // 7. Calculer résultats
      const linkedAmount = linked.reduce((sum, m) => sum + m.amount, 0);
      const matchRate = eventData.montant_total > 0
        ? (linkedAmount / eventData.montant_total) * 100
        : 0;

      return {
        autoLinked: linked,
        suggested: allMatches.filter(m => m.confidence >= 50 && m.confidence < 80),
        unmatched: allMatches.filter(m => m.confidence < 50),
        totalAmount: eventData.montant_total,
        linkedAmount,
        matchRate
      };

    } catch (error) {
      console.error('❌ Erreur auto-matching:', error);
      // Ne pas bloquer la création de l'événement
      return {
        autoLinked: [],
        suggested: [],
        unmatched: [],
        totalAmount: eventData.montant_total,
        linkedAmount: 0,
        matchRate: 0
      };
    }
  }

  /**
   * Charger les transactions candidates (revenus non réconciliés autour de la date événement)
   */
  private static async loadCandidateTransactions(
    clubId: string,
    eventData: { date_debut: Date; date_fin: Date }
  ): Promise<TransactionBancaire[]> {
    try {
      // Fenêtre de recherche: ±30 jours autour de l'événement
      const startDate = new Date(eventData.date_debut);
      startDate.setDate(startDate.getDate() - 30);

      const endDate = new Date(eventData.date_fin);
      endDate.setDate(endDate.getDate() + 30);

      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query: revenus (montant > 0) dans la fenêtre de dates
      const q = query(
        transactionsRef,
        where('montant', '>', 0), // Revenus seulement
        where('date_execution', '>=', Timestamp.fromDate(startDate)),
        where('date_execution', '<=', Timestamp.fromDate(endDate))
      );

      const snapshot = await getDocs(q);

      return snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          date_execution: doc.data().date_execution?.toDate?.() || new Date(doc.data().date_execution),
          date_valeur: doc.data().date_valeur?.toDate?.() || new Date(doc.data().date_valeur),
          created_at: doc.data().created_at?.toDate?.() || new Date(),
          updated_at: doc.data().updated_at?.toDate?.() || new Date()
        } as TransactionBancaire))
        .filter(t =>
          !t.is_parent && // Pas une transaction ventilée
          !this.isAlreadyLinkedToEvent(t) // Pas déjà liée à un événement
        );

    } catch (error) {
      console.error('Erreur chargement transactions:', error);
      return [];
    }
  }

  /**
   * Vérifier si une transaction est déjà liée à un événement
   */
  private static isAlreadyLinkedToEvent(transaction: TransactionBancaire): boolean {
    return transaction.matched_entities?.some(e => e.entity_type === 'event') || false;
  }

  /**
   * Chercher par montant exact (paiement global)
   * Confiance: 95% si montant exact
   */
  private static findByExactAmount(
    transactions: TransactionBancaire[],
    totalAmount: number
  ): TransactionMatch[] {
    const tolerance = 0.01; // ±1 centime

    return transactions
      .filter(t => Math.abs(t.montant - totalAmount) <= tolerance)
      .map(t => ({
        transaction: t,
        confidence: 95,
        reason: `Montant exact: ${totalAmount.toFixed(2)}€`
      }));
  }

  /**
   * Chercher par montants individuels participants
   * Confiance: 80% si montant = paiement participant
   */
  private static findByParticipantAmounts(
    transactions: TransactionBancaire[],
    participants: VPDiveParticipant[]
  ): TransactionMatch[] {
    const tolerance = 0.01;
    const matches: TransactionMatch[] = [];

    for (const tx of transactions) {
      const participant = participants.find(
        p => Math.abs((p.montant || 0) - tx.montant) <= tolerance
      );

      if (participant) {
        matches.push({
          transaction: tx,
          participant_nom: participant.nom,
          confidence: 80,
          reason: `Paiement individuel de ${participant.nom} (${tx.montant.toFixed(2)}€)`
        });
      }
    }

    return matches;
  }

  /**
   * Chercher par communication (nom événement/lieu dans libellé)
   * Confiance: 70% si keywords trouvés
   */
  private static findByCommunication(
    transactions: TransactionBancaire[],
    titre: string,
    lieu: string
  ): TransactionMatch[] {
    // Extraire mots-clés significatifs (> 3 caractères)
    const keywords = [titre, lieu]
      .flatMap(s => s.toLowerCase().split(/\s+/))
      .filter(w => w.length > 3);

    return transactions
      .filter(t => {
        const comm = (t.communication || '').toLowerCase();
        const name = (t.contrepartie_nom || '').toLowerCase();
        const text = `${comm} ${name}`;

        return keywords.some(kw => text.includes(kw));
      })
      .map(t => ({
        transaction: t,
        confidence: 70,
        reason: `Communication contient "${titre}" ou "${lieu}"`
      }));
  }

  /**
   * Fusionner et scorer les matches
   * Si une transaction a plusieurs matches, on garde le meilleur score
   */
  private static mergeAndScore(
    exactMatches: TransactionMatch[],
    participantMatches: TransactionMatch[],
    communicationMatches: TransactionMatch[]
  ): TransactionMatch[] {
    const matchMap = new Map<string, TransactionMatch>();

    // Fonction helper pour ajouter/mettre à jour un match
    const addMatch = (match: TransactionMatch) => {
      const existing = matchMap.get(match.transaction.id);

      if (!existing || match.confidence > existing.confidence) {
        matchMap.set(match.transaction.id, match);
      } else if (match.confidence === existing.confidence) {
        // Même confiance: combiner les raisons
        existing.reason = `${existing.reason} + ${match.reason}`;
        matchMap.set(match.transaction.id, existing);
      }
    };

    // Ajouter tous les matches
    exactMatches.forEach(addMatch);
    participantMatches.forEach(addMatch);
    communicationMatches.forEach(addMatch);

    // Retourner triés par confiance décroissante
    return Array.from(matchMap.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Lier les matches haute confiance automatiquement
   *
   * Ajoute l'événement aux matched_entities de la transaction
   */
  private static async linkHighConfidenceMatches(
    clubId: string,
    eventId: string,
    eventName: string,
    matches: TransactionMatch[]
  ): Promise<LinkedMatch[]> {
    const linked: LinkedMatch[] = [];

    for (const match of matches) {
      try {
        const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', match.transaction.id);

        const entity: MatchedEntity = {
          entity_type: 'event',
          entity_id: eventId,
          entity_name: eventName,
          confidence: match.confidence,
          matched_at: new Date(),
          matched_by: 'auto',
          notes: match.reason
        };

        // Utiliser arrayUnion pour ajouter sans écraser les entités existantes
        await updateDoc(txRef, {
          matched_entities: arrayUnion(entity),
          reconcilie: true,
          updated_at: serverTimestamp()
        });

        linked.push({
          transaction_id: match.transaction.id,
          event_id: eventId,
          participant_nom: match.participant_nom,
          confidence: match.confidence,
          reason: match.reason,
          amount: match.transaction.montant
        });

        console.log(`✅ Transaction ${match.transaction.id} liée (${match.confidence}%): ${match.reason}`);

      } catch (error) {
        console.error(`❌ Erreur liaison transaction ${match.transaction.id}:`, error);
        // Continuer avec les autres
      }
    }

    return linked;
  }

  /**
   * Délier une transaction d'un événement
   */
  static async unlinkTransaction(
    clubId: string,
    eventId: string,
    transactionId: string
  ): Promise<void> {
    try {
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);

      // Récupérer transaction
      const txSnap = await getDocs(query(collection(db, 'clubs', clubId, 'transactions_bancaires'), where('__name__', '==', transactionId)));

      if (txSnap.empty) {
        throw new Error('Transaction non trouvée');
      }

      const txData = txSnap.docs[0].data() as TransactionBancaire;

      // Retirer l'entité de type 'event' avec cet eventId
      const updatedEntities = (txData.matched_entities || []).filter(
        e => !(e.entity_type === 'event' && e.entity_id === eventId)
      );

      await updateDoc(txRef, {
        matched_entities: updatedEntities,
        reconcilie: updatedEntities.length > 0,
        updated_at: serverTimestamp()
      });

      console.log(`✅ Transaction ${transactionId} déliée de l'événement ${eventId}`);

    } catch (error) {
      console.error('Erreur déliaison transaction:', error);
      throw error;
    }
  }
}
