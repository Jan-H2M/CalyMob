/**
 * Quick Prompts for AI Email Template Generation
 *
 * Ces prompts prédéfinis permettent aux utilisateurs de générer rapidement
 * des templates email professionnels avec un seul clic.
 *
 * Chaque prompt inclut:
 * - Les bonnes variables Handlebars pour le type d'email
 * - Les instructions pour utiliser le branding du club
 * - Un sujet suggéré avec les variables appropriées
 */

import type { EmailTemplateType } from '@/types/emailTemplates';

export interface QuickPrompt {
  /** Icône emoji pour l'affichage */
  icon: string;
  /** Label court pour le bouton */
  label: string;
  /** Sujet suggéré avec variables Handlebars */
  suggestedSubject: string;
  /** Prompt complet pour l'IA */
  prompt: string;
  /** Description tooltip (optionnel) */
  description?: string;
}

/**
 * Quick Prompts organisés par type d'email
 */
export const EMAIL_QUICK_PROMPTS: Partial<Record<EmailTemplateType, QuickPrompt[]>> = {
  pending_demands: [
    {
      icon: '📊',
      label: 'Tableau détaillé',
      suggestedSubject: '📋 {{demandesCount}} demande(s) en attente - {{clubName}}',
      description: 'Email avec tableau complet des demandes',
      prompt: `Crée un email professionnel pour rappeler les demandes de remboursement en attente.

Structure:
- Header avec dégradé aux couleurs du club et logo centré
- Titre principal: "{{demandesCount}} demande(s) de remboursement en attente"
- Sous-titre: "Total: {{totalAmount}} €"
- Tableau avec colonnes: Date, Membre, Description, Montant
- Utilise {{#each demandes}} pour la boucle avec {{this.date}}, {{this.demandeur}}, {{this.description}}, {{this.montant}}
- Bouton orange "Consulter les demandes" vers {{appUrl}}/depenses
- Footer avec "Cordialement, {{clubName}}"

Style: professionnel et lisible, utilise les couleurs du club pour le header et le bouton.`
    },
    {
      icon: '📝',
      label: 'Email simple',
      suggestedSubject: '{{demandesCount}} demande(s) à valider - {{clubName}}',
      description: 'Email minimaliste avec résumé',
      prompt: `Crée un email minimaliste et épuré pour rappeler les demandes en attente:

Structure:
- Logo du club centré en haut
- Message simple: "Bonjour, vous avez {{demandesCount}} demande(s) de remboursement en attente pour un total de {{totalAmount}} €."
- Un seul bouton d'action bien visible "Voir les demandes" vers {{appUrl}}/depenses
- Signature: "{{clubName}}"

Style: sobre, beaucoup d'espace blanc, bouton aux couleurs du club.`
    }
  ],

  expense_submitted: [
    {
      icon: '✉️',
      label: 'Confirmation standard',
      suggestedSubject: '✅ Note de frais "{{description}}" enregistrée',
      description: 'Confirmation de réception de la note de frais',
      prompt: `Crée un email de confirmation pour une note de frais soumise:

Structure:
- Header avec logo et dégradé aux couleurs du club
- "Bonjour {{recipientName}},"
- "Votre note de frais a bien été enregistrée."
- Encadré récapitulatif avec:
  - Description: {{description}}
  - Montant: {{montant}} €
  - Date de dépense: {{dateDepense}}
  - Fournisseur: {{fournisseur}} (si disponible)
  - Catégorie: {{categorie}} (si disponible)
- Message: "Votre demande est en attente de validation. Vous recevrez une notification dès qu'elle sera traitée."
- Bouton "Voir mes demandes" vers {{appUrl}}/depenses
- Signature: "Cordialement, {{clubName}}"

Style: professionnel et rassurant.`
    }
  ],

  expense_approved: [
    {
      icon: '✅',
      label: 'Approbation',
      suggestedSubject: '✅ Note de frais approuvée - {{montant}} €',
      description: 'Notification d\'approbation',
      prompt: `Crée un email d'approbation avec un ton positif:

Structure:
- Header avec dégradé vert/succès et logo du club
- "Bonne nouvelle {{recipientName}} !"
- "Votre note de frais a été approuvée."
- Encadré avec détails:
  - Description: {{description}}
  - Montant: {{montant}} €
  - Approuvé par: {{approvedBy}}
  - Date d'approbation: {{approvedDate}}
- Message: "Le remboursement sera effectué prochainement."
- Bouton vers {{appUrl}}/depenses
- Signature: "{{clubName}}"

Style: positif, couleur verte dominante pour le header.`
    }
  ],

  expense_reimbursed: [
    {
      icon: '💰',
      label: 'Remboursement effectué',
      suggestedSubject: '💰 Remboursement de {{montant}} € effectué',
      description: 'Confirmation de virement',
      prompt: `Crée un email de confirmation de remboursement:

Structure:
- Header avec logo du club et couleur violette/succès
- "{{recipientName}}, votre remboursement a été effectué !"
- Encadré avec détails:
  - Montant viré: {{montant}} €
  - Description: {{description}}
  - Date de virement: {{reimbursementDate}}
  - Référence: {{reference}} (si disponible)
- Message: "Le montant devrait apparaître sur votre compte sous 2-3 jours ouvrés."
- Bouton "Voir l'historique" vers {{appUrl}}/depenses
- Signature: "{{clubName}}"

Style: professionnel, couleur violette pour indiquer le succès financier.`
    }
  ],

  bank_validation_pending: [
    {
      icon: '🏦',
      label: 'Rappel validation',
      suggestedSubject: '🏦 {{demandesCount}} paiement(s) à valider - {{totalAmount}} €',
      description: 'Rappel pour validations bancaires en attente',
      prompt: `Crée un email de rappel pour les validations bancaires en attente:

Structure:
- Header professionnel avec logo du club et dégradé bleu/indigo
- Titre: "{{demandesCount}} paiement(s) en attente de validation"
- Sous-titre: "Total: {{totalAmount}} €"
- Tableau avec colonnes: Date, Bénéficiaire, Montant, Communication
- Utilise {{#each demandes}} avec {{this.date}}, {{this.demandeur}}, {{this.montant}}, {{this.description}}
- Note explicative: "Ces paiements ont été créés dans l'application bancaire et sont en attente de votre validation."
- Bouton "Accéder à l'application bancaire" (lien générique)
- Footer avec {{clubName}}

Style: professionnel et sobre, adapté au contexte bancaire.`
    }
  ],

  accounting_codes: [
    {
      icon: '📊',
      label: 'Rapport quotidien',
      suggestedSubject: '📊 {{totalTransactions}} transaction(s) - Codes comptables du {{date}}',
      description: 'Rapport des codes comptables assignés',
      prompt: `Crée un email de rapport quotidien des codes comptables:

Structure:
- Header sobre avec logo et dégradé bleu foncé
- Titre: "Rapport des codes comptables"
- Sous-titre: "{{totalTransactions}} nouvelle(s) transaction(s) - {{date}}"
- Tableau avec colonnes: Date, Description, Montant, Code comptable
- Utilise {{#each transactions}} avec les champs appropriés
- Résumé par catégorie comptable si disponible
- Bouton "Voir dans CalyCompta" vers {{appUrl}}/transactions
- Footer: "Rapport généré automatiquement par {{clubName}}"

Style: professionnel et structuré, adapté aux données comptables.`
    }
  ],

  account_activated: [
    {
      icon: '🎉',
      label: 'Bienvenue',
      suggestedSubject: '🎉 Bienvenue sur {{clubName}} - Votre compte est activé',
      description: 'Email de bienvenue avec identifiants',
      prompt: `Crée un email de bienvenue chaleureux:

Structure:
- Header festif avec logo du club et dégradé aux couleurs du club
- "Bienvenue {{recipientName}} !"
- "Votre compte {{clubName}} a été activé avec succès."
- Encadré avec identifiants:
  - Email: {{email}}
  - Mot de passe temporaire: {{temporaryPassword}}
- Message important: "Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion."
- Bouton prominent "Se connecter" vers {{appUrl}}
- "À bientôt sur {{clubName}} !"

Style: accueillant et moderne, couleurs du club.`
    }
  ],

  password_reset: [
    {
      icon: '🔑',
      label: 'Nouveau mot de passe',
      suggestedSubject: '🔑 Nouveau mot de passe - {{clubName}}',
      description: 'Notification de réinitialisation',
      prompt: `Crée un email de réinitialisation de mot de passe:

Structure:
- Header simple avec logo du club
- "Bonjour {{recipientName}},"
- "Votre mot de passe a été réinitialisé."
- Encadré avec le nouveau mot de passe:
  - Nouveau mot de passe: {{temporaryPassword}}
- Note de sécurité: "Ce mot de passe est temporaire. Veuillez le modifier dès votre prochaine connexion."
- Bouton "Se connecter" vers {{appUrl}}
- Message: "Si vous n'êtes pas à l'origine de cette demande, contactez immédiatement un administrateur."
- Signature: "{{clubName}}"

Style: sobre et sécuritaire.`
    }
  ],

  // Types sans quick prompts spécifiques (utiliseront le prompt libre)
  events: [],
  transactions: [],
  members: [],
  custom: [],
};

/**
 * Obtenir les Quick Prompts pour un type d'email donné
 */
export function getQuickPromptsForType(emailType: EmailTemplateType): QuickPrompt[] {
  return EMAIL_QUICK_PROMPTS[emailType] || [];
}

/**
 * Vérifier si un type d'email a des Quick Prompts disponibles
 */
export function hasQuickPrompts(emailType: EmailTemplateType): boolean {
  const prompts = EMAIL_QUICK_PROMPTS[emailType];
  return prompts !== undefined && prompts.length > 0;
}
