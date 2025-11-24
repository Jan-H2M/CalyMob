/**
 * AI Provider Service
 *
 * Manages multiple AI providers (OpenAI, Anthropic) for different use cases:
 * - OpenAI GPT-4o: Document analysis, OCR, data extraction
 * - Anthropic Claude: Document generation, reports, structured output
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { FirebaseSettingsService } from './firebaseSettingsService';

export type AIProvider = 'openai' | 'anthropic';

export interface AIProviderConfig {
  openai: {
    enabled: boolean;
    hasKey: boolean;
  };
  anthropic: {
    enabled: boolean;
    hasKey: boolean;
  };
}

class AIProviderService {
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private isInitialized = false;

  constructor() {
    // Don't initialize in constructor - wait for async loadFromFirebase
    this.initializeProvidersFromLocalStorage();
  }

  /**
   * Initialize AI providers from environment variables and localStorage (synchronous fallback)
   */
  private initializeProvidersFromLocalStorage() {
    // OpenAI
    const openaiKey = import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem('ai_api_key');
    if (openaiKey) {
      this.openaiClient = new OpenAI({
        apiKey: openaiKey,
        dangerouslyAllowBrowser: true
      });
    }

    // Anthropic
    const anthropicKey = import.meta.env.VITE_ANTHROPIC_API_KEY || localStorage.getItem('anthropic_api_key');
    if (anthropicKey) {
      this.anthropicClient = new Anthropic({
        apiKey: anthropicKey,
        dangerouslyAllowBrowser: true
      });
    }
  }

  /**
   * Load API keys from Firebase and initialize providers
   * Call this method after authentication with clubId
   */
  async loadFromFirebase(clubId: string): Promise<void> {
    try {
      const { openaiKey, anthropicKey } = await FirebaseSettingsService.loadAIApiKeys(clubId);

      // Initialize OpenAI if key exists
      if (openaiKey) {
        this.openaiClient = new OpenAI({
          apiKey: openaiKey,
          dangerouslyAllowBrowser: true
        });
        // Also sync to localStorage for offline use
        localStorage.setItem('ai_api_key', openaiKey);
      }

      // Initialize Anthropic if key exists
      if (anthropicKey) {
        this.anthropicClient = new Anthropic({
          apiKey: anthropicKey,
          dangerouslyAllowBrowser: true
        });
        // Also sync to localStorage for offline use
        localStorage.setItem('anthropic_api_key', anthropicKey);
      }

      this.isInitialized = true;
      console.log('✅ Clés API IA chargées depuis Firebase');
    } catch (error) {
      console.error('❌ Erreur lors du chargement des clés API IA depuis Firebase:', error);
      // Fallback to localStorage if Firebase fails
      this.initializeProvidersFromLocalStorage();
    }
  }

  /**
   * Get OpenAI client (for document analysis, OCR)
   */
  getOpenAIClient(): OpenAI | null {
    return this.openaiClient;
  }

  /**
   * Get Anthropic client (for document generation, reports)
   */
  getAnthropicClient(): Anthropic | null {
    return this.anthropicClient;
  }

  /**
   * Set OpenAI API key
   */
  setOpenAIKey(key: string): void {
    if (!key || key.trim() === '') {
      this.openaiClient = null;
      localStorage.removeItem('ai_api_key');
      return;
    }

    this.openaiClient = new OpenAI({
      apiKey: key.trim(),
      dangerouslyAllowBrowser: true
    });
    localStorage.setItem('ai_api_key', key.trim());
  }

  /**
   * Set Anthropic API key
   */
  setAnthropicKey(key: string): void {
    if (!key || key.trim() === '') {
      this.anthropicClient = null;
      localStorage.removeItem('anthropic_api_key');
      return;
    }

    this.anthropicClient = new Anthropic({
      apiKey: key.trim(),
      dangerouslyAllowBrowser: true
    });
    localStorage.setItem('anthropic_api_key', key.trim());
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: AIProvider): boolean {
    if (provider === 'openai') {
      return this.openaiClient !== null;
    } else if (provider === 'anthropic') {
      return this.anthropicClient !== null;
    }
    return false;
  }

  /**
   * Get current configuration status
   */
  getProviderConfig(): AIProviderConfig {
    return {
      openai: {
        enabled: this.openaiClient !== null,
        hasKey: !!(import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem('ai_api_key'))
      },
      anthropic: {
        enabled: this.anthropicClient !== null,
        hasKey: !!(import.meta.env.VITE_ANTHROPIC_API_KEY || localStorage.getItem('anthropic_api_key'))
      }
    };
  }

  /**
   * Test OpenAI connection
   */
  async testOpenAIConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.openaiClient) {
      return { success: false, message: 'Clé API OpenAI non configurée' };
    }

    try {
      // Simple API call to test connection
      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 10
      });

      if (response && response.choices && response.choices.length > 0) {
        return { success: true, message: 'Connexion OpenAI réussie' };
      }

      return { success: false, message: 'Réponse OpenAI invalide' };
    } catch (error) {
      console.error('OpenAI connection test error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erreur de connexion OpenAI'
      };
    }
  }

  /**
   * Test Anthropic connection
   */
  async testAnthropicConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.anthropicClient) {
      return { success: false, message: 'Clé API Anthropic non configurée' };
    }

    try {
      // Simple API call to test connection
      const response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Test connection' }]
      });

      if (response && response.content && response.content.length > 0) {
        return { success: true, message: 'Connexion Claude réussie' };
      }

      return { success: false, message: 'Réponse Claude invalide' };
    } catch (error) {
      console.error('Anthropic connection test error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erreur de connexion Claude'
      };
    }
  }

  /**
   * Get recommended provider for a specific use case
   */
  getRecommendedProvider(useCase: 'document_analysis' | 'document_generation' | 'data_extraction' | 'report_generation'): AIProvider | null {
    switch (useCase) {
      case 'document_analysis':
      case 'data_extraction':
        // OpenAI GPT-4o excellent for vision/OCR
        return this.isProviderAvailable('openai') ? 'openai' : null;

      case 'document_generation':
      case 'report_generation':
        // Claude Sonnet 4.5 superior for structured output
        return this.isProviderAvailable('anthropic') ? 'anthropic' : null;

      default:
        return null;
    }
  }
}

// Export singleton instance
export const aiProviderService = new AIProviderService();
