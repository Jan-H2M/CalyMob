import { TransactionBancaire, DemandeRemboursement } from '@/types';
import OpenAI from 'openai';
import { AIMatchStorageService } from './aiMatchStorageService';

export interface AIMatchAnalysis {
  demande_id: string;
  confidence: number;
  reasoning: string;
  extracted_info: {
    beneficiaire?: string;
    montant_detecte?: number;
    date_detectee?: string;
    keywords?: string[];
  };
}

/**
 * Service de matching avec intelligence artificielle pour les cas difficiles
 */
export class AIExpenseMatchingService {
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
   * Analyse une transaction avec l'IA pour trouver la meilleure correspondance
   */
  async analyzeTransactionMatch(
    transaction: TransactionBancaire,
    demandes: DemandeRemboursement[]
  ): Promise<AIMatchAnalysis | null> {
    if (!this.client) {
      throw new Error('API IA non configurée');
    }

    // Construire le prompt avec les informations de la transaction et des demandes
    const prompt = this.buildMatchingPrompt(transaction, demandes);

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

      // Parser la réponse JSON
      const analysis = this.parseAIResponse(responseText);

      return analysis;
    } catch (error) {
      console.error('Erreur lors de l\'analyse IA:', error);
      return null;
    }
  }

  /**
   * Construit le prompt pour Claude
   */
  private buildMatchingPrompt(
    transaction: TransactionBancaire,
    demandes: DemandeRemboursement[]
  ): string {
    const txDate = new Date(transaction.date_execution).toISOString().split('T')[0];

    const demandesInfo = demandes.map((d, idx) => {
      const dateApp = d.date_approbation
        ? new Date(d.date_approbation).toISOString().split('T')[0]
        : 'N/A';

      return `${idx + 1}. ID: ${d.id}
   Demandeur: ${d.demandeur_nom || ''} ${d.demandeur_prenom || ''}
   Montant: ${d.montant}€
   Description: ${d.description || 'N/A'}
   Date approbation: ${dateApp}
   Catégorie: ${d.categorie || 'N/A'}`;
    }).join('\n\n');

    return `Tu es un expert comptable belge spécialisé dans la réconciliation bancaire. Ton rôle est d'associer une transaction bancaire de remboursement à la bonne demande de remboursement.

TRANSACTION BANCAIRE À ANALYSER:
Date: ${txDate}
Montant: ${transaction.montant}€ (sortie d'argent)
Bénéficiaire: ${transaction.contrepartie_nom}
IBAN bénéficiaire: ${transaction.contrepartie_iban || 'N/A'}
Communication: ${transaction.communication || 'N/A'}
Détails: ${transaction.details || 'N/A'}

DEMANDES DE REMBOURSEMENT CANDIDATES (approuvées, non remboursées):
${demandesInfo}

TÂCHE:
Analyse la transaction bancaire et trouve la demande de remboursement qui correspond le mieux. Prends en compte:
- Le montant (doit être très proche)
- Le nom du bénéficiaire vs le nom du demandeur
- La communication bancaire (peut contenir des indices)
- La date (remboursement généralement après approbation)
- La description de la demande

IMPORTANT:
- Le montant de la transaction est NÉGATIF (sortie), compare avec la VALEUR ABSOLUE
- Les noms peuvent être mal orthographiés ou incomplets
- Cherche des mots-clés dans la communication
- Une date de remboursement peut être plusieurs semaines après l'approbation

Réponds UNIQUEMENT avec un JSON valide dans ce format exact:
{
  "demande_id": "ID_de_la_demande" ou null,
  "confidence": 0-100,
  "reasoning": "explication détaillée de ton analyse",
  "extracted_info": {
    "beneficiaire": "nom extrait de la transaction",
    "montant_detecte": montant_en_nombre,
    "keywords": ["mot1", "mot2"]
  }
}

Si aucune correspondance acceptable n'est trouvée (confidence < 50), retourne demande_id: null.`;
  }

  /**
   * Parse la réponse de Claude
   */
  private parseAIResponse(responseText: string): AIMatchAnalysis | null {
    try {
      // Extraire le JSON de la réponse (au cas où il y a du texte avant/après)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('Pas de JSON trouvé dans la réponse IA');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validation
      if (parsed.demande_id === null || parsed.confidence < 50) {
        return null;
      }

      return {
        demande_id: parsed.demande_id,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning || '',
        extracted_info: parsed.extracted_info || {}
      };
    } catch (error) {
      console.error('Erreur parsing réponse IA:', error);
      return null;
    }
  }

  /**
   * Analyse batch de plusieurs transactions
   */
  async analyzeBatch(
    transactions: TransactionBancaire[],
    demandes: DemandeRemboursement[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, AIMatchAnalysis>> {
    const results = new Map<string, AIMatchAnalysis>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      if (onProgress) {
        onProgress(i + 1, transactions.length);
      }

      try {
        const analysis = await this.analyzeTransactionMatch(tx, demandes);
        if (analysis) {
          results.set(tx.id, analysis);
        }

        // Petit délai pour éviter de surcharger l'API
        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Erreur analyse IA transaction ${tx.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Combine le matching classique avec l'IA
   * Utilise l'IA seulement pour les transactions non matchées par les règles classiques
   * Sauvegarde automatiquement les résultats dans Firebase
   */
  async hybridMatching(
    clubId: string,
    userId: string,
    unmatchedTransactions: TransactionBancaire[],
    unmatchedDemandes: DemandeRemboursement[],
    maxTransactionsToAnalyze: number = 20,
    onProgress?: (current: number, total: number, message: string) => void
  ): Promise<Map<string, AIMatchAnalysis>> {
    // Limiter le nombre de transactions à analyser (coût API)
    const txToAnalyze = unmatchedTransactions.slice(0, maxTransactionsToAnalyze);

    if (onProgress) {
      onProgress(0, txToAnalyze.length, 'Démarrage de l\'analyse IA...');
    }

    const aiMatches = await this.analyzeBatch(
      txToAnalyze,
      unmatchedDemandes,
      (current, total) => {
        if (onProgress) {
          onProgress(current, total, `Analyse IA: ${current}/${total} transactions`);
        }
      }
    );

    // Sauvegarder les résultats dans Firebase
    if (onProgress) {
      onProgress(txToAnalyze.length, txToAnalyze.length, 'Sauvegarde dans Firebase...');
    }

    for (const [transactionId, analysis] of aiMatches.entries()) {
      try {
        await AIMatchStorageService.saveMatch(
          clubId,
          transactionId,
          analysis.demande_id,
          analysis.confidence,
          analysis.reasoning,
          userId
        );
      } catch (error) {
        console.error(`Erreur sauvegarde match ${transactionId}:`, error);
      }
    }

    return aiMatches;
  }

  /**
   * Analyse une seule transaction et sauvegarde dans Firebase
   */
  async analyzeSingleTransaction(
    clubId: string,
    userId: string,
    transaction: TransactionBancaire,
    demandes: DemandeRemboursement[]
  ): Promise<string | null> {
    const analysis = await this.analyzeTransactionMatch(transaction, demandes);

    if (!analysis) {
      return null;
    }

    // Sauvegarder dans Firebase
    const matchId = await AIMatchStorageService.saveMatch(
      clubId,
      transaction.id,
      analysis.demande_id,
      analysis.confidence,
      analysis.reasoning,
      userId
    );

    return matchId;
  }
}
