/**
 * Service de matching algorithmique pour inscriptions → transactions
 *
 * Remplace l'approche IA par un algorithme déterministe basé sur:
 * - Comparaison de noms (normalisé, inversé, similarité)
 * - Validation de montant (±0.50€)
 * - Proximité de date
 *
 * Avantages:
 * - Déterministe (même entrée → même sortie)
 * - Instantané (pas d'appel API)
 * - Gratuit (pas de coût)
 * - Débogable (on sait pourquoi ça match)
 */

import { TransactionBancaire, InscriptionEvenement } from '@/types';

export interface InscriptionMatch {
  inscription_id: string;
  transaction_id: string;
  score: number; // 0-100
  nom_match: boolean;
  montant_match: boolean;
  date_diff_days: number;
  reasoning: string;
}

export class InscriptionMatchingService {
  /**
   * Trouve les meilleures correspondances pour des inscriptions
   *
   * @param inscriptions - Inscriptions non payées
   * @param transactions - Transactions candidates (déjà filtrées)
   * @returns Map<transaction_id, match_info>
   */
  static findMatches(
    inscriptions: InscriptionEvenement[],
    transactions: TransactionBancaire[]
  ): Map<string, InscriptionMatch> {
    const matches = new Map<string, InscriptionMatch>();

    console.log('🔍 MATCHING ALGORITHMIQUE DÉMARRÉ');
    console.log(`  📋 ${inscriptions.length} inscriptions à matcher`);
    console.log(`  💳 ${transactions.length} transactions candidates`);

    for (const inscription of inscriptions) {
      // Chercher la meilleure transaction pour cette inscription
      const bestMatch = this.findBestMatchForInscription(inscription, transactions);

      if (bestMatch) {
        // Vérifier qu'une autre inscription n'a pas déjà pris cette transaction
        if (!matches.has(bestMatch.transaction_id)) {
          matches.set(bestMatch.transaction_id, bestMatch);
          console.log(`  ✅ Match trouvé: ${inscription.membre_prenom} ${inscription.membre_nom} → ${bestMatch.score}%`);
        } else {
          console.log(`  ⚠️ Transaction déjà utilisée pour ${inscription.membre_prenom} ${inscription.membre_nom}`);
        }
      } else {
        console.log(`  ❌ Aucun match pour ${inscription.membre_prenom} ${inscription.membre_nom} (${inscription.prix}€)`);
      }
    }

    console.log(`\n✅ ${matches.size} matches trouvés au total\n`);
    return matches;
  }

  /**
   * Trouve la meilleure transaction pour une inscription
   */
  private static findBestMatchForInscription(
    inscription: InscriptionEvenement,
    transactions: TransactionBancaire[]
  ): InscriptionMatch | null {
    const candidates: InscriptionMatch[] = [];

    const insNom = this.normalizeNom(inscription.membre_nom || '', inscription.membre_prenom || '');

    for (const tx of transactions) {
      const txNom = this.normalizeNom(tx.contrepartie_nom || '');

      // 1. Vérifier correspondance de nom
      const nameScore = this.compareNoms(insNom, txNom);
      const nameMatch = nameScore >= 0.80; // 80% de similarité minimum

      // 2. Vérifier correspondance de montant (±0.50€)
      const montantDiff = Math.abs(tx.montant - (inscription.prix || 0));
      const montantMatch = montantDiff <= 0.50;

      // 3. Si nom ET montant correspondent, c'est un candidat
      if (nameMatch && montantMatch) {
        const dateDiff = inscription.date_inscription
          ? Math.abs(
              (new Date(tx.date_execution).getTime() - new Date(inscription.date_inscription).getTime())
              / (1000 * 60 * 60 * 24)
            )
          : 999;

        const score = this.calculateScore(nameScore, montantDiff, dateDiff);

        candidates.push({
          inscription_id: inscription.id,
          transaction_id: tx.id,
          score: Math.round(score * 100),
          nom_match: nameMatch,
          montant_match: montantMatch,
          date_diff_days: Math.round(dateDiff),
          reasoning: this.buildReasoning(
            insNom,
            txNom,
            nameScore,
            inscription.prix || 0,
            tx.montant,
            montantDiff,
            dateDiff
          )
        });
      }
    }

    // Retourner le meilleur candidat (score le plus élevé)
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  /**
   * Normalise un nom pour comparaison
   * - Enlève accents
   * - Enlève titres (M., Mme, etc.)
   * - Minuscules
   * - Garde seulement lettres et espaces
   */
  private static normalizeNom(nom: string, prenom: string = ''): string {
    let fullName = prenom ? `${prenom} ${nom}` : nom;

    return fullName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Enlever accents
      .replace(/^(m\.|mme|mr|mrs|monsieur|madame|mlle)\s+/i, '') // Enlever titres
      .replace(/[^a-z\s]/g, '') // Garder que lettres et espaces
      .replace(/\s+/g, ' ') // Normaliser espaces
      .trim();
  }

  /**
   * Compare deux noms normalisés
   * Essaie ordre normal ET inversé (prénom nom / nom prénom)
   *
   * @returns Score 0-1 (1 = identique)
   */
  private static compareNoms(nom1: string, nom2: string): number {
    // Essayer ordre normal
    const score1 = this.levenshteinSimilarity(nom1, nom2);

    // Essayer ordre inversé
    const parts2 = nom2.split(' ');
    const nom2Inverse = parts2.reverse().join(' ');
    const score2 = this.levenshteinSimilarity(nom1, nom2Inverse);

    // Retourner le meilleur score
    return Math.max(score1, score2);
  }

  /**
   * Calcule la similarité entre deux chaînes avec algorithme Levenshtein
   *
   * @returns Score 0-1 (1 = identique)
   */
  private static levenshteinSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calcule la distance de Levenshtein (nombre de modifications nécessaires)
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
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calcule un score global basé sur nom, montant et date
   */
  private static calculateScore(
    nameScore: number,
    montantDiff: number,
    dateDiff: number
  ): number {
    // Pondération: nom (60%), montant (30%), date (10%)
    const nameWeight = 0.60;
    const montantWeight = 0.30;
    const dateWeight = 0.10;

    // Score de montant: 1.0 si identique, décroit linéairement jusqu'à 0.50€
    const montantScore = Math.max(0, 1 - (montantDiff / 0.50));

    // Score de date: 1.0 si même jour, décroit jusqu'à 60 jours
    const dateScore = Math.max(0, 1 - (dateDiff / 60));

    return (nameScore * nameWeight) + (montantScore * montantWeight) + (dateScore * dateWeight);
  }

  /**
   * Construit une explication lisible du match
   */
  private static buildReasoning(
    insNom: string,
    txNom: string,
    nameScore: number,
    insPrix: number,
    txMontant: number,
    montantDiff: number,
    dateDiff: number
  ): string {
    const parts: string[] = [];

    // Nom
    parts.push(`Nom: "${txNom}" → "${insNom}" (similarité ${Math.round(nameScore * 100)}%)`);

    // Montant
    if (montantDiff === 0) {
      parts.push(`Montant identique: ${txMontant}€`);
    } else {
      parts.push(`Montant: ${txMontant}€ vs ${insPrix}€ (écart ${montantDiff.toFixed(2)}€)`);
    }

    // Date
    if (dateDiff < 999) {
      parts.push(`Date: écart de ${Math.round(dateDiff)} jour(s)`);
    }

    return parts.join(', ');
  }
}
