/**
 * Claude Document Service
 *
 * Handles document generation (Excel, PowerPoint, PDF) using Anthropic Claude Skills API.
 * Uses Claude Sonnet 4.5 with code execution and file creation capabilities.
 */

import Anthropic from '@anthropic-ai/sdk';
import { aiProviderService } from './aiProviderService';

export interface ClaudeGenerationOptions {
  includeCharts?: boolean;
  includeInsights?: boolean;
  includeForecasts?: boolean;
  language?: 'fr' | 'nl' | 'en';
  clubName?: string;
  logoUrl?: string;
}

export interface ClaudeGenerationProgress {
  step: string;
  percent: number;
  message?: string;
}

export type ClaudeDocumentFormat = 'excel' | 'pptx' | 'pdf' | 'docx';

export interface ClaudeGenerationResult {
  success: boolean;
  files?: {
    excel?: Blob;
    pptx?: Blob;
    pdf?: Blob;
    docx?: Blob;
  };
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
  };
  costEstimate?: number;
}

/**
 * Claude Document Service Class
 */
class ClaudeDocumentService {
  private client: Anthropic | null = null;

  /**
   * Initialize Claude client from aiProviderService
   */
  private initializeClient(): boolean {
    this.client = aiProviderService.getAnthropicClient();
    return this.client !== null;
  }

  /**
   * Check if Claude is available
   */
  isAvailable(): boolean {
    return aiProviderService.isProviderAvailable('anthropic');
  }

  /**
   * Extract file IDs from Claude Skills API response
   * According to official Anthropic documentation:
   * Files are returned in bash_code_execution_tool_result blocks
   */
  private extractFileIds(response: any): string[] {
    const fileIds: string[] = [];

    for (const item of response.content) {
      if (item.type === 'bash_code_execution_tool_result') {
        const contentItem = item.content;

        // Check if contentItem has the expected structure
        if (contentItem?.type === 'bash_code_execution_result') {
          // contentItem.content is an array of outputs
          if (Array.isArray(contentItem.content)) {
            for (const file of contentItem.content) {
              // Each file object may have a file_id
              if (file?.file_id) {
                fileIds.push(file.file_id);
                console.log('✅ Found file_id:', file.file_id);
              }
            }
          }
        }
      }
    }

    return fileIds;
  }

  /**
   * Extract base64 output from Claude bash execution (CORS workaround)
   * Looks for base64 string in bash output to avoid Files API CORS issues
   */
  private extractBase64FromBash(response: any): string | null {
    console.log('🔍 Searching for base64 in response content...');

    for (const item of response.content) {
      if (item.type === 'bash_code_execution_tool_result') {
        const contentItem = item.content;
        console.log('📦 Found bash_code_execution_tool_result, contentItem:', contentItem);

        if (contentItem?.type === 'bash_code_execution_result') {
          // According to official docs, stdout contains the output
          if (contentItem.stdout) {
            const stdout = contentItem.stdout;
            console.log('📤 Found stdout (length:', stdout.length, ')');
            console.log('   - Preview (first 200 chars):', stdout.substring(0, 200));

            // Remove all whitespace and newlines from stdout
            const cleanedStdout = stdout.replace(/\s+/g, '');

            // Base64 strings contain only A-Z, a-z, 0-9, +, /, =
            // Excel files are typically 5KB-500KB, so base64 is 7KB-700KB
            // Look for large base64 pattern (at least 1000 chars for Excel file)
            const base64Match = cleanedStdout.match(/^([A-Za-z0-9+/]{1000,}={0,2})$/);
            if (base64Match) {
              console.log('✅ Found base64 in stdout (length:', base64Match[1].length, ')');
              return base64Match[1];
            }

            // Also try to find base64 within stdout (may have surrounding text)
            const base64InTextMatch = stdout.match(/([A-Za-z0-9+/\n\r]{1000,}={0,2})/);
            if (base64InTextMatch) {
              const cleanedBase64 = base64InTextMatch[1].replace(/[\n\r\s]/g, '');
              if (cleanedBase64.length >= 1000) {
                console.log('✅ Found base64 within stdout (length:', cleanedBase64.length, ')');
                return cleanedBase64;
              }
            }

            console.log('⚠️ stdout found but no base64 detected. Content:', stdout.substring(0, 500));
          }

          // Fallback: Check content array (old structure)
          if (Array.isArray(contentItem.content)) {
            console.log('📋 Checking', contentItem.content.length, 'content items...');

            for (const output of contentItem.content) {
              console.log('   - Output type:', output?.type, 'has text:', !!output?.text);

              // Look for text output containing base64
              if (output?.type === 'text' && output?.text) {
                const text = output.text;
                console.log('   - Text preview (first 200 chars):', text.substring(0, 200));

                // Remove all whitespace and newlines from text
                const cleanedText = text.replace(/\s+/g, '');

                // Look for large base64 pattern
                const base64Match = cleanedText.match(/^([A-Za-z0-9+/]{1000,}={0,2})$/);
                if (base64Match) {
                  console.log('✅ Found base64 in content array (length:', base64Match[1].length, ')');
                  return base64Match[1];
                }

                // Also try to find base64 within the text
                const base64InTextMatch = text.match(/([A-Za-z0-9+/\n\r]{1000,}={0,2})/);
                if (base64InTextMatch) {
                  const cleanedBase64 = base64InTextMatch[1].replace(/[\n\r\s]/g, '');
                  if (cleanedBase64.length >= 1000) {
                    console.log('✅ Found base64 within content array text (length:', cleanedBase64.length, ')');
                    return cleanedBase64;
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log('❌ No base64 output found in bash results');
    console.log('📄 Full response structure:', JSON.stringify(response, null, 2));
    return null;
  }

  /**
   * Convert base64 string to Blob
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    // Decode base64 to binary string
    const binaryString = atob(base64);

    // Convert binary string to byte array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Create blob
    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Generate Excel document using Claude Skills API
   */
  async generateExcel(
    prompt: string,
    options?: ClaudeGenerationOptions,
    onProgress?: (progress: ClaudeGenerationProgress) => void
  ): Promise<Blob | null> {
    if (!this.initializeClient() || !this.client) {
      throw new Error('Claude API non configurée. Veuillez ajouter votre clé API Anthropic dans les paramètres.');
    }

    try {
      if (onProgress) {
        onProgress({ step: 'Génération Excel', percent: 10, message: 'Envoi de la requête à Claude...' });
      }

      const response = await this.client.beta.messages.create({
        model: 'claude-sonnet-4-5-20250929',
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
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (onProgress) {
        onProgress({ step: 'Génération Excel', percent: 70, message: 'Traitement de la réponse...' });
      }

      // CORS Workaround: Try base64 extraction first
      const base64 = this.extractBase64FromBash(response);
      if (base64) {
        console.log('📦 Using base64 from bash output (CORS workaround)');

        if (onProgress) {
          onProgress({ step: 'Conversion', percent: 90, message: 'Conversion du fichier...' });
        }

        const blob = this.base64ToBlob(
          base64,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        if (onProgress) {
          onProgress({ step: 'Terminé', percent: 100, message: 'Excel généré avec succès!' });
        }

        return blob;
      }

      // Fallback: Use Files API (may fail with CORS in browser)
      console.log('⚠️ No base64 found, falling back to Files API (may fail with CORS)...');
      const fileIds = this.extractFileIds(response);
      if (fileIds.length === 0) {
        console.error('No file_id or base64 in Claude response:', response);
        throw new Error('Claude n\'a pas généré de fichier. Réponse: ' + JSON.stringify(response.content));
      }

      const fileId = fileIds[0];
      console.log('📥 Downloading Excel file_id:', fileId);

      if (onProgress) {
        onProgress({ step: 'Téléchargement', percent: 90, message: 'Téléchargement du fichier Excel...' });
      }

      // Download file using Files API (with beta flag)
      const fileBlob = await this.client.beta.files.download(fileId, {
        betas: ['files-api-2025-04-14']
      });

      // Convert Response to Blob
      const arrayBuffer = await fileBlob.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      if (onProgress) {
        onProgress({ step: 'Terminé', percent: 100, message: 'Excel généré avec succès!' });
      }

      return blob;
    } catch (error) {
      console.error('Error generating Excel with Claude:', error);
      throw error;
    }
  }

  /**
   * Generate PowerPoint document using Claude Skills API
   */
  async generatePowerPoint(
    prompt: string,
    options?: ClaudeGenerationOptions,
    onProgress?: (progress: ClaudeGenerationProgress) => void
  ): Promise<Blob | null> {
    if (!this.initializeClient() || !this.client) {
      throw new Error('Claude API non configurée. Veuillez ajouter votre clé API Anthropic dans les paramètres.');
    }

    try {
      if (onProgress) {
        onProgress({ step: 'Génération PowerPoint', percent: 10, message: 'Envoi de la requête à Claude...' });
      }

      const response = await this.client.beta.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16384,
        betas: [
          'code-execution-2025-08-25',
          'skills-2025-10-02',
          'files-api-2025-04-14'
        ],
        container: {
          skills: [{ type: 'anthropic', skill_id: 'pptx', version: 'latest' }]
        },
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (onProgress) {
        onProgress({ step: 'Génération PowerPoint', percent: 70, message: 'Traitement de la réponse...' });
      }

      // Extract file_id from response using official method
      const fileIds = this.extractFileIds(response);
      if (fileIds.length === 0) {
        console.error('No file_id in Claude response:', response);
        throw new Error('Claude n\'a pas généré de fichier. Réponse: ' + JSON.stringify(response.content));
      }

      const fileId = fileIds[0]; // Take first file
      console.log('📥 Downloading PowerPoint file_id:', fileId);

      if (onProgress) {
        onProgress({ step: 'Téléchargement', percent: 90, message: 'Téléchargement du PowerPoint...' });
      }

      // Download file using Files API (with beta flag)
      const fileBlob = await this.client.beta.files.download(fileId, {
        betas: ['files-api-2025-04-14']
      });

      // Convert Response to Blob
      const arrayBuffer = await fileBlob.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });

      if (onProgress) {
        onProgress({ step: 'Terminé', percent: 100, message: 'PowerPoint généré avec succès!' });
      }

      return blob;
    } catch (error) {
      console.error('Error generating PowerPoint with Claude:', error);
      throw error;
    }
  }

  /**
   * Generate PDF document using Claude Skills API
   */
  async generatePDF(
    prompt: string,
    options?: ClaudeGenerationOptions,
    onProgress?: (progress: ClaudeGenerationProgress) => void
  ): Promise<Blob | null> {
    if (!this.initializeClient() || !this.client) {
      throw new Error('Claude API non configurée. Veuillez ajouter votre clé API Anthropic dans les paramètres.');
    }

    try {
      if (onProgress) {
        onProgress({ step: 'Génération PDF', percent: 10, message: 'Envoi de la requête à Claude...' });
      }

      const response = await this.client.beta.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16384,
        betas: [
          'code-execution-2025-08-25',
          'skills-2025-10-02',
          'files-api-2025-04-14'
        ],
        container: {
          skills: [{ type: 'anthropic', skill_id: 'pdf', version: 'latest' }]
        },
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (onProgress) {
        onProgress({ step: 'Génération PDF', percent: 70, message: 'Traitement de la réponse...' });
      }

      // Extract file_id from response using official method
      const fileIds = this.extractFileIds(response);
      if (fileIds.length === 0) {
        console.error('No file_id in Claude response:', response);
        throw new Error('Claude n\'a pas généré de fichier. Réponse: ' + JSON.stringify(response.content));
      }

      const fileId = fileIds[0]; // Take first file
      console.log('📥 Downloading PDF file_id:', fileId);

      if (onProgress) {
        onProgress({ step: 'Téléchargement', percent: 90, message: 'Téléchargement du PDF...' });
      }

      // Download file using Files API (with beta flag)
      const fileBlob = await this.client.beta.files.download(fileId, {
        betas: ['files-api-2025-04-14']
      });

      // Convert Response to Blob
      const arrayBuffer = await fileBlob.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });

      if (onProgress) {
        onProgress({ step: 'Terminé', percent: 100, message: 'PDF généré avec succès!' });
      }

      return blob;
    } catch (error) {
      console.error('Error generating PDF with Claude:', error);
      throw error;
    }
  }

  /**
   * Generate Word document using Claude Skills API with base64 output
   */
  async generateWord(
    prompt: string,
    options?: ClaudeGenerationOptions,
    onProgress?: (progress: ClaudeGenerationProgress) => void
  ): Promise<Blob | null> {
    if (!this.initializeClient() || !this.client) {
      throw new Error('Claude API non configurée. Veuillez ajouter votre clé API Anthropic dans les paramètres.');
    }

    try {
      if (onProgress) {
        onProgress({ step: 'Génération Word', percent: 10, message: 'Envoi de la requête à Claude...' });
      }

      const response = await this.client.beta.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 16384,
        betas: [
          'code-execution-2025-08-25',
          'skills-2025-10-02',
          'files-api-2025-04-14'
        ],
        container: {
          skills: [{ type: 'anthropic', skill_id: 'docx', version: 'latest' }]
        },
        tools: [{ type: 'code_execution_20250825', name: 'code_execution' }],
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      if (onProgress) {
        onProgress({ step: 'Génération Word', percent: 70, message: 'Traitement de la réponse...' });
      }

      // CORS Workaround: Try base64 extraction first
      const base64 = this.extractBase64FromBash(response);
      if (base64) {
        console.log('📦 Using base64 from bash output (CORS workaround)');

        if (onProgress) {
          onProgress({ step: 'Conversion', percent: 90, message: 'Conversion du fichier...' });
        }

        const blob = this.base64ToBlob(
          base64,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );

        if (onProgress) {
          onProgress({ step: 'Terminé', percent: 100, message: 'Word généré avec succès!' });
        }

        return blob;
      }

      // Fallback: Use Files API (may fail with CORS in browser)
      console.log('⚠️ No base64 found, falling back to Files API (may fail with CORS)...');
      const fileIds = this.extractFileIds(response);
      if (fileIds.length === 0) {
        console.error('No file_id or base64 in Claude response:', response);
        throw new Error('Claude n\'a pas généré de fichier. Réponse: ' + JSON.stringify(response.content));
      }

      const fileId = fileIds[0];
      console.log('📥 Downloading Word file_id:', fileId);

      if (onProgress) {
        onProgress({ step: 'Téléchargement', percent: 90, message: 'Téléchargement du fichier Word...' });
      }

      // Download file using Files API (with beta flag)
      const fileBlob = await this.client.beta.files.download(fileId, {
        betas: ['files-api-2025-04-14']
      });

      // Convert Response to Blob
      const arrayBuffer = await fileBlob.arrayBuffer();
      const blob = new Blob([arrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      if (onProgress) {
        onProgress({ step: 'Terminé', percent: 100, message: 'Word généré avec succès!' });
      }

      return blob;
    } catch (error) {
      console.error('Error generating Word with Claude:', error);
      throw error;
    }
  }

  /**
   * Generate multiple formats at once
   */
  async generateMultiFormat(
    formats: ClaudeDocumentFormat[],
    prompts: {
      excel?: string;
      pptx?: string;
      pdf?: string;
      docx?: string;
    },
    options?: ClaudeGenerationOptions,
    onProgress?: (progress: ClaudeGenerationProgress) => void
  ): Promise<ClaudeGenerationResult> {
    const result: ClaudeGenerationResult = {
      success: false,
      files: {}
    };

    try {
      let completedFormats = 0;
      const totalFormats = formats.length;

      // Generate Excel
      if (formats.includes('excel') && prompts.excel) {
        if (onProgress) {
          const percent = Math.round((completedFormats / totalFormats) * 100);
          onProgress({
            step: 'Excel',
            percent,
            message: `Génération Excel (${completedFormats + 1}/${totalFormats})...`
          });
        }

        result.files!.excel = await this.generateExcel(
          prompts.excel,
          options,
          (progress) => {
            if (onProgress) {
              const basePercent = (completedFormats / totalFormats) * 100;
              const formatPercent = (progress.percent / 100) * (100 / totalFormats);
              onProgress({
                step: progress.step,
                percent: Math.round(basePercent + formatPercent),
                message: progress.message
              });
            }
          }
        ) || undefined;

        completedFormats++;
      }

      // Generate PowerPoint
      if (formats.includes('pptx') && prompts.pptx) {
        if (onProgress) {
          const percent = Math.round((completedFormats / totalFormats) * 100);
          onProgress({
            step: 'PowerPoint',
            percent,
            message: `Génération PowerPoint (${completedFormats + 1}/${totalFormats})...`
          });
        }

        result.files!.pptx = await this.generatePowerPoint(
          prompts.pptx,
          options,
          (progress) => {
            if (onProgress) {
              const basePercent = (completedFormats / totalFormats) * 100;
              const formatPercent = (progress.percent / 100) * (100 / totalFormats);
              onProgress({
                step: progress.step,
                percent: Math.round(basePercent + formatPercent),
                message: progress.message
              });
            }
          }
        ) || undefined;

        completedFormats++;
      }

      // Generate PDF
      if (formats.includes('pdf') && prompts.pdf) {
        if (onProgress) {
          const percent = Math.round((completedFormats / totalFormats) * 100);
          onProgress({
            step: 'PDF',
            percent,
            message: `Génération PDF (${completedFormats + 1}/${totalFormats})...`
          });
        }

        result.files!.pdf = await this.generatePDF(
          prompts.pdf,
          options,
          (progress) => {
            if (onProgress) {
              const basePercent = (completedFormats / totalFormats) * 100;
              const formatPercent = (progress.percent / 100) * (100 / totalFormats);
              onProgress({
                step: progress.step,
                percent: Math.round(basePercent + formatPercent),
                message: progress.message
              });
            }
          }
        ) || undefined;

        completedFormats++;
      }

      // Generate Word
      if (formats.includes('docx') && prompts.docx) {
        if (onProgress) {
          const percent = Math.round((completedFormats / totalFormats) * 100);
          onProgress({
            step: 'Word',
            percent,
            message: `Génération Word (${completedFormats + 1}/${totalFormats})...`
          });
        }

        result.files!.docx = await this.generateWord(
          prompts.docx,
          options,
          (progress) => {
            if (onProgress) {
              const basePercent = (completedFormats / totalFormats) * 100;
              const formatPercent = (progress.percent / 100) * (100 / totalFormats);
              onProgress({
                step: progress.step,
                percent: Math.round(basePercent + formatPercent),
                message: progress.message
              });
            }
          }
        ) || undefined;

        completedFormats++;
      }

      result.success = true;

      if (onProgress) {
        onProgress({
          step: 'Terminé',
          percent: 100,
          message: `${totalFormats} fichier(s) généré(s) avec succès!`
        });
      }

      return result;
    } catch (error) {
      console.error('Error in multi-format generation:', error);
      result.success = false;
      result.error = error instanceof Error ? error.message : 'Erreur inconnue';
      return result;
    }
  }

  /**
   * Calculate cost estimate based on tokens
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    // Claude Sonnet 4.5 pricing (per million tokens)
    const INPUT_COST_PER_M = 3.0; // $3.00 per 1M input tokens
    const OUTPUT_COST_PER_M = 15.0; // $15.00 per 1M output tokens

    const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_M;
    const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

    // Convert USD to EUR (approximate rate)
    const EUR_RATE = 0.92;
    return (inputCost + outputCost) * EUR_RATE;
  }

  /**
   * Check if Claude Skills API (xlsx, pptx, pdf) is available on this account
   * Makes a minimal test call to detect Skills beta availability
   *
   * @returns Object with availability status, message, and timestamp
   */
  async checkSkillsAvailability(): Promise<{
    available: boolean;
    message: string;
    testedAt: Date;
    error?: string;
  }> {
    if (!this.initializeClient() || !this.client) {
      return {
        available: false,
        message: 'Claude API non configurée. Veuillez ajouter votre clé API Anthropic.',
        testedAt: new Date(),
        error: 'NO_API_KEY'
      };
    }

    try {
      console.log('🔍 Testing Claude Skills API availability...');

      // Make a minimal test call with Skills beta
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10, // Minimal tokens to save cost (~$0.001)
        betas: [
          'code-execution-2025-08-25',
          'files-api-2025-04-14',
          'skills-2025-10-02'
        ],
        tools: [{
          type: 'agent',
          name: 'xlsx',
          container: {
            skill_id: 'xlsx'
          }
        }],
        messages: [{
          role: 'user',
          content: 'test'
        }]
      });

      console.log('✅ Skills API test successful!', response);

      return {
        available: true,
        message: 'Skills API disponible! Vous pouvez maintenant générer des documents Excel, PowerPoint et PDF.',
        testedAt: new Date()
      };
    } catch (error: any) {
      console.log('❌ Skills API test failed:', error);

      // Check if error is specifically about Skills not being available
      if (error.message && error.message.includes("does not match any of the expected tags")) {
        return {
          available: false,
          message: 'Skills API pas encore disponible sur votre compte. Réessayez dans quelques jours ou contactez Anthropic support.',
          testedAt: new Date(),
          error: 'SKILLS_NOT_AVAILABLE'
        };
      }

      // Other API errors (auth, network, etc.)
      return {
        available: false,
        message: `Erreur lors de la vérification: ${error.message || 'Erreur inconnue'}`,
        testedAt: new Date(),
        error: 'API_ERROR'
      };
    }
  }
}

// Export singleton instance
export const claudeDocumentService = new ClaudeDocumentService();
