import { auth } from '@/lib/firebase';
import { getTemplate, renderTemplate } from './emailTemplateService';
import { FirebaseSettingsService } from './firebaseSettingsService';
import type { EmailTemplateType } from '@/types/emailTemplates';
import type { User } from '@/types/user.types';
import Handlebars from 'handlebars';
import { logger } from '@/utils/logger';

// API base URL - use Vercel URL in development since API routes only work there
const apiBase = (import.meta as any).env?.PROD ? '' : 'https://caly-compta.vercel.app';

export interface EmailHistoryMetadata {
  recipientName?: string;
  recipientId?: string;
  templateId?: string;
  templateType?: EmailTemplateType;
  templateName?: string;
  sendType?: string;
  sentBy?: string;
  sentByName?: string;
  jobId?: string;
  jobName?: string;
  demandeId?: string;
  emailType?: string;
}

/**
 * Service pour envoyer des emails du club via le fournisseur configure
 * (Gmail ou Resend) a travers une route server-side securisee.
 */
export class ClubEmailService {
  /**
   * Envoyer un email via le fournisseur email configure pour le club
   *
   * @param clubId - ID du club
   * @param to - Adresse email du destinataire
   * @param subject - Sujet de l'email
   * @param htmlBody - Corps de l'email en HTML
   * @param textBody - Corps de l'email en texte brut (fallback)
   * @param replyTo - Adresse email pour les réponses (optionnel)
   * @param replyToName - Nom pour l'adresse reply-to (optionnel)
   * @returns Promise avec le résultat de l'envoi
   */
  static async sendEmail(
    clubId: string,
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
    replyTo?: string,
    replyToName?: string,
    historyEntry?: EmailHistoryMetadata
  ): Promise<{ success: boolean; messageId: string; message: string }> {
    try {
      // Get Firebase ID token for authentication
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User must be authenticated to send emails');
      }

      const authToken = await user.getIdToken();

      const response = await fetch(`${apiBase}/api/send-club-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          clubId,
          to,
          subject,
          htmlBody,
          textBody: textBody || htmlBody.replace(/<[^>]*>/g, ''),
          replyTo,
          replyToName,
          historyEntry,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || 'Failed to send club email');
      }

      const data = await response.json();
      logger.debug('✅ Email envoyé avec succès via server-side provider:', data.messageId);
      return data;
    } catch (error: any) {
      logger.error('❌ Erreur lors de l\'envoi de l\'email:', error);

      // Re-throw with more context
      throw new Error(
        error.message || 'Erreur lors de l\'envoi de l\'email'
      );
    }
  }

  /**
   * Envoyer un email de test pour vérifier la configuration
   *
   * @param clubId - ID du club
   * @param toEmail - Adresse email du destinataire (généralement l'admin)
   * @returns Promise avec le résultat de l'envoi
   */
  static async sendTestEmail(
    clubId: string,
    toEmail: string,
    providerLabel = 'Email',
    providerDetails: string[] = []
  ): Promise<{ success: boolean; messageId: string; message: string }> {
    const subject = `🧪 Email de test - ${providerLabel}`;
    const detailsList = providerDetails.length > 0
      ? providerDetails.map(detail => `<li>✅ ${detail}</li>`).join('')
      : '<li>✅ Configuration chargée correctement</li><li>✅ Connexion au fournisseur établie</li><li>✅ Envoi d\'emails activé</li>';

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background-color: #3b82f6;
              color: white;
              padding: 20px;
              border-radius: 8px 8px 0 0;
              text-align: center;
            }
            .content {
              background-color: #f9fafb;
              padding: 30px;
              border: 1px solid #e5e7eb;
              border-top: none;
              border-radius: 0 0 8px 8px;
            }
            .success-badge {
              display: inline-block;
              background-color: #10b981;
              color: white;
              padding: 8px 16px;
              border-radius: 4px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🎉 Configuration ${providerLabel} réussie !</h1>
          </div>
          <div class="content">
            <p>Bonjour,</p>

            <div class="success-badge">✅ Test réussi</div>

            <p>Votre configuration ${providerLabel} est correctement configurée et fonctionnelle.</p>

            <p><strong>Détails de la configuration :</strong></p>
            <ul>
              ${detailsList}
            </ul>

            <p>Vous pouvez maintenant utiliser ${providerLabel} pour envoyer des emails automatisés depuis CalyCompta.</p>

            <p>Pour configurer des envois planifiés, rendez-vous dans <strong>Paramètres → Communication</strong>.</p>

            <div class="footer">
              <p>Cet email a été envoyé automatiquement par CalyCompta via ${providerLabel}</p>
              <p>Club ID: ${clubId}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(clubId, toEmail, subject, htmlBody);
  }

  /**
   * Envoyer un email à un utilisateur avec un template
   *
   * @param clubId - ID du club
   * @param user - Utilisateur destinataire
   * @param templateId - ID du template à utiliser
   * @param templateType - Type du template
   * @param temporaryPassword - Mot de passe temporaire à inclure
   * @param sentByUserId - ID de l'utilisateur qui envoie l'email
   * @param sentByName - Nom de l'utilisateur qui envoie l'email
   * @returns Promise avec le résultat de l'envoi
   */
  static async sendUserEmail(
    clubId: string,
    user: User,
    templateId: string,
    templateType: EmailTemplateType,
    temporaryPassword: string,
    sentByUserId: string,
    sentByName: string
  ): Promise<{ success: boolean; messageId: string; message: string }> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be authenticated to send emails');
      }

      const authToken = await currentUser.getIdToken();
      const cacheBuster = `?t=${Date.now()}`;

      // 0. First, try to update the password (this will fail if user doesn't exist in Firebase Auth)
      logger.debug('🔐 Attempting to update Firebase Auth password...');
      const updatePasswordResponse = await fetch(`/api/update-user-password${cacheBuster}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          userId: user.id,
          newPassword: temporaryPassword,
          authToken,
          clubId,
        }),
      });

      // If update fails with 404, user doesn't exist in Firebase Auth yet
      // So we need to activate them first
      if (!updatePasswordResponse.ok) {
        const errorData = await updatePasswordResponse.json();

        // Check if error is "User not found" (user not in Firebase Auth)
        if (errorData.error === 'User not found' || errorData.details?.includes('No Firebase Auth user')) {
          logger.debug('⚠️ User not in Firebase Auth yet, activating first...');

          // Call activate-user API to create Firebase Auth account
          const activateResponse = await fetch(`/api/activate-user${cacheBuster}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
            body: JSON.stringify({
              userId: user.id,
              clubId,
              authToken,
            }),
          });

          if (!activateResponse.ok) {
            const activateError = await activateResponse.json();

            // If activation fails because user is not pending, we need to use a different approach
            // This happens for users created manually or imported without the pendingActivation flag
            if (activateError.error?.includes('déjà activé') || activateError.error?.includes('pas en attente')) {
              logger.debug('⚠️ User not pending activation, cannot use activate-user API');
              logger.debug('💡 User needs to be activated manually via "Activer Firebase Auth" button first');
              throw new Error(
                'Cet utilisateur doit d\'abord être activé via le bouton "Activer Firebase Auth" dans la fiche utilisateur avant d\'envoyer un email.'
              );
            }

            throw new Error(activateError.error || 'Failed to activate user in Firebase Auth');
          }

          await activateResponse.json();
          logger.debug('✅ User activated in Firebase Auth with default password');

          // Now update the password to the temporary password
          const retryUpdateResponse = await fetch(`/api/update-user-password${cacheBuster}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
            },
            body: JSON.stringify({
              userId: user.id,
              newPassword: temporaryPassword,
              authToken,
              clubId,
            }),
          });

          if (!retryUpdateResponse.ok) {
            const retryError = await retryUpdateResponse.json();
            throw new Error(retryError.error || 'Failed to update password after activation');
          }

          logger.debug('✅ Password updated after activation');
        } else {
          // Different error, throw it
          throw new Error(errorData.error || 'Failed to update password in Firebase Auth');
        }
      } else {
        logger.debug('✅ Password updated in Firebase Auth');
      }

      // 1. Récupérer le template
      const template = await getTemplate(clubId, templateId);
      if (!template) {
        throw new Error('Template non trouvé');
      }

      // 2. Récupérer les paramètres du club (nom et logo)
      const clubSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);

      // 3. Préparer les données pour le rendu
      const templateData = {
        recipientName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email,
        temporaryPassword,
        clubName: clubSettings.clubName || 'Calypso Diving Club',
        logoUrl: clubSettings.logoUrl || '',
        appUrl: window.location.origin,
        // Inject style variables
        ...template.styles,
      };

      // 3. Rendre le template
      const renderResult = renderTemplate(template, templateData);
      if (!renderResult.success || !renderResult.html) {
        throw new Error(renderResult.error || 'Erreur lors du rendu du template');
      }

      // 4. Rendre le sujet
      const subjectTemplate = Handlebars.compile(template.subject);
      const renderedSubject = subjectTemplate(templateData);

      // 5. Envoyer l'email
      const sendResult = await this.sendEmail(
        clubId,
        user.email,
        renderedSubject,
        renderResult.html,
        undefined,
        undefined,
        undefined,
        {
          recipientName: templateData.recipientName,
          recipientId: user.id,
          templateId,
          templateType,
          templateName: template.name,
          sendType: 'manual',
          sentBy: sentByUserId,
          sentByName,
        }
      );

      return sendResult;
    } catch (error: any) {
      logger.error('❌ Erreur lors de l\'envoi de l\'email utilisateur:', error);
      throw new Error(error.message || 'Erreur lors de l\'envoi de l\'email');
    }
  }
}
