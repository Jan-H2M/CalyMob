/**
 * Service to initialize default email templates for user management
 */

import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE, DEFAULT_PASSWORD_RESET_TEMPLATE } from '@/constants/defaultUserEmailTemplates';
import type { EmailTemplate } from '@/types/emailTemplates';

interface InitResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Initialize default user email templates
 * This creates the "Compte Activé" and "Mot de Passe Réinitialisé" templates
 * if they don't already exist
 */
export async function initializeUserEmailTemplates(
  clubId: string,
  userId: string
): Promise<InitResult> {
  const result: InitResult = {
    success: true,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const templates = [
    {
      name: 'Compte Activé',
      description: 'Email envoyé automatiquement lorsqu\'un compte utilisateur est activé',
      emailType: 'account_activated' as const,
      subject: '🎉 Votre compte {{clubName}} a été activé',
      htmlContent: DEFAULT_ACCOUNT_ACTIVATED_TEMPLATE,
      variables: [
        { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
        { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
        { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
        { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
        { name: 'temporaryPassword', type: 'string', required: true, description: 'Mot de passe temporaire', example: 'CalyCompta2025-01' },
        { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
        { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://calycompta.vercel.app' },
      ],
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
    {
      name: 'Mot de Passe Réinitialisé',
      description: 'Email envoyé lorsqu\'un mot de passe utilisateur est réinitialisé',
      emailType: 'password_reset' as const,
      subject: '🔑 Votre mot de passe {{clubName}} a été réinitialisé',
      htmlContent: DEFAULT_PASSWORD_RESET_TEMPLATE,
      variables: [
        { name: 'recipientName', type: 'string', required: true, description: 'Nom complet du destinataire', example: 'Jean Dupont' },
        { name: 'firstName', type: 'string', required: false, description: 'Prénom du destinataire', example: 'Jean' },
        { name: 'lastName', type: 'string', required: false, description: 'Nom de famille du destinataire', example: 'Dupont' },
        { name: 'email', type: 'string', required: true, description: 'Email du destinataire', example: 'jean.dupont@example.com' },
        { name: 'temporaryPassword', type: 'string', required: true, description: 'Nouveau mot de passe temporaire', example: 'CalyCompta2025-01' },
        { name: 'clubName', type: 'string', required: true, description: 'Nom du club', example: 'Calypso Diving Club' },
        { name: 'appUrl', type: 'string', required: true, description: 'URL de l\'application', example: 'https://calycompta.vercel.app' },
      ],
      styles: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        headerGradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
        buttonColor: '#3B82F6',
        buttonTextColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
      },
      isActive: true,
      isDefault: true,
      usageCount: 0,
    },
  ];

  for (const template of templates) {
    try {
      // Check if template already exists
      const templatesRef = collection(db, 'clubs', clubId, 'email_templates');
      const q = query(templatesRef, where('emailType', '==', template.emailType));
      const existing = await getDocs(q);

      if (!existing.empty) {
        console.log(`⚠️  Template "${template.name}" already exists, skipping...`);
        result.skipped++;
        continue;
      }

      // Create template
      const templateData = {
        ...template,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: userId,
      };

      await addDoc(templatesRef, templateData);
      console.log(`✅ Created template "${template.name}"`);
      result.created++;
    } catch (error: any) {
      console.error(`❌ Error creating template "${template.name}":`, error);
      result.errors.push(`${template.name}: ${error.message}`);
      result.success = false;
    }
  }

  return result;
}
