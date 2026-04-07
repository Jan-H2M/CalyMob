import { logger } from '@/utils/logger';
/**
 * Service de matching automatique pour Demandes de Remboursement → Opérations/Activités
 *
 * Algorithme déterministe basé sur:
 * - Comparaison de titres/descriptions (fuzzy matching)
 * - Le demandeur est participant à l'opération
 * - Proximité de dates (date dépense proche de date opération)
 *
 * Utilisé pour:
 * 1. Auto-suggestion lors de la création d'une demande
 * 2. Batch matching pour lier les demandes orphelines
 */

import { DemandeRemboursement, Operation, InscriptionEvenement } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, updateDoc, query, where, serverTimestamp } from 'firebase/firestore';

export interface ExpenseOperationMatch {
  demande_id: string;
  operation_id: string;
  operation_titre: string;
  score: number; // 0-100
  titre_match: boolean;
  demandeur_participant: boolean;
  date_diff_days: number;
  reasoning: string;
}

export interface BatchMatchResults {
  autoLinked: ExpenseOperationMatch[];
  suggested: ExpenseOperationMatch[];
  unmatched: DemandeRemboursement[];
  errors: string[];
}

export class ExpenseOperationMatchingService {

  /**
   * Trouve les meilleures correspondances opération pour une demande
   * Utilisé pour auto-suggestion dans l'UI
   *
   * @param demande - La demande de remboursement
   * @param operations - Liste des opérations candidates
   * @param inscriptions - Map operation_id → inscriptions (pour vérifier participation)
   * @returns Liste triée par score décroissant
   */
  static findMatchesForDemande(
    demande: DemandeRemboursement,
    operations: Operation[],
    inscriptions: Map<string, InscriptionEvenement[]>
  ): ExpenseOperationMatch[] {
    const matches: ExpenseOperationMatch[] = [];

    const demandeText = this.normalizeText(
      `${demande.titre || ''} ${demande.description || ''}`
    );
    const demandeurNom = this.normalizeText(
      `${demande.demandeur_prenom || ''} ${demande.demandeur_nom || ''}`
    );
    const dateDepense = demande.date_depense
      ? new Date(demande.date_depense)
      : demande.date_demande
        ? new Date(demande.date_demande)
        : null;

    for (const operation of operations) {
      const operationText = this.normalizeText(operation.titre || '');

      // 1. Score de titre (fuzzy match)
      const titreScore = this.calculateTextSimilarity(demandeText, operationText);
      const titreMatch = titreScore >= 0.5; // 50% minimum

      // 2. Vérifier si demandeur est participant
      const operationInscriptions = inscriptions.get(operation.id) || [];
      const demandeurParticipant = this.isDemandeurParticipant(
        demandeurNom,
        demande.demandeur_id,
        operationInscriptions
      );

      // 3. Calcul écart de date
      const operationDate = operation.date_debut
        ? new Date(operation.date_debut)
        : null;
      const dateDiff = (dateDepense && operationDate)
        ? Math.abs(dateDepense.getTime() - operationDate.getTime()) / (1000 * 60 * 60 * 24)
        : 999;

      // Calculer le score final
      const score = this.calculateScore(titreScore, demandeurParticipant, dateDiff);

      // Seuil minimum de 30% pour être considéré
      if (score >= 30) {
        matches.push({
          demande_id: demande.id,
          operation_id: operation.id,
          operation_titre: operation.titre,
          score: Math.round(score),
          titre_match: titreMatch,
          demandeur_participant: demandeurParticipant,
          date_diff_days: Math.round(dateDiff),
          reasoning: this.buildReasoning(
            demande.titre || demande.description || '',
            operation.titre,
            titreScore,
            demandeurParticipant,
            dateDiff
          )
        });
      }
    }

    // Trier par score décroissant
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Batch matching: lie automatiquement les demandes sans operation_id
   *
   * @param clubId - ID du club
   * @param autoLinkThreshold - Score minimum pour lier automatiquement (défaut: 80)
   * @param suggestThreshold - Score minimum pour suggérer (défaut: 50)
   */
  static async performBatchMatching(
    clubId: string,
    autoLinkThreshold: number = 80,
    suggestThreshold: number = 50
  ): Promise<BatchMatchResults> {
    const results: BatchMatchResults = {
      autoLinked: [],
      suggested: [],
      unmatched: [],
      errors: []
    };

    try {
      // 1. Charger les demandes sans operation_id
      const demandes = await this.loadUnlinkedDemandes(clubId);
      logger.debug(`📋 ${demandes.length} demandes sans opération liée`);

      if (demandes.length === 0) {
        return results;
      }

      // 2. Charger les opérations
      const operations = await this.loadOperations(clubId);
      logger.debug(`📅 ${operations.length} opérations disponibles`);

      // 3. Charger les inscriptions
      const inscriptions = await this.loadAllInscriptions(clubId, operations);
      logger.debug(`👥 Inscriptions chargées pour ${inscriptions.size} opérations`);

      // 4. Trouver les correspondances
      for (const demande of demandes) {
        const matches = this.findMatchesForDemande(demande, operations, inscriptions);

        if (matches.length > 0) {
          const bestMatch = matches[0];

          if (bestMatch.score >= autoLinkThreshold) {
            // Auto-lier
            try {
              await this.linkDemandeToOperation(clubId, demande.id, bestMatch.operation_id, bestMatch.operation_titre);
              results.autoLinked.push(bestMatch);
              logger.debug(`✅ Auto-lié: "${demande.titre || demande.description}" → "${bestMatch.operation_titre}" (${bestMatch.score}%)`);
            } catch (error) {
              results.errors.push(`Erreur liaison ${demande.id}: ${error}`);
            }
          } else if (bestMatch.score >= suggestThreshold) {
            // Suggérer
            results.suggested.push(bestMatch);
            logger.debug(`💡 Suggéré: "${demande.titre || demande.description}" → "${bestMatch.operation_titre}" (${bestMatch.score}%)`);
          } else {
            results.unmatched.push(demande);
          }
        } else {
          results.unmatched.push(demande);
        }
      }

      logger.debug(`\n📊 Résultats batch matching:`);
      logger.debug(`   ✅ Auto-liés: ${results.autoLinked.length}`);
      logger.debug(`   💡 Suggérés: ${results.suggested.length}`);
      logger.debug(`   ❌ Non matchés: ${results.unmatched.length}`);

    } catch (error) {
      results.errors.push(`Erreur globale: ${error}`);
    }

    return results;
  }

  /**
   * Lie manuellement une demande à une opération
   */
  static async linkDemandeToOperation(
    clubId: string,
    demandeId: string,
    operationId: string,
    operationTitre: string
  ): Promise<void> {
    const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandeId);
    await updateDoc(demandeRef, {
      operation_id: operationId,
      operation_titre: operationTitre,
      // Legacy field pour compatibilité
      evenement_id: operationId,
      evenement_titre: operationTitre,
      updated_at: serverTimestamp()
    });
  }

  /**
   * Délie une demande d'une opération
   */
  static async unlinkDemandeFromOperation(
    clubId: string,
    demandeId: string
  ): Promise<void> {
    const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demandeId);
    await updateDoc(demandeRef, {
      operation_id: null,
      operation_titre: null,
      evenement_id: null,
      evenement_titre: null,
      updated_at: serverTimestamp()
    });
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Charge les demandes sans operation_id
   */
  private static async loadUnlinkedDemandes(clubId: string): Promise<DemandeRemboursement[]> {
    const demandesRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
    const snapshot = await getDocs(demandesRef);

    return snapshot.docs
      .map(doc => ({
        id: doc.id,
        ...doc.data(),
        date_demande: doc.data().date_demande?.toDate?.() || new Date(doc.data().date_demande),
        date_depense: doc.data().date_depense?.toDate?.() || null,
      } as DemandeRemboursement))
      .filter(d =>
        !d.operation_id &&
        !d.evenement_id &&
        d.statut !== 'brouillon' &&
        d.statut !== 'refuse'
      );
  }

  /**
   * Charge les opérations de type événement
   */
  private static async loadOperations(clubId: string): Promise<Operation[]> {
    const operationsRef = collection(db, 'clubs', clubId, 'operations');
    const q = query(operationsRef, where('type', '==', 'evenement'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      date_debut: doc.data().date_debut?.toDate?.() || new Date(doc.data().date_debut),
      date_fin: doc.data().date_fin?.toDate?.() || null,
    } as Operation));
  }

  /**
   * Charge toutes les inscriptions pour les opérations données
   */
  private static async loadAllInscriptions(
    clubId: string,
    operations: Operation[]
  ): Promise<Map<string, InscriptionEvenement[]>> {
    const inscriptionsMap = new Map<string, InscriptionEvenement[]>();

    for (const operation of operations) {
      try {
        const inscriptionsRef = collection(
          db, 'clubs', clubId, 'operations', operation.id, 'inscriptions'
        );
        const snapshot = await getDocs(inscriptionsRef);

        const inscriptions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as InscriptionEvenement));

        inscriptionsMap.set(operation.id, inscriptions);
      } catch (error) {
        // Opération sans inscriptions, c'est OK
        inscriptionsMap.set(operation.id, []);
      }
    }

    return inscriptionsMap;
  }

  /**
   * Normalise le texte pour comparaison
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Enlever accents
      .replace(/[^a-z0-9\s]/g, '') // Garder que alphanum et espaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calcule la similarité entre deux textes
   * Utilise une combinaison de:
   * - Mots en commun
   * - Inclusion de sous-chaîne
   */
  private static calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    // 1. Vérifier inclusion directe
    if (text1.includes(text2) || text2.includes(text1)) {
      return 0.9; // 90% si l'un contient l'autre
    }

    // 2. Mots en commun
    const words1 = new Set(text1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(text2.split(' ').filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let commonWords = 0;
    for (const word of words1) {
      if (words2.has(word)) {
        commonWords++;
      }
    }

    // Score basé sur Jaccard (intersection / union)
    const union = new Set([...words1, ...words2]).size;
    return commonWords / union;
  }

  /**
   * Vérifie si le demandeur est participant à l'opération
   */
  private static isDemandeurParticipant(
    demandeurNom: string,
    demandeurId: string,
    inscriptions: InscriptionEvenement[]
  ): boolean {
    for (const inscription of inscriptions) {
      // Vérifier par ID (le plus fiable)
      if (demandeurId && inscription.membre_id === demandeurId) {
        return true;
      }

      // Vérifier par nom
      const inscriptionNom = this.normalizeText(
        `${inscription.membre_prenom || ''} ${inscription.membre_nom || ''}`
      );

      if (inscriptionNom && demandeurNom) {
        const similarity = this.calculateNameSimilarity(demandeurNom, inscriptionNom);
        if (similarity >= 0.8) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calcule la similarité entre deux noms (Levenshtein)
   */
  private static calculateNameSimilarity(name1: string, name2: string): number {
    if (name1 === name2) return 1;
    if (!name1 || !name2) return 0;

    // Essayer ordre normal et inversé
    const score1 = this.levenshteinSimilarity(name1, name2);
    const parts2 = name2.split(' ');
    const name2Inverse = parts2.reverse().join(' ');
    const score2 = this.levenshteinSimilarity(name1, name2Inverse);

    return Math.max(score1, score2);
  }

  /**
   * Calcule la similarité Levenshtein
   */
  private static levenshteinSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Distance de Levenshtein
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calcule le score final
   * Pondération:
   * - Titre: 40%
   * - Demandeur participant: 40%
   * - Date: 20%
   */
  private static calculateScore(
    titreScore: number,
    demandeurParticipant: boolean,
    dateDiff: number
  ): number {
    const titreWeight = 0.40;
    const participantWeight = 0.40;
    const dateWeight = 0.20;

    const participantScore = demandeurParticipant ? 1 : 0;

    // Score de date: 1.0 si même jour, décroit jusqu'à 90 jours
    const dateScore = dateDiff < 999 ? Math.max(0, 1 - (dateDiff / 90)) : 0;

    return (
      (titreScore * titreWeight) +
      (participantScore * participantWeight) +
      (dateScore * dateWeight)
    ) * 100;
  }

  /**
   * Construit une explication lisible
   */
  private static buildReasoning(
    demandeTitre: string,
    operationTitre: string,
    titreScore: number,
    demandeurParticipant: boolean,
    dateDiff: number
  ): string {
    const parts: string[] = [];

    // Titre
    parts.push(`Titre: "${demandeTitre.substring(0, 30)}..." ↔ "${operationTitre}" (${Math.round(titreScore * 100)}%)`);

    // Participant
    if (demandeurParticipant) {
      parts.push('Demandeur est participant ✓');
    } else {
      parts.push('Demandeur non-participant');
    }

    // Date
    if (dateDiff < 999) {
      parts.push(`Écart date: ${Math.round(dateDiff)} jour(s)`);
    }

    return parts.join(' | ');
  }
}
