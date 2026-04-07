import { logger } from '@/utils/logger';
/**
 * AI Categorization Service
 *
 * Uses OpenAI GPT-4o for semantic analysis of bank transactions
 * when keyword-based matching doesn't achieve high confidence.
 *
 * Integration: Called as Step 3 fallback in the categorization pipeline
 * when patterns and rules score below threshold.
 */

import OpenAI from 'openai';
import { TransactionBancaire } from '@/types';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { DEFAULT_CATEGORIES } from './categorizationService';

// ============================================================================
// TYPES
// ============================================================================

export interface AICategorizationResult {
  category: string;
  accountCode: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    category: string;
    accountCode: string;
    confidence: number;
  }>;
}

export interface AIExplanation {
  summary: string;
  signals: string[];
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// SERVICE
// ============================================================================

export class AICategorizationService {
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
   * Check if AI is available
   */
  isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Analyze a transaction semantically to determine the best category and account code
   */
  async analyzeTransaction(
    transaction: TransactionBancaire
  ): Promise<AICategorizationResult | null> {
    if (!this.client) {
      logger.warn('AI Categorization: OpenAI API key not configured');
      return null;
    }

    const prompt = this.buildCategorizationPrompt(transaction);

    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o',
        messages: [{
          role: 'user',
          content: prompt
        }],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content || '';
      return this.parseAIResponse(responseText);
    } catch (error) {
      logger.error('AI Categorization error:', error);
      return null;
    }
  }

  /**
   * Generate a natural language explanation for a suggestion
   */
  async explainSuggestion(
    transaction: TransactionBancaire,
    suggestedCategory: string,
    suggestedCode: string,
    score: number
  ): Promise<AIExplanation | null> {
    if (!this.client) {
      return null;
    }

    const accountCode = AccountCodeService.isReady()
      ? AccountCodeService.getByCode(suggestedCode)
      : calypsoAccountCodes.find(c => c.code === suggestedCode);
    const category = DEFAULT_CATEGORIES.find(c => c.id === suggestedCategory);

    const prompt = `Tu es un expert comptable pour un club de plongée belge.

Transaction:
- Communication: "${transaction.communication || 'N/A'}"
- Montant: ${transaction.montant}€
- Bénéficiaire/Payeur: ${transaction.contrepartie_nom || 'N/A'}
- Date: ${transaction.date_execution}

Suggestion système:
- Catégorie: ${category?.nom || suggestedCategory}
- Code comptable: ${suggestedCode} (${accountCode?.label || ''})
- Score de confiance: ${score}%

TÂCHE: Explique EN FRANÇAIS et de manière concise (1-2 phrases max) pourquoi cette catégorisation est probablement correcte. Mentionne les indices clés.

Réponds en JSON:
{
  "summary": "Explication courte de la catégorisation",
  "signals": ["indice 1", "indice 2"],
  "confidence": "high" | "medium" | "low"
}`;

    try {
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini', // Utiliser mini pour les explications (moins cher)
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 256,
        response_format: { type: 'json_object' }
      });

      const responseText = completion.choices[0]?.message?.content || '';
      const parsed = JSON.parse(responseText);

      return {
        summary: parsed.summary || '',
        signals: parsed.signals || [],
        confidence: parsed.confidence || 'medium'
      };
    } catch (error) {
      logger.error('AI Explanation error:', error);
      return null;
    }
  }

  /**
   * Batch analyze multiple transactions (optimized for cost)
   */
  async analyzeBatch(
    transactions: TransactionBancaire[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, AICategorizationResult>> {
    const results = new Map<string, AICategorizationResult>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];

      if (onProgress) {
        onProgress(i + 1, transactions.length);
      }

      try {
        const analysis = await this.analyzeTransaction(tx);
        if (analysis && analysis.confidence >= 50) {
          results.set(tx.id, analysis);
        }

        // Rate limiting: 500ms delay between calls
        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        logger.error(`AI analysis error for transaction ${tx.id}:`, error);
      }
    }

    return results;
  }

  /**
   * Build the categorization prompt for GPT-4o
   */
  private buildCategorizationPrompt(transaction: TransactionBancaire): string {
    const isExpense = transaction.montant < 0;
    const absAmount = Math.abs(transaction.montant);

    // Get relevant account codes
    const allCodes = AccountCodeService.isReady()
      ? AccountCodeService.getActiveCodes()
      : calypsoAccountCodes;
    const accountCodes = allCodes
      .filter(c => isExpense ? c.type === 'expense' : c.type === 'revenue')
      .slice(0, 30) // Limit to keep prompt size manageable
      .map(c => `${c.code}: ${c.label}`)
      .join('\n');

    // Get relevant categories
    const categories = DEFAULT_CATEGORIES
      .filter(c => isExpense ? c.type === 'depense' : c.type === 'revenu')
      .map(c => `${c.id}: ${c.nom}`)
      .join('\n');

    return `Tu es un expert comptable spécialisé dans les clubs de plongée belges (ASBL/VZW).

TRANSACTION À CATÉGORISER:
- Type: ${isExpense ? 'DÉPENSE (sortie d\'argent)' : 'RECETTE (entrée d\'argent)'}
- Montant: ${absAmount.toFixed(2)}€
- Communication: "${transaction.communication || 'N/A'}"
- Bénéficiaire/Payeur: ${transaction.contrepartie_nom || 'N/A'}
- IBAN: ${transaction.contrepartie_iban || 'N/A'}
- Date: ${transaction.date_execution}
- Détails supplémentaires: ${transaction.details || 'N/A'}

CATÉGORIES DISPONIBLES:
${categories}

CODES COMPTABLES DISPONIBLES (${isExpense ? 'dépenses' : 'recettes'}):
${accountCodes}

CONTEXTE CLUB DE PLONGÉE:
- Cotisations membres: 180-220€ (annuelles), 70-85€ (enfants)
- Sorties plongée: 800-1500€ (voyages), 50-150€ (journées)
- Piscine: 200-400€/mois location
- Matériel: détendeurs, gilets, bouteilles
- Assurances: Ethias, Lifras
- Événements: Calyfiesta (fête annuelle)

TÂCHE:
Analyse la transaction et détermine la catégorie et le code comptable les plus appropriés.

IMPORTANT:
1. Cherche des mots-clés dans la communication (cotisation, plongée, piscine, etc.)
2. Le montant peut indiquer le type (180€ = cotisation adulte, 70€ = cotisation enfant)
3. Le bénéficiaire/payeur donne des indices (Ethias = assurance, Lifras = fédération)
4. Considère le contexte saisonnier (jan-fév = cotisations, été = voyages)

Réponds UNIQUEMENT en JSON valide:
{
  "category": "ID_catégorie",
  "accountCode": "XXX-XX-XXX",
  "confidence": 0-100,
  "reasoning": "Explication détaillée de ton analyse",
  "alternatives": [
    {"category": "autre_id", "accountCode": "XXX-XX-XXX", "confidence": 0-100}
  ]
}

Si tu ne peux pas déterminer avec confiance (< 50%), retourne confidence: 0.`;
  }

  /**
   * Parse the AI response
   */
  private parseAIResponse(responseText: string): AICategorizationResult | null {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        logger.error('No JSON found in AI response');
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate response
      if (!parsed.category || !parsed.accountCode || parsed.confidence < 50) {
        return null;
      }

      return {
        category: parsed.category,
        accountCode: parsed.accountCode,
        confidence: Math.min(parsed.confidence, 100),
        reasoning: parsed.reasoning || '',
        alternatives: parsed.alternatives || []
      };
    } catch (error) {
      logger.error('Error parsing AI response:', error);
      return null;
    }
  }
}

// Export singleton instance
export const aiCategorizationService = new AICategorizationService();
