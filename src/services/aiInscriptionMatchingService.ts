import { TransactionBancaire, InscriptionEvenement, Evenement } from '@/types';
import OpenAI from 'openai';
import { AIMatchStorageService } from './aiMatchStorageService';
import { logger } from '@/utils/logger';

export interface AIInscriptionMatchAnalysis {
  inscription_id: string;
  confidence: number;
  reasoning: string;
  extracted_info: {
    participant_nom?: string;
    montant_detecte?: number;
    date_detectee?: string;
    keywords?: string[];
  };
}

/**
 * Service de matching avec IA pour les inscriptions événements
 * Similaire à aiExpenseMatchingService mais optimisé pour les inscriptions
 */
export class AIInscriptionMatchingService {
  private client: OpenAI | null = null;

  constructor() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem('ai_api_key');
    if (apiKey) {
      this.client = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true
      });
    }
  }

  /**
   * Vérifie si l'IA est disponible
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Analyse une transaction avec l'IA pour trouver l'inscription correspondante
   */
  async analyzeTransactionMatch(
    transaction: TransactionBancaire,
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date }
  ): Promise<AIInscriptionMatchAnalysis | null> {
    if (!this.client) {
      throw new Error('API IA non configurée');
    }

    const prompt = this.buildMatchingPrompt(transaction, inscriptions, eventContext);

    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 1024
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const analysis = this.parseAIResponse(responseText);

      return analysis;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse IA:', error);
      return null;
    }
  }

  /**
   * Construit le prompt optimisé pour les inscriptions événements
   */
  private buildMatchingPrompt(
    transaction: TransactionBancaire,
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date }
  ): string {
    const txDate = new Date(transaction.date_execution).toISOString().split('T')[0];

    const inscriptionsInfo = inscriptions.map((i, idx) => {
      const dateInsc = i.date_inscription
        ? new Date(i.date_inscription).toISOString().split('T')[0]
        : 'N/A';

      const nomComplet = `${i.membre_prenom || ''} ${i.membre_nom || ''}`.trim();

      return `${idx + 1}. ID: ${i.id}
   Participant: ${nomComplet}
   Montant: ${i.prix}€
   Date inscription: ${dateInsc}
   Licence: ${i.licence || 'N/A'}
   Niveau: ${i.niveau || 'N/A'}`;
    }).join('\n\n');

    const eventInfo = eventContext ? `
CONTEXTE ÉVÉNEMENT:
Titre: ${eventContext.titre}
Lieu: ${eventContext.lieu}
Date début: ${new Date(eventContext.date_debut).toISOString().split('T')[0]}
Date fin: ${new Date(eventContext.date_fin).toISOString().split('T')[0]}
` : '';

    return `Tu es un expert comptable belge spécialisé dans la gestion des clubs de plongée. Ton rôle est d'associer une transaction bancaire (paiement d'inscription) à la bonne inscription d'événement.

${eventInfo}
TRANSACTION BANCAIRE À ANALYSER:
Date: ${txDate}
Montant: ${transaction.montant}€ (revenu)
Contrepartie: ${transaction.contrepartie_nom}
IBAN: ${transaction.contrepartie_iban || 'N/A'}
Communication: ${transaction.communication || 'N/A'}

INSCRIPTIONS CANDIDATES (non encore payées):
${inscriptionsInfo}

TÂCHE:
Analyse la transaction bancaire et trouve l'inscription qui correspond le mieux. Prends en compte:
- **Le nom du participant** : Peut être inversé (Prénom Nom vs Nom Prénom), en MAJUSCULES, avec/sans titres (M., Mme), avec initiales (M. → Marc)
- **Le montant** : Doit correspondre exactement ou être très proche (±0.50€)
- **La communication** : Peut contenir le nom du participant, le titre de l'événement, ou le lieu
- **La date** : Paiement généralement proche de l'inscription (±30 jours acceptable, ±60 jours tolérable)

IMPORTANT - Variations de noms courantes:
- "MORAN ALVAREZ Marc" = "Marc MORAN ALVAREZ" = "M. ALVAREZ" = "ALVAREZ M." = "Marc Alvarez"
- "Jean-Pierre DUPONT" = "DUPONT Jean Pierre" = "J-P DUPONT" = "JP Dupont"
- Ignorer COMPLÈTEMENT: titres (M., Mme, Dr), casse (MAJUSCULES/minuscules), tirets, espaces multiples

SCORING:
- Nom exact + Montant exact + Date proche (≤30j) → 95-100%
- Nom exact + Montant exact + Date éloignée (30-60j) → 80-90%
- Nom très similaire + Montant exact → 70-85%
- Nom dans communication + Montant exact → 60-75%
- Montant seul (plusieurs inscrits au même prix) → 40-50%

Réponds UNIQUEMENT avec un JSON valide dans ce format exact:
{
  "inscription_id": "ID_de_l_inscription" ou null,
  "confidence": 0-100,
  "reasoning": "explication détaillée de ton analyse (mentionne nom détecté, montant, date, similarité)",
  "extracted_info": {
    "participant_nom": "nom extrait de la transaction",
    "montant_detecte": montant_en_nombre,
    "keywords": ["mot1", "mot2"]
  }
}

Si aucune correspondance acceptable n'est trouvée (confidence < 50), retourne inscription_id: null.`;
  }

  /**
   * Parse la réponse de l'IA
   */
  private parseAIResponse(responseText: string): AIInscriptionMatchAnalysis | null {
    try {
      // Extraire le JSON de la réponse
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('Pas de JSON trouvé dans la réponse IA');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validation
      if (parsed.inscription_id === null || parsed.confidence < 50) {
        return null;
      }

      return {
        inscription_id: parsed.inscription_id,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || '',
        extracted_info: parsed.extracted_info || {}
      };
    } catch (error) {
      logger.error('Erreur parsing réponse IA:', error);
      return null;
    }
  }

  /**
   * Analyse batch de plusieurs transactions
   */
  async analyzeBatch(
    transactions: TransactionBancaire[],
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date },
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, AIInscriptionMatchAnalysis>> {
    const results = new Map<string, AIInscriptionMatchAnalysis>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      if (onProgress) {
        onProgress(i + 1, transactions.length);
      }

      try {
        const analysis = await this.analyzeTransactionMatch(tx, inscriptions, eventContext);
        if (analysis) {
          results.set(tx.id, analysis);
        }

        // Délai pour éviter rate limiting
        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        logger.error(`Erreur analyse IA transaction ${tx.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Matching hybride : Algo classique + IA pour les restants
   * OPTIMISATION: IA utilisée seulement pour les non-matchés (économise 70-80% du coût)
   * NOTE: Cette méthode NE sauvegarde PAS automatiquement - retourne seulement les résultats
   */
  async hybridMatching(
    clubId: string,
    eventId: string,
    userId: string,
    unmatchedTransactions: TransactionBancaire[],
    unmatchedInscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date },
    maxTransactionsToAnalyze: number = 100, // Augmenté à 100 par défaut
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<Map<string, AIInscriptionMatchAnalysis>> {
    logger.debug('🔍 ANALYSE IA - Filtrage intelligent des transactions...');
    logger.debug(`  📊 Total transactions disponibles: ${unmatchedTransactions.length}`);
    logger.debug(`  📋 Inscriptions non-payées: ${unmatchedInscriptions.length}`);

    // FILTRAGE INTELLIGENT : Ne garder que les transactions pertinentes
    const inscriptionAmounts = unmatchedInscriptions.map(i => i.prix).filter(p => p > 0);

    let filteredTransactions = unmatchedTransactions;

    // Filtrer UNIQUEMENT les transactions positives (revenus) entre 0€ et 25€ (excursions plongée)
    logger.debug(`  💰 Montants inscriptions: ${inscriptionAmounts.length > 0 ? Math.min(...inscriptionAmounts) + '€ - ' + Math.max(...inscriptionAmounts) + '€' : 'N/A'}`);

    filteredTransactions = unmatchedTransactions.filter(tx => {
      const amount = tx.montant; // Garder le signe

      // ❌ Exclure les transactions déjà réconciliées
      const isReconciled = tx.reconciliation_status === 'complete' ||
                          (tx.matched_entities && tx.matched_entities.length > 0);

      if (isReconciled) {
        return false;
      }

      // Ne garder QUE les transactions positives (revenus) entre 0€ et 25€
      return amount > 0 && amount <= 25;
    });

    logger.debug(`  ✂️ Après filtrage par montant (revenus entre 0€ et 25€, non réconciliées): ${filteredTransactions.length} transactions`);

    if (filteredTransactions.length === 0) {
      logger.warn('  ⚠️ Aucune transaction positive ≤25€ trouvée !');
    }

    // Filtrer par date si contexte événement disponible
    if (eventContext) {
      const eventDate = new Date(eventContext.date_debut);
      const dateMin = new Date(eventDate);
      dateMin.setDate(dateMin.getDate() - 60); // 60 jours avant
      const dateMax = new Date(eventDate);
      dateMax.setDate(dateMax.getDate() + 60); // 60 jours après

      filteredTransactions = filteredTransactions.filter(tx => {
        const txDate = new Date(tx.date_execution);
        return txDate >= dateMin && txDate <= dateMax;
      });

      logger.debug(`  📅 Après filtrage par date (±60 jours de ${eventDate.toISOString().split('T')[0]}): ${filteredTransactions.length} transactions`);
    }

    // Limiter au nombre max (pour contrôler le coût)
    const txToAnalyze = filteredTransactions.slice(0, maxTransactionsToAnalyze);

    logger.debug(`  🎯 Transactions envoyées à l'IA: ${txToAnalyze.length} (max: ${maxTransactionsToAnalyze})`);
    logger.debug(`  💵 Coût estimé: $${(txToAnalyze.length * 0.01).toFixed(2)}`);

    if (txToAnalyze.length > 0) {
      logger.debug(`  📝 Exemples de noms (premiers 5): ${txToAnalyze.slice(0, 5).map(t => t.contrepartie_nom).join(', ')}...`);

      // LOG COMPLET: Afficher TOUS les noms des transactions envoyées
      logger.debug(`\n  📋 LISTE COMPLÈTE des ${txToAnalyze.length} transactions envoyées à l'IA:`);
      txToAnalyze.forEach((tx, idx) => {
        const date = new Date(tx.date_execution).toISOString().split('T')[0];
        logger.debug(`    ${idx + 1}. ${tx.contrepartie_nom} - ${tx.montant}€ - ${date} - ${tx.communication || 'N/A'}`);
      });
      logger.debug('');
    }

    if (unmatchedInscriptions.length > 0) {
      const inscriptionNames = unmatchedInscriptions.map(i => {
        const prenom = i.membre_prenom || i.prenom || '';
        const nom = i.membre_nom || i.nom || '';
        return `${prenom} ${nom}`.trim() || 'Nom inconnu';
      }).join(', ');
      logger.debug(`  👤 Noms inscriptions: ${inscriptionNames}`);
      logger.debug(`  💵 Prix inscriptions: ${unmatchedInscriptions.map(i => `${i.prix || 0}€`).join(', ')}`);

      // DEBUG: Vérifier si les transactions correspondantes sont dans la liste envoyée
      logger.debug(`\n  🔍 VÉRIFICATION: Transactions correspondant aux inscriptions dans la liste envoyée?`);
      for (const inscription of unmatchedInscriptions) {
        const nom = inscription.membre_nom || inscription.nom || '';
        const prenom = inscription.membre_prenom || inscription.prenom || '';
        const nomComplet = `${prenom} ${nom}`.trim();

        // Chercher dans txToAnalyze
        const found = txToAnalyze.find(tx =>
          tx.contrepartie_nom?.toLowerCase().includes(nom.toLowerCase()) ||
          tx.contrepartie_nom?.toLowerCase().includes(prenom.toLowerCase())
        );

        if (found) {
          logger.debug(`    ✅ ${nomComplet} (${inscription.prix}€) → TROUVÉ: ${found.contrepartie_nom} (${found.montant}€)`);
        } else {
          logger.debug(`    ❌ ${nomComplet} (${inscription.prix}€) → NON TROUVÉ dans les ${txToAnalyze.length} transactions envoyées`);

          // Chercher dans toutes les transactions filtrées (avant limite)
          const inFiltered = filteredTransactions.find(tx =>
            tx.contrepartie_nom?.toLowerCase().includes(nom.toLowerCase()) ||
            tx.contrepartie_nom?.toLowerCase().includes(prenom.toLowerCase())
          );

          if (inFiltered) {
            logger.debug(`      ℹ️ Mais trouvé dans filteredTransactions (${filteredTransactions.length} total)`);
          } else {
            // Chercher dans TOUTES les transactions non-matchées
            const inAll = unmatchedTransactions.find(tx =>
              tx.contrepartie_nom?.toLowerCase().includes(nom.toLowerCase()) ||
              tx.contrepartie_nom?.toLowerCase().includes(prenom.toLowerCase())
            );

            if (inAll) {
              const txDate = new Date(inAll.date_execution);
              const eventDate = eventContext ? new Date(eventContext.date_debut) : null;
              const daysDiff = eventDate ? Math.abs((txDate.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

              logger.debug(`      ⚠️ Trouvé dans unmatchedTransactions mais EXCLU par filtre:`);
              logger.debug(`         Date tx: ${txDate.toISOString().split('T')[0]}`);
              logger.debug(`         Date événement: ${eventDate?.toISOString().split('T')[0]}`);
              logger.debug(`         Écart: ${daysDiff?.toFixed(0)} jours`);
              logger.debug(`         Montant: ${inAll.montant}€ (inscription: ${inscription.prix}€)`);
              logger.debug(`         reconciliation_status: ${inAll.reconciliation_status || 'undefined'}`);
              logger.debug(`         matched_entities: ${inAll.matched_entities?.length || 0}`);
            } else {
              logger.debug(`      ❌ NON TROUVÉ dans unmatchedTransactions (${unmatchedTransactions.length} total)`);
            }
          }
        }
      }
      logger.debug('');
    }

    if (txToAnalyze.length === 0) {
      logger.warn('⚠️ Aucune transaction pertinente trouvée après filtrage !');
      return new Map();
    }

    if (onProgress) {
      onProgress(0, txToAnalyze.length, 'Démarrage de l\'analyse IA...');
    }

    // Utiliser la nouvelle méthode batch optimisée (1 seul appel API)
    const aiMatches = await this.analyzeBatchInOneCall(
      txToAnalyze,
      unmatchedInscriptions,
      eventContext,
      onProgress
    );

    return aiMatches;
  }

  /**
   * Analyse BATCH OPTIMISÉE: Toutes les transactions en un seul appel API
   * ⚡ 3-5x plus rapide que les appels séquentiels
   * 💰 Même coût (~$0.01 par transaction)
   */
  async analyzeBatchInOneCall(
    transactions: TransactionBancaire[],
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date },
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<Map<string, AIInscriptionMatchAnalysis>> {
    if (!this.client) {
      throw new Error('API IA non configurée');
    }

    if (onProgress) {
      onProgress(0, transactions.length, 'Préparation du prompt batch...');
    }

    const prompt = this.buildBatchPrompt(transactions, inscriptions, eventContext);

    // DEBUG: Sauvegarder le prompt complet dans la console pour inspection
    logger.debug('\n\n═══════════════════════════════════════════════════════════════');
    logger.debug('📄 PROMPT COMPLET ENVOYÉ À L\'IA (GPT-4o):');
    logger.debug('═══════════════════════════════════════════════════════════════\n');
    logger.debug(prompt);
    logger.debug('\n═══════════════════════════════════════════════════════════════');
    logger.debug('FIN DU PROMPT');
    logger.debug('═══════════════════════════════════════════════════════════════\n\n');

    // Sauvegarder dans localStorage pour récupération facile
    try {
      localStorage.setItem('DEBUG_LAST_AI_PROMPT', prompt);
      localStorage.setItem('DEBUG_LAST_AI_PROMPT_DATE', new Date().toISOString());
      logger.debug('💾 Prompt sauvegardé dans localStorage (clé: DEBUG_LAST_AI_PROMPT)');
      logger.debug('📝 Pour copier le prompt complet, tapez dans la console: copy(localStorage.getItem("DEBUG_LAST_AI_PROMPT"))');
    } catch (e) {
      logger.warn('⚠️ Impossible de sauvegarder dans localStorage:', e);
    }

    if (onProgress) {
      onProgress(1, transactions.length, 'Envoi à l\'IA (analyse en cours)...');
    }

    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 4096 // Plus de tokens pour réponse JSON array
      });

      if (onProgress) {
        onProgress(transactions.length, transactions.length, 'Analyse des résultats...');
      }

      const responseText = completion.choices[0]?.message?.content || '';
      const matches = this.parseBatchResponse(responseText);

      return matches;
    } catch (error) {
      logger.error('Erreur lors de l\'analyse batch IA:', error);
      throw error;
    }
  }

  /**
   * Construit un prompt optimisé pour analyser TOUTES les transactions en une fois
   */
  private buildBatchPrompt(
    transactions: TransactionBancaire[],
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date }
  ): string {
    const eventInfo = eventContext ? `
CONTEXTE ÉVÉNEMENT:
Titre: ${eventContext.titre}
Lieu: ${eventContext.lieu}
Date début: ${new Date(eventContext.date_debut).toISOString().split('T')[0]}
Date fin: ${new Date(eventContext.date_fin).toISOString().split('T')[0]}
` : '';

    // Formater toutes les transactions
    const transactionsInfo = transactions.map((tx, idx) => {
      const txDate = new Date(tx.date_execution).toISOString().split('T')[0];
      return `TX-${idx + 1}. ID: ${tx.id}
  Date: ${txDate}
  Montant: ${tx.montant}€
  Contrepartie: ${tx.contrepartie_nom}
  IBAN: ${tx.contrepartie_iban || 'N/A'}
  Communication: ${tx.communication || 'N/A'}`;
    }).join('\n\n');

    // Formater toutes les inscriptions
    const inscriptionsInfo = inscriptions.map((i, idx) => {
      const dateInsc = i.date_inscription
        ? new Date(i.date_inscription).toISOString().split('T')[0]
        : 'N/A';
      const nomComplet = `${i.membre_prenom || ''} ${i.membre_nom || ''}`.trim();

      return `INS-${idx + 1}. ID: ${i.id}
  Participant: ${nomComplet}
  Montant: ${i.prix}€
  Date inscription: ${dateInsc}
  Licence: ${i.licence || 'N/A'}
  Niveau: ${i.niveau || 'N/A'}`;
    }).join('\n\n');

    return `Tu es un expert comptable belge spécialisé dans la gestion des clubs de plongée. Ton rôle est d'associer PLUSIEURS transactions bancaires à leurs inscriptions d'événement correspondantes EN UNE SEULE ANALYSE.

⚠️ RÈGLE ABSOLUE: NE CRÉER UN MATCH QUE SI TU ES CERTAIN À ≥85%
❌ JAMAIS forcer une correspondance si le nom ne correspond PAS
❌ JAMAIS associer des noms complètement différents

${eventInfo}
═══════════════════════════════════════
TRANSACTIONS BANCAIRES À ANALYSER (${transactions.length}):
═══════════════════════════════════════
${transactionsInfo}

═══════════════════════════════════════
INSCRIPTIONS CANDIDATES (${inscriptions.length} non encore payées):
═══════════════════════════════════════
${inscriptionsInfo}

═══════════════════════════════════════
TÂCHE:
═══════════════════════════════════════
Analyse TOUTES les transactions ci-dessus. Pour CHAQUE transaction, cherche SI ET SEULEMENT SI il existe une inscription dont le NOM correspond.

⚠️ CRITÈRES OBLIGATOIRES pour créer un match:
1. Le NOM doit correspondre EXACTEMENT (même inversé, avec/sans accents, maj/min, avec/sans préfixe M/Mme)
2. Le MONTANT doit être IDENTIQUE (différence maximum 0.50€, PAS PLUS!)
3. ❌ Si différence de montant > 0.50€ → INTERDICTION ABSOLUE de créer un match
4. ❌ Si le nom ne correspond pas → INTERDICTION ABSOLUE de créer un match

EXEMPLES D'ÉCARTS DE MONTANT INTERDITS:
❌ Transaction 12€ vs Inscription 7€ (écart 5€) → PAS DE MATCH
❌ Transaction 24€ vs Inscription 7€ (écart 17€) → PAS DE MATCH
❌ Transaction 15€ vs Inscription 7€ (écart 8€) → PAS DE MATCH
✅ Transaction 7.00€ vs Inscription 7€ (écart 0€) → MATCH VALIDE
✅ Transaction 7.30€ vs Inscription 7€ (écart 0.30€) → MATCH VALIDE

🎯 MÉTHODE SIMPLE ET EFFICACE:
1. Pour chaque transaction, cherche d'abord une inscription avec le MÊME NOM (ignore majuscules/minuscules, ordre des mots)
2. Vérifie que le MONTANT correspond (±0.50€ acceptable)
3. Bonus: Vérifie si la COMMUNICATION contient le nom de l'événement
4. Si tout correspond → VALIDE le match avec haute confiance (≥85%)

Prends en compte:

**EXEMPLES CONCRETS de correspondances FACILES:**

Exemple 1 - MATCH ÉVIDENT (95%):
  Transaction: "DEHOGNE Yves" - 7,00€ - Communication: "gombe 29/08"
  Inscription: "Yves DEHOGNE" - 7,00€ - Événement: "La Gombe"
  → NOM identique (inversé) + MONTANT identique + "gombe" dans communication = MATCH PARFAIT

Exemple 2 - MATCH AVEC VARIATION NOM (90%):
  Transaction: "M PHILIPPE DECAMPS" - 12,60€ - Communication: "Plongée Floreffe"
  Inscription: "Philippe DECAMPS" - 12,60€ - Événement: "Floreffe"
  → Nom similaire (sans M.) + Montant exact + "Floreffe" dans communication = MATCH

Exemple 3 - NOM INVERSÉ (85%):
  Transaction: "LEMAITRE GEOFFROY" - 7,00€ - Communication: "Taxes sejour"
  Inscription: "Geoffroy LEMAITRE" - 7,00€
  → Nom inversé + Montant exact = MATCH (même sans événement dans communication)

**Règles simples:**
- Noms: "DEHOGNE Yves" = "Yves DEHOGNE" = "yves dehogne" = "Y. DEHOGNE" = "DEHOGNE Y"
- Montants: 7,00€ = 7€ = 7.00€ (tolérance ±0.50€)
- Communication: "gombe" correspond à événement "La Gombe", "floreffe" à "Floreffe"
- Ignorer: M., Mme, titres, accents, majuscules/minuscules

**SCORING STRICT:**
- Nom identique (exact ou inversé) + Montant identique (±0.50€) + Communication avec événement → 95-100%
- Nom identique (exact ou inversé) + Montant identique (±0.50€) → 85-95%
- Nom similaire (même famille, initiales) + Montant identique → 75-85%
- ❌ Nom différent → PAS DE MATCH, même si montant identique
- ❌ Montant différent (>1€ d'écart) → PAS DE MATCH, même si nom identique

═══════════════════════════════════════
FORMAT DE RÉPONSE:
═══════════════════════════════════════
Réponds UNIQUEMENT avec un JSON ARRAY contenant UN OBJET PAR MATCH TROUVÉ.

⚠️ RÈGLES DE MATCHING:
- Inclure les matches avec confidence ≥ 75% (bonne certitude)
- Le NOM doit correspondre (même inversé, avec préfixe M/Mme, majuscules différentes)
- Le MONTANT doit être identique (±0.50€ toléré)
- Si aucun match pour une transaction → ne pas l'inclure dans le array
- Format STRICT JSON (pas de texte avant/après, pas de markdown)

EXEMPLES DE CORRESPONDANCES VALIDES:
✅ "M ARTHUR MELARDY" = "MELARDY Arthur" = "Arthur MELARDY" (nom inversé avec préfixe M)
✅ "DEHOGNE Yves" = "Yves DEHOGNE" = "yves dehogne" (nom inversé, casse différente)
✅ "BAUDUIN DOMINIQUE" = "Dominique BAUDUIN" (nom inversé, tout en majuscules)

[
  {
    "transaction_id": "ID_de_la_transaction",
    "inscription_id": "ID_de_l_inscription",
    "confidence": 0-100,
    "reasoning": "Explication détaillée: nom détecté 'XXX' correspond à participant 'YYY' (similarité 95%), montant exact XX.XX€, date écart X jours",
    "extracted_info": {
      "participant_nom": "nom extrait de la transaction",
      "montant_detecte": montant_en_nombre,
      "keywords": ["mot1", "mot2"]
    }
  }
]

Si AUCUN match n'est trouvé pour toutes les transactions, retourne un array vide: []`;
  }

  /**
   * Parse la réponse batch de l'IA (JSON array)
   */
  private parseBatchResponse(responseText: string): Map<string, AIInscriptionMatchAnalysis> {
    const results = new Map<string, AIInscriptionMatchAnalysis>();

    try {
      logger.debug('📄 Réponse IA brute:', responseText.substring(0, 500));

      // Méthode 1: Chercher un JSON array complet avec regex amélioré
      let jsonText = '';

      // Trouver le premier [ et le dernier ]
      const firstBracket = responseText.indexOf('[');
      const lastBracket = responseText.lastIndexOf(']');

      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonText = responseText.substring(firstBracket, lastBracket + 1);
      } else {
        logger.warn('❌ Pas de JSON array trouvé dans la réponse IA');
        logger.debug('Réponse complète:', responseText);
        return results;
      }

      // Nettoyer le JSON (enlever les backticks markdown si présents)
      jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '');

      logger.debug('🔍 JSON extrait:', jsonText.substring(0, 300));

      const parsed = JSON.parse(jsonText);

      if (!Array.isArray(parsed)) {
        logger.error('❌ La réponse IA n\'est pas un array');
        return results;
      }

      logger.debug(`📊 IA a retourné ${parsed.length} résultat(s)`);

      // Convertir chaque match
      for (const item of parsed) {
        if (!item.transaction_id || !item.inscription_id || item.confidence < 50) {
          logger.debug('⚠️ Match ignoré (invalide ou confiance < 50%):', item);
          continue;
        }

        results.set(item.transaction_id, {
          inscription_id: item.inscription_id,
          confidence: item.confidence,
          reasoning: item.reasoning || '',
          extracted_info: item.extracted_info || {}
        });
      }

      logger.debug(`✅ Batch AI: ${results.size} matches trouvés (${parsed.length - results.size} ignorés)`);
      return results;

    } catch (error) {
      logger.error('❌ Erreur parsing réponse batch IA:', error);
      logger.debug('Réponse complète qui a échoué:', responseText);
      return results;
    }
  }

  /**
   * Analyse une seule transaction
   */
  async analyzeSingleTransaction(
    clubId: string,
    eventId: string,
    userId: string,
    transaction: TransactionBancaire,
    inscriptions: InscriptionEvenement[],
    eventContext?: { titre: string; lieu: string; date_debut: Date; date_fin: Date }
  ): Promise<string | null> {
    const analysis = await this.analyzeTransactionMatch(transaction, inscriptions, eventContext);

    if (!analysis) {
      return null;
    }

    // Sauvegarder dans Firebase
    const matchId = await AIMatchStorageService.saveMatch(
      clubId,
      transaction.id,
      analysis.inscription_id,
      analysis.confidence,
      analysis.reasoning,
      userId,
      'inscription'
    );

    return matchId;
  }
}
