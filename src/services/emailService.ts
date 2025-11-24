/**
 * Service de gestion des emails
 * Déclenche l'envoi d'emails via Firebase Cloud Functions + SendGrid
 *
 * CalyCompta - Module Inventaire
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { Loan, Member, InventoryItem, Sale, StockProduct, Order } from '@/types/inventory';

/**
 * Types d'emails supportés
 */
export type EmailType =
  | 'loan_confirmation'      // Confirmation création prêt + contrat PDF
  | 'loan_reminder_before'   // Rappel retour J-3
  | 'loan_reminder_after'    // Rappel retour J+1 (retard)
  | 'loan_overdue'           // Retard important J+7
  | 'loan_return_confirmation' // Confirmation retour matériel
  | 'refund_confirmation'    // Confirmation remboursement caution
  | 'sale_receipt'           // Reçu de vente boutique
  | 'stock_low_alert'        // Alerte stock bas
  | 'order_confirmation';    // Confirmation commande fournisseur

/**
 * Données email confirmation prêt
 */
export interface LoanConfirmationEmailData {
  type: 'loan_confirmation';
  loan: Loan;
  member: Member;
  items: InventoryItem[];
  contractPdfUrl?: string; // URL Firebase Storage du contrat PDF
  clubInfo: {
    nom: string;
    email: string;
    telephone?: string;
  };
}

/**
 * Données email rappel retour
 */
export interface LoanReminderEmailData {
  type: 'loan_reminder_before' | 'loan_reminder_after' | 'loan_overdue';
  loan: Loan;
  member: Member;
  items: InventoryItem[];
  daysOverdue?: number; // Pour loan_overdue
  clubInfo: {
    nom: string;
    email: string;
    telephone?: string;
  };
}

/**
 * Données email confirmation retour
 */
export interface LoanReturnEmailData {
  type: 'loan_return_confirmation' | 'refund_confirmation';
  loan: Loan;
  member: Member;
  items: InventoryItem[];
  cautionRefunded?: number;
  clubInfo: {
    nom: string;
    email: string;
  };
}

/**
 * Données email reçu vente
 */
export interface SaleReceiptEmailData {
  type: 'sale_receipt';
  sale: Sale;
  product: StockProduct;
  member: Member;
  receiptPdfUrl?: string;
  clubInfo: {
    nom: string;
    email: string;
  };
}

/**
 * Données email alerte stock
 */
export interface StockAlertEmailData {
  type: 'stock_low_alert';
  product: StockProduct;
  currentStock: number;
  minStock: number;
  recipients: string[]; // Emails des responsables
  clubInfo: {
    nom: string;
  };
}

/**
 * Union type de toutes les données email
 */
export type EmailData =
  | LoanConfirmationEmailData
  | LoanReminderEmailData
  | LoanReturnEmailData
  | SaleReceiptEmailData
  | StockAlertEmailData;

/**
 * Résultat envoi email
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Service Email
 */
export class EmailService {

  /**
   * Envoie un email via Cloud Function
   *
   * @param clubId - ID du club
   * @param emailData - Données de l'email
   * @returns Résultat de l'envoi
   */
  static async sendEmail(clubId: string, emailData: EmailData): Promise<SendEmailResult> {
    try {
      console.log(`[EmailService] Sending email type: ${emailData.type} for club: ${clubId}`);

      const sendEmailFunction = httpsCallable<
        { clubId: string; emailData: EmailData },
        SendEmailResult
      >(functions, 'sendInventoryEmail');

      const result = await sendEmailFunction({
        clubId,
        emailData
      });

      console.log('[EmailService] Email sent successfully:', result.data);
      return result.data;

    } catch (error: any) {
      console.error('[EmailService] Error sending email:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de l\'envoi de l\'email'
      };
    }
  }

  /**
   * Envoie email de confirmation de prêt avec contrat PDF
   *
   * @param clubId - ID du club
   * @param loan - Prêt créé
   * @param member - Membre emprunteur
   * @param items - Matériels prêtés
   * @param contractPdfUrl - URL Firebase Storage du contrat
   * @param clubInfo - Infos du club
   */
  static async sendLoanConfirmation(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    contractPdfUrl: string | undefined,
    clubInfo: { nom: string; email: string; telephone?: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'loan_confirmation',
      loan,
      member,
      items,
      contractPdfUrl,
      clubInfo
    });
  }

  /**
   * Envoie email de rappel de retour (J-3 avant date prévue)
   *
   * @param clubId - ID du club
   * @param loan - Prêt concerné
   * @param member - Membre emprunteur
   * @param items - Matériels prêtés
   * @param clubInfo - Infos du club
   */
  static async sendLoanReminderBefore(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    clubInfo: { nom: string; email: string; telephone?: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'loan_reminder_before',
      loan,
      member,
      items,
      clubInfo
    });
  }

  /**
   * Envoie email de rappel retour après date prévue (retard)
   *
   * @param clubId - ID du club
   * @param loan - Prêt en retard
   * @param member - Membre emprunteur
   * @param items - Matériels prêtés
   * @param clubInfo - Infos du club
   */
  static async sendLoanReminderAfter(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    clubInfo: { nom: string; email: string; telephone?: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'loan_reminder_after',
      loan,
      member,
      items,
      clubInfo
    });
  }

  /**
   * Envoie email alerte retard important (J+7)
   *
   * @param clubId - ID du club
   * @param loan - Prêt très en retard
   * @param member - Membre emprunteur
   * @param items - Matériels prêtés
   * @param daysOverdue - Nombre de jours de retard
   * @param clubInfo - Infos du club
   */
  static async sendLoanOverdueAlert(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    daysOverdue: number,
    clubInfo: { nom: string; email: string; telephone?: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'loan_overdue',
      loan,
      member,
      items,
      daysOverdue,
      clubInfo
    });
  }

  /**
   * Envoie email confirmation retour matériel
   *
   * @param clubId - ID du club
   * @param loan - Prêt retourné
   * @param member - Membre emprunteur
   * @param items - Matériels retournés
   * @param clubInfo - Infos du club
   */
  static async sendLoanReturnConfirmation(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    clubInfo: { nom: string; email: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'loan_return_confirmation',
      loan,
      member,
      items,
      clubInfo
    });
  }

  /**
   * Envoie email confirmation remboursement caution
   *
   * @param clubId - ID du club
   * @param loan - Prêt avec caution remboursée
   * @param member - Membre emprunteur
   * @param items - Matériels retournés
   * @param cautionRefunded - Montant caution remboursé
   * @param clubInfo - Infos du club
   */
  static async sendRefundConfirmation(
    clubId: string,
    loan: Loan,
    member: Member,
    items: InventoryItem[],
    cautionRefunded: number,
    clubInfo: { nom: string; email: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'refund_confirmation',
      loan,
      member,
      items,
      cautionRefunded,
      clubInfo
    });
  }

  /**
   * Envoie reçu de vente par email
   *
   * @param clubId - ID du club
   * @param sale - Vente
   * @param product - Produit vendu
   * @param member - Membre client
   * @param receiptPdfUrl - URL Firebase Storage du reçu
   * @param clubInfo - Infos du club
   */
  static async sendSaleReceipt(
    clubId: string,
    sale: Sale,
    product: StockProduct,
    member: Member,
    receiptPdfUrl: string | undefined,
    clubInfo: { nom: string; email: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'sale_receipt',
      sale,
      product,
      member,
      receiptPdfUrl,
      clubInfo
    });
  }

  /**
   * Envoie alerte stock bas aux responsables
   *
   * @param clubId - ID du club
   * @param product - Produit concerné
   * @param currentStock - Stock actuel
   * @param minStock - Stock minimum
   * @param recipients - Emails des responsables
   * @param clubInfo - Infos du club
   */
  static async sendStockLowAlert(
    clubId: string,
    product: StockProduct,
    currentStock: number,
    minStock: number,
    recipients: string[],
    clubInfo: { nom: string }
  ): Promise<SendEmailResult> {
    return this.sendEmail(clubId, {
      type: 'stock_low_alert',
      product,
      currentStock,
      minStock,
      recipients,
      clubInfo
    });
  }
}
