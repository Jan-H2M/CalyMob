import { aiProviderService } from './aiProviderService';
import { AI_MODELS } from '@/config/aiModels';
import type { EmailTemplateType, EmailTemplateVariable, EmailTemplateStyles } from '@/types/emailTemplates';
import type { ClubBranding } from '@/types/branding';
import { logger } from '@/utils/logger';

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
  branding?: ClubBranding; // Branding du club pour personnalisation automatique
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
    logger.debug('🔍 [EmailTemplateAiService] generateEmailWithMetadata called');

    const client = aiProviderService.getAnthropicClient();
    logger.debug('🔍 [EmailTemplateAiService] Anthropic client:', client ? '✅ Configured' : '❌ Not configured');

    if (!client) {
      logger.error('❌ [EmailTemplateAiService] Anthropic client not available');
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
    logger.debug('📝 [EmailTemplateAiService] Prompt built, length:', prompt.length);
    logger.debug('📝 [EmailTemplateAiService] Is follow-up message:', isFollowUp);
    logger.debug('📝 [EmailTemplateAiService] Has history:', hasHistory, '| Has existing HTML:', hasExistingHtml);

    try {
      logger.debug('🚀 [EmailTemplateAiService] Calling Claude API...');
      const response = await client.messages.create({
        model: AI_MODELS.emailTemplate,
        max_tokens: 8192,
        messages: this.buildMessages(
          options.conversationHistory || [],
          options.userMessage,
          prompt,
          isFollowUp,
          options.currentHtmlContent
        ),
      });
      logger.debug('✅ [EmailTemplateAiService] Claude API response received');

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Type de réponse inattendu de l\'API Claude');
      }

      // Parse la réponse JSON contenant métadonnées + HTML
      const responseText = content.text.trim();
      logger.debug('📄 [EmailTemplateAiService] Raw response (first 200 chars):', responseText.substring(0, 200));

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

      logger.debug('🔍 [EmailTemplateAiService] Extracted JSON (first 200 chars):', jsonText.substring(0, 200));

      const result = JSON.parse(jsonText) as GenerateEmailMetadataResult;
      logger.debug('✅ [EmailTemplateAiService] JSON parsed successfully');
      return result;
    } catch (error: any) {
      logger.error('Erreur lors de la génération du template:', error);

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
    logger.debug('🔍 [EmailTemplateAiService] generateEmailHtml called');

    const client = aiProviderService.getAnthropicClient();
    logger.debug('🔍 [EmailTemplateAiService] Anthropic client:', client ? '✅ Configured' : '❌ Not configured');

    if (!client) {
      logger.error('❌ [EmailTemplateAiService] Anthropic client not available');
      throw new Error(
        'L\'API Claude n\'est pas configurée. ' +
        'Veuillez configurer votre clé API dans Paramètres → Intelligence Artificielle.'
      );
    }

    const prompt = this.buildPrompt(options);
    logger.debug('📝 [EmailTemplateAiService] Prompt built, length:', prompt.length);

    try {
      logger.debug('🚀 [EmailTemplateAiService] Calling Claude API...');
      const response = await client.messages.create({
        model: AI_MODELS.emailTemplate,
        max_tokens: 8192, // Augmenté pour permettre des templates plus longs
        messages: this.buildMessages(options.conversationHistory || [], options.userMessage, prompt),
      });
      logger.debug('✅ [EmailTemplateAiService] Claude API response received');

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
      logger.error('Erreur lors de la génération du template:', error);

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
   * Construit la section branding pour le prompt
   */
  private static buildBrandingSection(branding?: ClubBranding): string {
    if (!branding) return '';

    const sections: string[] = [];

    sections.push('BRANDING DU CLUB (À UTILISER OBLIGATOIREMENT):');

    // Nom du club
    sections.push(`- Nom du club: ${branding.clubName}`);

    // === LOGO ===
    if (branding.logoUrl) {
      const logoStyle = branding.logoStyle || 'contained';
      const logoBg = branding.logoBackgroundColor || '#FFFFFF';
      const logoPadding = branding.logoPadding ?? 8;
      const logoRadius = branding.logoBorderRadius ?? 8;

      let logoStyleStr = '';
      if (logoStyle === 'transparent') {
        logoStyleStr = 'background: transparent; padding: 0;';
      } else if (logoStyle === 'circle') {
        logoStyleStr = `background: ${logoBg}; padding: ${logoPadding}px; border-radius: 50%;`;
      } else {
        logoStyleStr = `background: ${logoBg}; padding: ${logoPadding}px; border-radius: ${logoRadius}px;`;
      }

      sections.push(`- Logo du club (dans un container avec style): <div style="${logoStyleStr}"><img src="${branding.logoUrl}" alt="${branding.logoAlt || branding.clubName}" style="max-height: 60px; width: auto; display: block;"></div>`);
    }

    // === COULEURS ===
    sections.push(`- Couleur primaire: ${branding.primaryColor}`);
    if (branding.secondaryColor) {
      sections.push(`- Couleur secondaire: ${branding.secondaryColor}`);
    }
    if (branding.accentColor) {
      sections.push(`- Couleur accent (boutons): ${branding.accentColor}`);
    }
    if (branding.textColor) {
      sections.push(`- Couleur du texte: ${branding.textColor}`);
    }

    // === HEADER ===
    if (branding.headerGradient) {
      sections.push(`- Dégradé pour le header: ${branding.headerGradient}`);
    }
    if (branding.headerHeight) {
      sections.push(`- Hauteur du header: ${branding.headerHeight}px`);
    }
    if (branding.headerPadding) {
      sections.push(`- Padding du header: ${branding.headerPadding}px`);
    }

    // === TYPOGRAPHIE ===
    if (branding.fontFamily) {
      sections.push(`- Police de caractères: ${branding.fontFamily}`);
    }
    if (branding.titleFontSize) {
      sections.push(`- Taille des titres: ${branding.titleFontSize}px`);
    }
    if (branding.bodyFontSize) {
      sections.push(`- Taille du texte: ${branding.bodyFontSize}px`);
    }

    // === FOND D'EMAIL ===
    const bgType = branding.emailBackgroundType || 'solid';
    const bgColor = branding.emailBackgroundColor || '#F5F5F5';
    const contentBg = branding.contentBackgroundColor || '#FFFFFF';

    if (bgType === 'gradient' && branding.emailBackgroundGradient) {
      sections.push(`- Fond de l'email: dégradé ${branding.emailBackgroundGradient}`);
    } else if (bgType === 'image' && branding.emailBackgroundImageUrl) {
      sections.push(`- Image de fond de l'email: url(${branding.emailBackgroundImageUrl})`);
    } else {
      sections.push(`- Couleur de fond de l'email: ${bgColor}`);
    }
    sections.push(`- Couleur de fond du contenu: ${contentBg}`);

    // === FOOTER ===
    if (branding.footerBackgroundColor) {
      sections.push(`- Couleur de fond du footer: ${branding.footerBackgroundColor}`);
    }
    if (branding.footerImageUrl) {
      sections.push(`- Image dans le footer: <img src="${branding.footerImageUrl}" alt="Footer" style="max-height: 80px; width: auto;">`);
    }
    if (branding.footerText) {
      sections.push(`- Texte de footer personnalisé: ${branding.footerText}`);
    }

    // === BOUTONS ===
    const btnRadius = branding.buttonBorderRadius ?? 4;
    const btnPaddingV = branding.buttonPaddingV ?? 12;
    const btnPaddingH = branding.buttonPaddingH ?? 24;
    sections.push(`- Style des boutons: border-radius: ${btnRadius}px; padding: ${btnPaddingV}px ${btnPaddingH}px; background: ${branding.accentColor || branding.primaryColor}; color: #FFFFFF;`);

    // === LIENS ===
    if (branding.websiteUrl) {
      sections.push(`- Site web du club: ${branding.websiteUrl}`);
    }
    if (branding.facebookUrl) {
      sections.push(`- Facebook: ${branding.facebookUrl}`);
    }
    if (branding.instagramUrl) {
      sections.push(`- Instagram: ${branding.instagramUrl}`);
    }

    return sections.join('\n') + '\n';
  }

  /**
   * Construit le prompt système pour Claude (avec métadonnées)
   */
  private static buildPromptWithMetadata(options: GenerateEmailHtmlOptions, isFollowUp: boolean): string {
    const { emailType, variables, styles, branding } = options;

    const variablesList = variables
      .map(v => `  - {{${v.name}}} : ${v.description}`)
      .join('\n');

    const brandingSection = this.buildBrandingSection(branding);

    const emailTypeDescriptions: Partial<Record<EmailTemplateType, string>> = {
      pending_demands: 'Email de rappel pour des demandes de remboursement en attente de validation',
      accounting_codes: 'Email quotidien avec la liste des codes comptables du jour',
      expense_submitted: 'Email de confirmation quand une note de frais est soumise',
      expense_approved: 'Email de notification quand une note de frais est approuvée',
      expense_reimbursed: 'Email de confirmation quand une note de frais est remboursée',
      bank_validation_pending: 'Email de rappel pour des paiements en attente de validation bancaire',
      account_activated: 'Email de bienvenue quand un compte utilisateur est activé',
      password_reset: 'Email de notification quand un mot de passe est réinitialisé',
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

${brandingSection}
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

${brandingSection}
VARIABLES HANDLEBARS DISPONIBLES:
${variablesList}

STYLES À RESPECTER:
- Couleur primaire: ${branding?.primaryColor || styles.primaryColor}
- Couleur secondaire: ${branding?.secondaryColor || styles.secondaryColor}
- Couleur des boutons: ${branding?.accentColor || styles.buttonColor}
- Couleur du texte des boutons: ${styles.buttonTextColor}
- Dégradé header: ${branding?.headerGradient || styles.headerGradient}
- Police de caractères: ${branding?.fontFamily || styles.fontFamily}

EXIGENCES TECHNIQUES:
1. HTML valide et bien formé (DOCTYPE, html, head, body)
2. Styles INLINE uniquement (pas de CSS externe ou <style> tags)
3. Responsive design (max-width: 800px, adaptable mobile)
4. Compatibilité avec tous les clients email (Gmail, Outlook, Apple Mail)
5. Utiliser les variables Handlebars avec la syntaxe {{variableName}}
6. Pour les boucles: {{#each items}} ... {{/each}}
7. Pour les conditions: {{#if condition}} ... {{/if}}
8. Structure professionnelle et épurée (pas de clipart, pas d'emojis excessifs)
${branding?.logoUrl ? '9. INCLURE LE LOGO DU CLUB dans le header de l\'email' : ''}

STRUCTURE RECOMMANDÉE:
- Header avec ${branding?.logoUrl ? 'logo centré et ' : ''}dégradé de couleur et titre principal
- Corps avec contenu principal (texte, tableaux si nécessaire)
- Bouton d'action (CTA) si pertinent
- Footer avec ${branding?.clubName ? `"${branding.clubName}"` : 'nom du club'}${branding?.footerText ? ` et "${branding.footerText}"` : ''}

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
3. Utilise les couleurs du branding pour maintenir la cohérence visuelle
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
        model: AI_MODELS.emailTemplate,
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

/**
 * Options for generating zones with AI
 */
export interface GenerateZoneOptions {
  userMessage: string;
  currentHtmlContent: string;
  emailType: EmailTemplateType;
  variables: EmailTemplateVariable[];
  existingZones: Array<{ id: string; label: string; content: string }>;
}

/**
 * Result of zone generation
 */
export interface GenerateZoneResult {
  html: string;
  zoneName: string;
}

/**
 * Generate or add an editable zone to an email template using AI
 * The AI will understand the user's request and add appropriate zone markers
 */
export async function generateZoneWithAi(options: GenerateZoneOptions): Promise<GenerateZoneResult> {
  const { userMessage, currentHtmlContent, variables, existingZones } = options;

  logger.debug('[generateZoneWithAi] Starting zone generation...');
  logger.debug('[generateZoneWithAi] User message:', userMessage);
  logger.debug('[generateZoneWithAi] Existing zones:', existingZones.map(z => z.id));

  const { aiProviderService } = await import('./aiProviderService');
  const client = aiProviderService.getAnthropicClient();

  if (!client) {
    throw new Error(
      'L\'API Claude n\'est pas configuree. ' +
      'Veuillez configurer votre cle API dans Parametres - Intelligence Artificielle.'
    );
  }

  const variablesList = variables
    .map(v => `  - {{${v.name}}} : ${v.description}`)
    .join('\n');

  const existingZonesList = existingZones.length > 0
    ? existingZones.map(z => `  - ID: "${z.id}", Label: "${z.label}"`).join('\n')
    : '  (aucune zone existante)';

  const systemPrompt = `Tu es un expert en templates email HTML. Ta tache est d'AJOUTER une zone editable dans un template email existant.

FORMAT DES ZONES EDITABLES:
Les zones sont definies avec ce format HTML:
<!--ZONE:id:Label-->
contenu par defaut de la zone
<!--/ZONE:id-->

REGLES POUR LES ZONES:
1. L'ID doit etre en minuscules, alphanumerique avec underscores (ex: intro, message, signature)
2. Le Label est le nom affiche (ex: "Introduction", "Message personnalise", "Signature")
3. Le contenu par defaut doit etre du HTML valide
4. Les zones ne peuvent pas etre imbriquees

VARIABLES HANDLEBARS DISPONIBLES:
${variablesList}

ZONES EXISTANTES DANS CE TEMPLATE:
${existingZonesList}

HTML ACTUEL DU TEMPLATE:
${currentHtmlContent}

DEMANDE DE L'UTILISATEUR:
${userMessage}

INSTRUCTIONS:
1. Analyse la demande de l'utilisateur pour comprendre:
   - Quel type de zone il veut (intro, message, signature, etc.)
   - Ou la placer dans le template
   - Quel contenu par defaut utiliser
2. Ajoute la zone avec les marqueurs <!--ZONE:id:Label--> et <!--/ZONE:id-->
3. Choisis un ID unique qui n'existe pas encore
4. Garde TOUT le reste du HTML exactement identique

FORMAT DE REPONSE REQUIS:
Retourne UNIQUEMENT un objet JSON valide:

{
  "zoneName": "Le label de la zone ajoutee",
  "html": "Le HTML complet du template avec la nouvelle zone ajoutee"
}

REGLES CRITIQUES:
1. Le JSON doit etre valide (echappe les guillemets: \\")
2. Le HTML doit contenir TOUT le template original PLUS la nouvelle zone
3. Ta reponse doit commencer par { et finir par }
4. AUCUN texte avant le { ou apres le }
5. AUCUNE balise markdown`;

  try {
    const response = await client.messages.create({
      model: AI_MODELS.emailTemplate,
      max_tokens: 16384,
      messages: [{
        role: 'user',
        content: systemPrompt,
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Type de reponse inattendu de l\'API Claude');
    }

    // Parse JSON response
    let jsonText = content.text.trim();

    // Remove markdown code blocks if present
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

    // Find JSON boundaries
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

    const result = JSON.parse(jsonText) as GenerateZoneResult;

    // Validate that a new zone was actually added
    const zonePattern = /<!--ZONE:(\w+):([^>]+)-->/g;
    const originalZones = currentHtmlContent.match(zonePattern) || [];
    const newZones = result.html.match(zonePattern) || [];

    if (newZones.length <= originalZones.length) {
      logger.warn('[generateZoneWithAi] Warning: No new zone detected in response');
    }

    logger.debug('[generateZoneWithAi] Zone generated successfully:', result.zoneName);
    return result;
  } catch (error: any) {
    logger.error('[generateZoneWithAi] Error:', error);

    if (error.status === 401) {
      throw new Error('Cle API Claude invalide. Veuillez verifier votre configuration.');
    } else if (error.status === 429) {
      throw new Error('Limite de requetes API atteinte. Veuillez reessayer dans quelques instants.');
    } else if (error instanceof SyntaxError) {
      throw new Error('Erreur de parsing de la reponse de l\'IA. Veuillez reessayer.');
    } else {
      throw new Error(`Erreur lors de la generation: ${error.message || 'Erreur inconnue'}`);
    }
  }
}

export default EmailTemplateAiService;
