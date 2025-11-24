/**
 * Service de gestion des emails de communication
 * Déclenche l'envoi d'emails programmés via Firebase Cloud Functions + Google Mail API
 *
 * CalyCompta - Module Communication
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { PendingDemandsEmailData, EmailSendResult } from '@/types/communication';

/**
 * Service Email Communication
 */
export class CommunicationEmailService {

  /**
   * Envoie un email de test pour les demandes en attente
   *
   * @param clubId - ID du club
   * @param recipientEmail - Email du destinataire (pour test)
   * @param recipientName - Nom du destinataire
   * @returns Résultat de l'envoi
   */
  static async sendTestPendingDemandsEmail(
    clubId: string,
    recipientEmail: string,
    recipientName: string
  ): Promise<EmailSendResult> {
    try {
      console.log('[CommunicationEmailService] Sending test pending demands email');

      // TODO: Implement test email function call
      // const testEmailFunction = httpsCallable<any, EmailSendResult>(
      //   functions,
      //   'sendTestPendingDemandsEmail'
      // );

      // const result = await testEmailFunction({
      //   clubId,
      //   recipientEmail,
      //   recipientName,
      // });

      // return result.data;

      // For now, simulate success
      await new Promise(resolve => setTimeout(resolve, 1000));

      return {
        success: true,
        messageId: `test-${Date.now()}`,
        timestamp: new Date(),
      };

    } catch (error: any) {
      console.error('[CommunicationEmailService] Error sending test email:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'envoi de l\'email de test',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Envoie les emails de rappel pour les demandes en attente
   * (appelé par la Cloud Function scheduled)
   *
   * @param clubId - ID du club
   * @param emailData - Données de l'email
   * @returns Résultat de l'envoi
   */
  static async sendPendingDemandsReminder(
    clubId: string,
    emailData: PendingDemandsEmailData
  ): Promise<EmailSendResult> {
    try {
      console.log(`[CommunicationEmailService] Sending pending demands reminder to: ${emailData.recipientEmail}`);

      const sendEmailFunction = httpsCallable<
        { clubId: string; emailData: PendingDemandsEmailData },
        EmailSendResult
      >(functions, 'sendPendingDemandsEmail');

      const result = await sendEmailFunction({
        clubId,
        emailData
      });

      console.log('[CommunicationEmailService] Email sent successfully:', result.data);
      return result.data;

    } catch (error: any) {
      console.error('[CommunicationEmailService] Error sending email:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'envoi de l\'email',
        timestamp: new Date(),
      };
    }
  }
}
