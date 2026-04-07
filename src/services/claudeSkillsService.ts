import { logger } from '@/utils/logger';
import { AI_MODELS } from '@/config/aiModels';
/**
 * Claude Skills Service
 *
 * Service pour générer des rapports Excel professionnels avec Claude Skills API
 * Utilise les clés API stockées dans Firebase
 */

import { aiProviderService } from './aiProviderService';
import type { TransactionBancaire } from '@/types';

interface ExcelGenerationOptions {
  filename?: string;
  includeFormulas?: boolean;
  autoOpen?: boolean;
}

interface FileInfo {
  id: string;
  filename: string;
  size_bytes: number;
}

/**
 * Extract file IDs from Claude Skills response
 */
function extractFileIds(response: any): FileInfo[] {
  const fileIds: FileInfo[] = [];

  for (const item of response.content) {
    if (item.type === 'bash_code_execution_tool_result') {
      const bashResult = item.content;

      if (bashResult?.content && Array.isArray(bashResult.content)) {
        for (const contentItem of bashResult.content) {
          // Check for bash_code_execution_output with file_id
          if (contentItem.type === 'bash_code_execution_output' && contentItem.file_id) {
            fileIds.push({
              id: contentItem.file_id,
              filename: contentItem.filename || 'rapport.xlsx',
              size_bytes: 0 // Will be fetched from metadata
            });
          }
        }
      }
    }
  }

  return fileIds;
}

/**
 * Download file from Claude container using Files API
 */
async function downloadFile(
  client: any,
  fileId: string
): Promise<{ blob: Blob; metadata: any }> {
  // Get metadata
  const metadata = await client.beta.files.retrieveMetadata(fileId, {
    betas: ['files-api-2025-04-14']
  });

  // Download content
  const downloadResponse = await client.beta.files.download(fileId, {
    betas: ['files-api-2025-04-14']
  });

  const blob = await downloadResponse.blob();

  return { blob, metadata };
}

export class ClaudeSkillsService {
  /**
   * Générer un rapport Excel des transactions avec Claude Skills
   */
  static async generateTransactionsReport(
    transactions: TransactionBancaire[],
    options: ExcelGenerationOptions = {}
  ): Promise<Blob> {
    const client = aiProviderService.getAnthropicClient();

    if (!client) {
      throw new Error('Client Anthropic non initialisé. Vérifiez que la clé API est configurée dans les paramètres.');
    }

    // Calculer statistiques
    const inkomsten = transactions.filter(t => t.montant > 0);
    const uitgaven = transactions.filter(t => t.montant < 0);
    const totalInkomen = inkomsten.reduce((sum, t) => sum + t.montant, 0);
    const totalUitgaven = Math.abs(uitgaven.reduce((sum, t) => sum + t.montant, 0));
    const nettoResultaat = totalInkomen - totalUitgaven;

    // Préparer données pour le prompt
    const transactionsData = transactions.map(t => ({
      date: t.date_execution instanceof Date
        ? t.date_execution.toISOString().split('T')[0]
        : new Date(t.date_execution).toISOString().split('T')[0],
      type: t.montant > 0 ? 'Inkomen' : 'Uitgave',
      contrepartie: t.contrepartie_nom || 'Inconnu',
      montant: t.montant.toFixed(2),
      communication: t.communication || ''
    }));

    const filename = options.filename || 'calypso_rapport_transactions.xlsx';

    // Prompt pour Claude
    const prompt = `Crée un rapport financier professionnel Excel pour CALYPSO DIVING CLUB.

**IMPORTANT**: À la fin, exporte le fichier pour download.

**Sheet 1: Overzicht**
- Titre: "CALYPSO DIVING CLUB"
- Sous-titre: "Financieel Rapport Transacties"
- Logo placeholder: "[LOGO]"

Résumé:
- Totaal Inkomsten: €${totalInkomen.toFixed(2)}
- Totaal Uitgaven: €${totalUitgaven.toFixed(2)}
- Netto Resultaat: €${nettoResultaat.toFixed(2)}

**Sheet 2: Transacties**
Colonnes: Datum | Type | Contrepartie | Bedrag (€) | Communicatie

Données (${transactionsData.length} lignes):
${transactionsData.slice(0, 100).map(t =>
  `${t.date} | ${t.type} | ${t.contrepartie} | ${t.montant} | ${t.communication}`
).join('\n')}

${transactionsData.length > 100 ? `\n... et ${transactionsData.length - 100} autres transactions\n` : ''}

Dernière ligne: TOTAAL avec formule SUM

**Formatting professionnel:**
1. Headers: Bleu #4472C4, texte blanc, gras
2. Montants positifs: Vert #00B050
3. Montants négatifs: Rouge #C00000
4. Format Euro: €#,##0.00
5. Ligne totale: Gras, double border
6. Auto-filter
7. Largeurs: A=12, B=10, C=25, D=12, E=30

Sauvegarde comme "${filename}" et exécute recalc.py pour calculer les formules.`;

    try {
      logger.debug('🚀 Génération rapport Excel avec Claude Skills...');

      // Appeler Claude Skills
      const response = await client.beta.messages.create({
        model: AI_MODELS.skills,
        max_tokens: 16384,
        betas: [
          'code-execution-2025-08-25',
          'skills-2025-10-02',
          'files-api-2025-04-14'
        ],
        container: {
          skills: [{ type: 'anthropic', skill_id: 'xlsx', version: 'latest' }]
        },
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        messages: [{ role: 'user', content: prompt }]
      });

      logger.debug('✅ Réponse reçue de Claude');

      // Extraire file IDs
      const fileInfos = extractFileIds(response);

      if (fileInfos.length === 0) {
        throw new Error('Aucun fichier généré par Claude');
      }

      logger.debug(`📥 Téléchargement: ${fileInfos[0].filename}`);

      // Télécharger le fichier
      const { blob, metadata } = await downloadFile(client, fileInfos[0].id);

      logger.debug(`✅ Fichier téléchargé: ${metadata.filename} (${(metadata.size_bytes / 1024).toFixed(2)} KB)`);

      // Statistiques API
      if (response.usage) {
        logger.debug(`📊 Tokens utilisés: ${response.usage.input_tokens} input, ${response.usage.output_tokens} output`);
      }

      return blob;
    } catch (error) {
      logger.error('❌ Erreur lors de la génération du rapport:', error);
      throw error;
    }
  }

  /**
   * Générer un rapport mensuel
   */
  static async generateMonthlyReport(
    clubId: string,
    year: number,
    month: number
  ): Promise<Blob> {
    // TODO: Implémenter
    // 1. Charger transactions du mois
    // 2. Générer rapport avec Claude Skills
    // 3. Retourner Blob
    throw new Error('Not implemented yet');
  }

  /**
   * Générer un rapport annuel
   */
  static async generateAnnualReport(
    clubId: string,
    year: number
  ): Promise<Blob> {
    // TODO: Implémenter
    throw new Error('Not implemented yet');
  }

  /**
   * Vérifier si Claude Skills est disponible
   */
  static isAvailable(): boolean {
    return aiProviderService.isProviderAvailable('anthropic');
  }

  /**
   * Tester la connexion Claude
   */
  static async testConnection(): Promise<{ success: boolean; message: string }> {
    return aiProviderService.testAnthropicConnection();
  }
}
