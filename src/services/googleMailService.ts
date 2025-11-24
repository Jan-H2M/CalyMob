import { auth, db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { getTemplate, renderTemplate } from './emailTemplateService';
import { FirebaseSettingsService } from './firebaseSettingsService';
import type { EmailTemplateType } from '@/types/emailTemplates';
import type { User } from '@/types/user.types';
import Handlebars from 'handlebars';

/**
 * Service pour envoyer des emails via Google Mail API (Gmail)
 * Uses Vercel Serverless Function instead of Firebase Callable Function
 * to avoid Cloud Build infrastructure issues
 */
export class GoogleMailService {
  /**
   * Envoyer un email via Google Mail API
   *
   * @param clubId - ID du club
   * @param to - Adresse email du destinataire
   * @param subject - Sujet de l'email
   * @param htmlBody - Corps de l'email en HTML
   * @param textBody - Corps de l'email en texte brut (fallback)
   * @returns Promise avec le résultat de l'envoi
   */
  static async sendEmail(
    clubId: string,
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string
  ): Promise<{ success: boolean; messageId: string; message: string }> {
    try {
      // Get Firebase ID token for authentication
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User must be authenticated to send emails');
      }

      // Load email configuration from Firestore (includes provider selection)
      const emailConfig = await FirebaseSettingsService.loadEmailConfig(clubId);

      console.log('📧 Email Config loaded:', {
        provider: emailConfig.provider,
        fromEmail: emailConfig[emailConfig.provider].fromEmail,
        fromName: emailConfig[emailConfig.provider].fromName
      });

      // Use the selected email provider
      if (emailConfig.provider === 'resend') {
        // Call Resend API via Vercel Serverless Function
        const response = await fetch('/api/send-resend', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            apiKey: emailConfig.resend.apiKey,
            from: `${emailConfig.resend.fromName || 'Calypso Diving Club'} <${emailConfig.resend.fromEmail || 'onboarding@resend.dev'}>`,
            to,
            subject,
            html: htmlBody,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send email via Resend');
        }

        const data = await response.json();
        console.log('✅ Email envoyé avec succès via Resend:', data.messageId);
        return data;
      } else {
        // Call Gmail API via Vercel Serverless Function
        const response = await fetch('/api/send-gmail', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientId: emailConfig.gmail.clientId,
            clientSecret: emailConfig.gmail.clientSecret,
            refreshToken: emailConfig.gmail.refreshToken,
            fromEmail: emailConfig.gmail.fromEmail || 'noreply@calypso-diving.be',
            fromName: emailConfig.gmail.fromName || 'Calypso Diving Club',
            to,
            subject,
            htmlBody,
            textBody: textBody || htmlBody.replace(/<[^>]*>/g, ''),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to send email via Gmail');
        }

        const data = await response.json();
        console.log('✅ Email envoyé avec succès via Gmail:', data.messageId);
        return data;
      }
    } catch (error: any) {
      console.error('❌ Erreur lors de l\'envoi de l\'email:', error);

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
    toEmail: string
  ): Promise<{ success: boolean; messageId: string; message: string }> {
    const subject = '🧪 Email de test - CalyCompta';
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
            <h1>🎉 Configuration Google Mail réussie !</h1>
          </div>
          <div class="content">
            <p>Bonjour,</p>

            <div class="success-badge">✅ Test réussi</div>

            <p>Votre configuration Google Mail API est correctement configurée et fonctionnelle.</p>

            <p><strong>Détails de la configuration :</strong></p>
            <ul>
              <li>✅ Authentification OAuth2 réussie</li>
              <li>✅ Connexion à Gmail API établie</li>
              <li>✅ Envoi d'emails activé</li>
            </ul>

            <p>Vous pouvez maintenant utiliser Google Mail pour envoyer des emails automatisés depuis CalyCompta.</p>

            <p>Pour configurer des envois planifiés, rendez-vous dans <strong>Paramètres → Communication</strong>.</p>

            <div class="footer">
              <p>Cet email a été envoyé automatiquement par CalyCompta via Google Mail API</p>
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
      // 0. Update the password in Firebase Auth first
      // This ensures the password in the email matches Firebase Auth
      console.log('🔐 Updating Firebase Auth password before sending email...');
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User must be authenticated to update passwords');
      }

      const authToken = await currentUser.getIdToken();
      const updatePasswordResponse = await fetch('/api/update-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          newPassword: temporaryPassword,
          authToken,
          clubId,
        }),
      });

      if (!updatePasswordResponse.ok) {
        const errorData = await updatePasswordResponse.json();
        throw new Error(errorData.error || 'Failed to update password in Firebase Auth');
      }

      console.log('✅ Password updated in Firebase Auth');

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
        renderResult.html
      );

      // 6. Sauvegarder dans l'historique
      try {
        const emailHistoryRef = collection(db, 'clubs', clubId, 'email_history');
        await addDoc(emailHistoryRef, {
          recipientEmail: user.email,
          recipientName: templateData.recipientName,
          recipientId: user.id,
          subject: renderedSubject,
          htmlContent: renderResult.html,
          templateId,
          templateType,
          templateName: template.name,
          sendType: 'manual',
          sentBy: sentByUserId,
          sentByName,
          status: 'sent',
          createdAt: serverTimestamp(),
          sentAt: serverTimestamp(),
          clubId,
        });
      } catch (historyError) {
        console.error('Erreur lors de la sauvegarde de l\'historique:', historyError);
        // Ne pas faire échouer l'envoi si la sauvegarde échoue
      }

      return sendResult;
    } catch (error: any) {
      console.error('❌ Erreur lors de l\'envoi de l\'email utilisateur:', error);

      // Sauvegarder l'échec dans l'historique
      try {
        const emailHistoryRef = collection(db, 'clubs', clubId, 'email_history');
        await addDoc(emailHistoryRef, {
          recipientEmail: user.email,
          recipientName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.displayName || user.email,
          recipientId: user.id,
          subject: 'Email non envoyé',
          htmlContent: '',
          templateId,
          templateType,
          sendType: 'manual',
          sentBy: sentByUserId,
          sentByName,
          status: 'failed',
          statusMessage: error.message,
          createdAt: serverTimestamp(),
          clubId,
        });
      } catch (historyError) {
        console.error('Erreur lors de la sauvegarde de l\'échec:', historyError);
      }

      throw new Error(error.message || 'Erreur lors de l\'envoi de l\'email');
    }
  }
}
