import { aiProviderService } from './aiProviderService';
import type { EmailTemplateType, EmailTemplateVariable, EmailTemplateStyles } from '@/types/emailTemplates';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface GenerateEmailHtmlOptions {
  userMessage: string;
  emailType: EmailTemplateType;
  variables: EmailTemplateVariable[];
  styles: EmailTemplateStyles;
  conversationHistory?: ChatMessage[];
  currentHtmlContent?: string; // HTML actuel pour les modifications incrémentales
}

export interface GenerateEmailMetadataResult {
  name: string;
  description: string;
  subject: string;
  html: string;
}

/**
 * Service pour générer des templates email HTML avec l'IA Claude
 */
export class EmailTemplateAiService {
  /**
   * Génère un template email complet (métadonnées + HTML) à partir d'une description
   */
  static async generateEmailWithMetadata(options: GenerateEmailHtmlOptions): Promise<GenerateEmailMetadataResult> {
    console.log('🔍 [EmailTemplateAiService] generateEmailWithMetadata called');

    const client = aiProviderService.getAnthropicClient();
    console.log('🔍 [EmailTemplateAiService] Anthropic client:', client ? '✅ Configured' : '❌ Not configured');

    if (!client) {
      console.error('❌ [EmailTemplateAiService] Anthropic client not available');
      throw new Error(
        'L\'API Claude n\'est pas configurée. ' +
        'Veuillez configurer votre clé API dans Paramètres → Intelligence Artificielle.'
      );
    }

    // Déterminer si c'est le premier message ou un message de suivi
    // C'est une modification si: 1) il y a un historique OU 2) il y a déjà du HTML content
    const hasHistory = options.conversationHistory && options.conversationHistory.length > 0;
    const hasExistingHtml = options.currentHtmlContent && options.currentHtmlContent.trim().length > 100;
    const isFollowUp = hasHistory || hasExistingHtml;

    const prompt = this.buildPromptWithMetadata(options, isFollowUp);
    console.log('📝 [EmailTemplateAiService] Prompt built, length:', prompt.length);
    console.log('📝 [EmailTemplateAiService] Is follow-up message:', isFollowUp);
    console.log('📝 [EmailTemplateAiService] Has history:', hasHistory, '| Has existing HTML:', hasExistingHtml);

    try {
      console.log('🚀 [EmailTemplateAiService] Calling Claude API...');
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192,
        messages: this.buildMessages(
          options.conversationHistory || [],
          options.userMessage,
          prompt,
          isFollowUp,
          options.currentHtmlContent
        ),
      });
      console.log('✅ [EmailTemplateAiService] Claude API response received');

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Type de réponse inattendu de l\'API Claude');
      }

      // Parse la réponse JSON contenant métadonnées + HTML
      const responseText = content.text.trim();
      console.log('📄 [EmailTemplateAiService] Raw response (first 200 chars):', responseText.substring(0, 200));

      // Extraire le JSON (peut être dans des backticks markdown ou précédé/suivi de texte)
      let jsonText = responseText;

      // Cas 1: Réponse avec markdown code blocks
      if (jsonText.includes('```json')) {
        const match = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonText = match[1].trim();
        }
      } else if (jsonText.includes('```')) {
        const match = jsonText.match(/```\s*([\s\S]*?)\s*```/);
        if (match) {
          jsonText = match[1].trim();
        }
      }

      // Cas 2: Texte avant/après le JSON (trouver le premier { et le dernier })
      if (!jsonText.startsWith('{')) {
        const firstBrace = jsonText.indexOf('{');
        if (firstBrace !== -1) {
          jsonText = jsonText.substring(firstBrace);
        }
      }
      if (!jsonText.endsWith('}')) {
        const lastBrace = jsonText.lastIndexOf('}');
        if (lastBrace !== -1) {
          jsonText = jsonText.substring(0, lastBrace + 1);
        }
      }

      console.log('🔍 [EmailTemplateAiService] Extracted JSON (first 200 chars):', jsonText.substring(0, 200));

      const result = JSON.parse(jsonText) as GenerateEmailMetadataResult;
      console.log('✅ [EmailTemplateAiService] JSON parsed successfully');
      return result;
    } catch (error: any) {
      console.error('Erreur lors de la génération du template:', error);

      if (error.status === 401) {
        throw new Error('Clé API Claude invalide. Veuillez vérifier votre configuration.');
      } else if (error.status === 429) {
        throw new Error('Limite de requêtes API atteinte. Veuillez réessayer dans quelques instants.');
      } else if (error instanceof SyntaxError) {
        throw new Error('Erreur de parsing de la réponse de l\'IA. Veuillez réessayer.');
      } else {
        throw new Error(`Erreur lors de la génération: ${error.message || 'Erreur inconnue'}`);
      }
    }
  }

  /**
   * Génère du HTML d'email à partir d'une description en langage naturel
   * (méthode conservée pour compatibilité)
   */
  static async generateEmailHtml(options: GenerateEmailHtmlOptions): Promise<string> {
    console.log('🔍 [EmailTemplateAiService] generateEmailHtml called');

    const client = aiProviderService.getAnthropicClient();
    console.log('🔍 [EmailTemplateAiService] Anthropic client:', client ? '✅ Configured' : '❌ Not configured');

    if (!client) {
      console.error('❌ [EmailTemplateAiService] Anthropic client not available');
      throw new Error(
        'L\'API Claude n\'est pas configurée. ' +
        'Veuillez configurer votre clé API dans Paramètres → Intelligence Artificielle.'
      );
    }

    const prompt = this.buildPrompt(options);
    console.log('📝 [EmailTemplateAiService] Prompt built, length:', prompt.length);

    try {
      console.log('🚀 [EmailTemplateAiService] Calling Claude API...');
      const response = await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 8192, // Augmenté pour permettre des templates plus longs
        messages: this.buildMessages(options.conversationHistory || [], options.userMessage, prompt),
      });
      console.log('✅ [EmailTemplateAiService] Claude API response received');

      // Extraire le contenu texte de la réponse
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Type de réponse inattendu de l\'API Claude');
      }

      // Extraire uniquement le HTML (sans les backticks markdown si présents)
      let htmlContent = content.text.trim();

      // Retirer les balises markdown de code si présentes
      if (htmlContent.startsWith('```html')) {
        htmlContent = htmlContent.replace(/^```html\n/, '').replace(/\n```$/, '');
      } else if (htmlContent.startsWith('```')) {
        htmlContent = htmlContent.replace(/^```\n/, '').replace(/\n```$/, '');
      }

      return htmlContent;
    } catch (error: any) {
      console.error('Erreur lors de la génération du template:', error);

      if (error.status === 401) {
        throw new Error('Clé API Claude invalide. Veuillez vérifier votre configuration.');
      } else if (error.status === 429) {
        throw new Error('Limite de requêtes API atteinte. Veuillez réessayer dans quelques instants.');
      } else {
        throw new Error(`Erreur lors de la génération: ${error.message || 'Erreur inconnue'}`);
      }
    }
  }

  /**
   * Construit le prompt système pour Claude (avec métadonnées)
   */
  private static buildPromptWithMetadata(options: GenerateEmailHtmlOptions, isFollowUp: boolean): string {
    const { emailType, variables, styles } = options;

    const variablesList = variables
      .map(v => `  - {{${v.name}}} : ${v.description}`)
      .join('\n');

    const emailTypeDescriptions: Partial<Record<EmailTemplateType, string>> = {
      pending_demands: 'Email de rappel pour des demandes de remboursement en attente de validation',
      accounting_codes: 'Email quotidien avec la liste des codes comptables du jour',
      events: 'Email concernant les événements du club (sorties, formations)',
      transactions: 'Email concernant les transactions bancaires',
      members: 'Email concernant les membres du club',
      custom: 'Email personnalisé',
    };

    // Prompt différent selon si c'est une création from scratch ou une modification
    if (isFollowUp) {
      // Message de suivi : MODIFIER le HTML existant
      return `Tu es un expert en création de templates email HTML professionnels pour CalyCompta.

IMPORTANT: Ceci est un MESSAGE DE SUIVI. L'utilisateur veut MODIFIER le template HTML existant.

CONTEXTE:
Type d'email: ${emailTypeDescriptions[emailType] || emailType}

VARIABLES HANDLEBARS DISPONIBLES:
${variablesList}

STYLES À RESPECTER:
- Couleur primaire: ${styles.primaryColor}
- Couleur secondaire: ${styles.secondaryColor}
- Couleur des boutons: ${styles.buttonColor}
- Couleur du texte des boutons: ${styles.buttonTextColor}
- Dégradé header: ${styles.headerGradient}
- Police de caractères: ${styles.fontFamily}

RÈGLES POUR LES MODIFICATIONS:
1. GARDE le même style visuel et la même structure générale
2. MODIFIE UNIQUEMENT ce que l'utilisateur demande explicitement
3. PRÉSERVE tous les éléments visuels existants (couleurs, mise en page, logo, footer, etc.)
4. Si l'utilisateur demande de changer un mot, change SEULEMENT ce mot
5. Si l'utilisateur demande d'ajouter un élément, ajoute-le dans le même style que le reste
6. HTML valide avec styles INLINE uniquement
7. Compatibilité email (Gmail, Outlook, Apple Mail)

FORMAT DE RÉPONSE REQUIS:
Retourne UNIQUEMENT un objet JSON valide:

{
  "name": "Nom du template (garde le même si non demandé)",
  "description": "Description (garde la même si non demandée)",
  "subject": "Sujet (garde le même si non demandé)",
  "html": "Code HTML MODIFIÉ selon la demande de l'utilisateur"
}

RÈGLES CRITIQUES:
1. Le JSON doit être valide (échapper les guillemets: \\")
2. GARDE le même design/style que le HTML précédent
3. Ta réponse doit commencer par { et finir par }
4. AUCUN texte avant le { ou après le }
5. AUCUNE balise markdown
6. UNIQUEMENT du JSON brut et valide`;
    } else {
      // Premier message : CRÉER un nouveau template
      return `Tu es un expert en création de templates email HTML professionnels pour CalyCompta, une application de gestion comptable pour clubs de plongée belges.

CONTEXTE:
Type d'email: ${emailTypeDescriptions[emailType] || emailType}

VARIABLES HANDLEBARS DISPONIBLES:
${variablesList}

STYLES À RESPECTER:
- Couleur primaire: ${styles.primaryColor}
- Couleur secondaire: ${styles.secondaryColor}
- Couleur des boutons: ${styles.buttonColor}
- Couleur du texte des boutons: ${styles.buttonTextColor}
- Dégradé header: ${styles.headerGradient}
- Police de caractères: ${styles.fontFamily}

EXIGENCES TECHNIQUES:
1. HTML valide et bien formé (DOCTYPE, html, head, body)
2. Styles INLINE uniquement (pas de CSS externe ou <style> tags)
3. Responsive design (max-width: 800px, adaptable mobile)
4. Compatibilité avec tous les clients email (Gmail, Outlook, Apple Mail)
5. Utiliser les variables Handlebars avec la syntaxe {{variableName}}
6. Pour les boucles: {{#each items}} ... {{/each}}
7. Pour les conditions: {{#if condition}} ... {{/if}}
8. Structure professionnelle et épurée (pas de clipart, pas d'emojis excessifs)

STRUCTURE RECOMMANDÉE:
- Header avec dégradé de couleur et titre principal
- Corps avec contenu principal (texte, tableaux si nécessaire)
- Bouton d'action (CTA) si pertinent
- Footer avec informations de contact et nom du club

FORMAT DE RÉPONSE REQUIS:
Tu DOIS répondre UNIQUEMENT avec un objet JSON valide, sans AUCUN texte avant ou après.
Ne commence PAS ta réponse par des salutations ou explications.
Retourne DIRECTEMENT le JSON suivant:

{
  "name": "Nom court et descriptif du template (ex: 'Rappel Demandes Détaillé')",
  "description": "Description courte de l'objectif du template (1-2 phrases)",
  "subject": "Sujet de l'email avec variables Handlebars si nécessaire (ex: '{{demandesCount}} demande(s) en attente')",
  "html": "Code HTML complet et valide du template"
}

RÈGLES CRITIQUES:
1. Le JSON doit être valide (échapper les guillemets dans le HTML avec \\")
2. Le HTML doit être complet (DOCTYPE, html, head, body)
3. Utilise les couleurs fournies pour maintenir la cohérence visuelle
4. Ta réponse doit commencer par { et finir par }
5. AUCUN texte avant le { ou après le }
6. AUCUNE balise markdown comme \`\`\`json
7. UNIQUEMENT du JSON brut et valide`;
    }
  }

  /**
   * Construit le prompt système pour Claude (HTML uniquement)
   */
  private static buildPrompt(options: GenerateEmailHtmlOptions): string {
    const { emailType, variables, styles } = options;

    const variablesList = variables
      .map(v => `  - {{${v.name}}} : ${v.description}`)
      .join('\n');

    const emailTypeDescriptions: Partial<Record<EmailTemplateType, string>> = {
      pending_demands: 'Email de rappel pour des demandes de remboursement en attente de validation',
      accounting_codes: 'Email quotidien avec la liste des codes comptables du jour',
      events: 'Email concernant les événements du club (sorties, formations)',
      transactions: 'Email concernant les transactions bancaires',
      members: 'Email concernant les membres du club',
      custom: 'Email personnalisé',
    };

    return `Tu es un expert en création de templates email HTML professionnels pour CalyCompta, une application de gestion comptable pour clubs de plongée belges.

CONTEXTE:
Type d'email: ${emailTypeDescriptions[emailType] || emailType}

VARIABLES HANDLEBARS DISPONIBLES:
${variablesList}

STYLES À RESPECTER:
- Couleur primaire: ${styles.primaryColor}
- Couleur secondaire: ${styles.secondaryColor}
- Couleur des boutons: ${styles.buttonColor}
- Couleur du texte des boutons: ${styles.buttonTextColor}
- Dégradé header: ${styles.headerGradient}
- Police de caractères: ${styles.fontFamily}

EXIGENCES TECHNIQUES:
1. HTML valide et bien formé (DOCTYPE, html, head, body)
2. Styles INLINE uniquement (pas de CSS externe ou <style> tags)
3. Responsive design (max-width: 800px, adaptable mobile)
4. Compatibilité avec tous les clients email (Gmail, Outlook, Apple Mail)
5. Utiliser les variables Handlebars avec la syntaxe {{variableName}}
6. Pour les boucles: {{#each items}} ... {{/each}}
7. Pour les conditions: {{#if condition}} ... {{/if}}
8. Structure professionnelle et épurée (pas de clipart, pas d'emojis excessifs)

STRUCTURE RECOMMANDÉE:
- Header avec dégradé de couleur et titre principal
- Corps avec contenu principal (texte, tableaux si nécessaire)
- Bouton d'action (CTA) si pertinent
- Footer avec informations de contact et nom du club

IMPORTANT:
- Retourne UNIQUEMENT le code HTML complet et valide
- Pas d'explications avant ou après le code
- Pas de commentaires dans le HTML sauf si absolument nécessaires
- Utilise les couleurs fournies pour maintenir la cohérence visuelle
`;
  }

  /**
   * Construit les messages de conversation pour l'API Claude
   */
  private static buildMessages(
    history: ChatMessage[],
    currentMessage: string,
    systemPrompt: string,
    isFollowUp: boolean,
    currentHtmlContent?: string
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Si c'est un message de suivi (modification d'un template existant)
    if (isFollowUp && currentHtmlContent) {
      // Cas 1: Modification avec historique de conversation
      if (history.length > 0) {
        // Ajouter l'historique de conversation
        history.forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        });
      }

      // Ajouter le message avec le HTML actuel à modifier
      const htmlReference = `\n\n=== HTML ACTUEL COMPLET À MODIFIER ===\n${currentHtmlContent}\n=== FIN DU HTML ACTUEL ===\n\n`;
      messages.push({
        role: 'user',
        content: `${systemPrompt}\n${htmlReference}MODIFICATION DEMANDÉE:\n${currentMessage}\n\nIMPORTANT: Garde EXACTEMENT le même design et style. Change UNIQUEMENT ce qui est explicitement demandé.`,
      });
    } else {
      // Cas 2: Premier message (création d'un nouveau template)
      messages.push({
        role: 'user',
        content: `${systemPrompt}\n\nDEMANDE DE L'UTILISATEUR:\n${currentMessage}`,
      });
    }

    return messages;
  }

  /**
   * Valide le HTML généré
   */
  static validateHtml(html: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Vérifications basiques
    if (!html.includes('<!DOCTYPE html>') && !html.includes('<!doctype html>')) {
      errors.push('DOCTYPE manquant');
    }

    if (!html.includes('<html')) {
      errors.push('Balise <html> manquante');
    }

    if (!html.includes('<body')) {
      errors.push('Balise <body> manquante');
    }

    // Vérifier que les balises sont fermées (simple heuristique)
    const openTags = (html.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (html.match(/<\/[^>]*>/g) || []).length;
    const selfClosingTags = (html.match(/<[^>]*\/>/g) || []).length;

    // Note: cette validation est très basique, mais suffisante pour détecter les erreurs évidentes
    if (openTags - selfClosingTags !== closeTags) {
      errors.push('Balises HTML non équilibrées (possible balise non fermée)');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Teste la connexion à l'API Claude
   */
  static async testConnection(): Promise<{ success: boolean; message: string }> {
    const client = aiProviderService.getAnthropicClient();

    if (!client) {
      return {
        success: false,
        message: 'API Claude non configurée',
      };
    }

    try {
      await client.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 50,
        messages: [{
          role: 'user',
          content: 'Réponds simplement "OK" si tu peux me lire.',
        }],
      });

      return {
        success: true,
        message: 'Connexion à Claude API réussie ✓',
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Erreur de connexion: ${error.message || 'Erreur inconnue'}`,
      };
    }
  }
}

export default EmailTemplateAiService;
