import { db } from '@/lib/firebase';
import { collection, doc, setDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { TransactionBancaire, Sale, Order } from '@/types';

/**
 * Service pour générer des transactions bancaires depuis les opérations d'inventaire
 *
 * Intégration avec le module comptable existant:
 * - Génère des TransactionBancaire dans /clubs/{clubId}/bank_transactions/
 * - Lie automatiquement via linked_to_sale_id ou linked_to_order_id
 * - Applique fiscal_year_id pour intégration avec clôtures annuelles
 */
export class InventoryTransactionService {

  /**
   * Générer une transaction bancaire depuis une vente de stock
   *
   * Appelé après enregistrement d'une vente pour créer la transaction correspondante
   */
  static async createTransactionFromSale(
    clubId: string,
    sale: Sale,
    options?: {
      bankAccount?: string;          // IBAN du compte (défaut: compte principal club)
      autoReconcile?: boolean;        // Marquer comme réconciliée (défaut: true)
      userInfo?: { id: string; nom: string }; // Info utilisateur pour audit
    }
  ): Promise<string> {
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'bank_transactions');
      const newTransactionRef = doc(transactionsRef);

      // Générer numéro de séquence unique (format: INV-SALE-{timestamp})
      const numeroSequence = `INV-SALE-${Date.now()}`;

      // Créer le hash de déduplication
      const hashContent = `${numeroSequence}-${sale.date_vente.toMillis()}-${sale.montant_total}`;
      const hashDedup = await this.generateHash(hashContent);

      const transaction: Omit<TransactionBancaire, 'id'> = {
        // Identifiants
        numero_sequence: numeroSequence,
        hash_dedup: hashDedup,

        // Dates
        date_execution: sale.date_vente,
        date_valeur: sale.date_vente,

        // Montant (positif = revenu)
        montant: sale.montant_total,
        devise: 'EUR',

        // Compte
        numero_compte: options?.bankAccount || '',

        // Type et statut
        type_transaction: 'Vente stock - Inventaire',
        statut: 'accepte',
        type: 'income',

        // Contrepartie (info membre)
        contrepartie_iban: '',
        contrepartie_nom: sale.memberId ? `Membre ${sale.memberId}` : 'Vente stock',
        communication: `Vente stock - ${sale.productId}`,
        details: sale.notes || `Vente: ${sale.quantite} unité(s)`,

        // Catégorisation automatique
        categorie: 'ventes_materiel',
        code_comptable: '740-00', // Ventes de marchandises (à adapter selon plan comptable club)

        // Liaison inventaire
        linked_to_sale_id: sale.id,

        // Réconciliation
        reconcilie: options?.autoReconcile !== false,
        statut_reconciliation: 'reconcilie',

        // Année fiscale (extraite de la date de vente)
        fiscal_year_id: sale.fiscal_year_id || sale.date_vente.toDate().getFullYear().toString(),

        // Matched entities
        matched_entities: [{
          entity_type: 'member',
          entity_id: sale.memberId,
          entity_name: sale.memberId,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'auto'
        }],

        // Métadonnées
        created_at: new Date(),
        updated_at: new Date()
      };

      await setDoc(newTransactionRef, {
        ...transaction,
        id: newTransactionRef.id
      });

      console.log(`Transaction créée depuis vente: ${newTransactionRef.id} (${sale.montant_total} €)`);
      return newTransactionRef.id;
    } catch (error) {
      console.error('Erreur création transaction depuis vente:', error);
      throw error;
    }
  }

  /**
   * Générer une transaction bancaire depuis une commande fournisseur
   *
   * Appelé après livraison d'une commande pour créer la transaction de paiement
   */
  static async createTransactionFromOrder(
    clubId: string,
    order: Order,
    options?: {
      bankAccount?: string;
      autoReconcile?: boolean;
      userInfo?: { id: string; nom: string };
    }
  ): Promise<string> {
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'bank_transactions');
      const newTransactionRef = doc(transactionsRef);

      // Générer numéro de séquence unique (format: INV-ORDER-{timestamp})
      const numeroSequence = `INV-ORDER-${Date.now()}`;

      // Créer le hash de déduplication
      const hashContent = `${numeroSequence}-${order.date_commande.toMillis()}-${order.montant_total}`;
      const hashDedup = await this.generateHash(hashContent);

      const transaction: Omit<TransactionBancaire, 'id'> = {
        // Identifiants
        numero_sequence: numeroSequence,
        hash_dedup: hashDedup,

        // Dates (date de livraison ou commande)
        date_execution: order.date_livraison || order.date_commande,
        date_valeur: order.date_livraison || order.date_commande,

        // Montant (négatif = dépense)
        montant: -Math.abs(order.montant_total),
        devise: 'EUR',

        // Compte
        numero_compte: options?.bankAccount || '',

        // Type et statut
        type_transaction: 'Achat stock - Inventaire',
        statut: 'accepte',
        type: 'expense',

        // Contrepartie (fournisseur)
        contrepartie_iban: '',
        contrepartie_nom: order.fournisseur,
        communication: `Commande stock - ${order.items.length} produit(s)`,
        details: order.notes || `Commande: ${order.items.map(i => `${i.quantite}x ${i.productId}`).join(', ')}`,

        // Catégorisation automatique
        categorie: 'achats_materiel',
        code_comptable: '604-00', // Achats de marchandises (à adapter selon plan comptable club)

        // Liaison inventaire
        linked_to_order_id: order.id,

        // Réconciliation
        reconcilie: options?.autoReconcile !== false,
        statut_reconciliation: 'reconcilie',

        // Année fiscale
        fiscal_year_id: order.fiscal_year_id || order.date_commande.toDate().getFullYear().toString(),

        // Métadonnées
        created_at: new Date(),
        updated_at: new Date()
      };

      await setDoc(newTransactionRef, {
        ...transaction,
        id: newTransactionRef.id
      });

      console.log(`Transaction créée depuis commande: ${newTransactionRef.id} (-${order.montant_total} €)`);
      return newTransactionRef.id;
    } catch (error) {
      console.error('Erreur création transaction depuis commande:', error);
      throw error;
    }
  }

  /**
   * Générer une transaction bancaire depuis un prêt de matériel (paiement caution)
   *
   * Appelé au moment du prêt pour enregistrer le paiement de la caution
   */
  static async createTransactionFromLoan(
    clubId: string,
    loanId: string,
    loanData: {
      memberId: string;
      memberName?: string;
      montant_caution: number;
      date_pret: Timestamp;
      fiscal_year_id?: string;
    },
    options?: {
      bankAccount?: string;
      autoReconcile?: boolean;
    }
  ): Promise<string> {
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'bank_transactions');
      const newTransactionRef = doc(transactionsRef);

      // Générer numéro de séquence unique (format: INV-LOAN-{timestamp})
      const numeroSequence = `INV-LOAN-${Date.now()}`;

      // Créer le hash de déduplication
      const hashContent = `${numeroSequence}-${loanData.date_pret.toMillis()}-${loanData.montant_caution}`;
      const hashDedup = await this.generateHash(hashContent);

      const transaction: Omit<TransactionBancaire, 'id'> = {
        // Identifiants
        numero_sequence: numeroSequence,
        hash_dedup: hashDedup,

        // Dates
        date_execution: loanData.date_pret,
        date_valeur: loanData.date_pret,

        // Montant (positif = revenu - caution reçue)
        montant: loanData.montant_caution,
        devise: 'EUR',

        // Compte
        numero_compte: options?.bankAccount || '',

        // Type et statut
        type_transaction: 'Caution prêt matériel - Inventaire',
        statut: 'accepte',
        type: 'income',

        // Contrepartie (membre)
        contrepartie_iban: '',
        contrepartie_nom: loanData.memberName || `Membre ${loanData.memberId}`,
        communication: `Caution prêt matériel`,
        details: `Caution pour prêt ${loanId}`,

        // Catégorisation automatique
        categorie: 'cautions',
        code_comptable: '439-00', // Autres dettes diverses (cautions)

        // Liaison inventaire
        linked_to_loan_id: loanId,

        // Réconciliation
        reconcilie: options?.autoReconcile !== false,
        statut_reconciliation: 'reconcilie',

        // Année fiscale
        fiscal_year_id: loanData.fiscal_year_id || loanData.date_pret.toDate().getFullYear().toString(),

        // Matched entities
        matched_entities: [{
          entity_type: 'member',
          entity_id: loanData.memberId,
          entity_name: loanData.memberName,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'auto'
        }],

        // Métadonnées
        created_at: new Date(),
        updated_at: new Date()
      };

      await setDoc(newTransactionRef, {
        ...transaction,
        id: newTransactionRef.id
      });

      console.log(`Transaction caution créée depuis prêt: ${newTransactionRef.id} (${loanData.montant_caution} €)`);
      return newTransactionRef.id;
    } catch (error) {
      console.error('Erreur création transaction depuis prêt:', error);
      throw error;
    }
  }

  /**
   * Générer une transaction bancaire depuis le retour d'un prêt (remboursement caution)
   *
   * Appelé au retour du matériel pour enregistrer le remboursement de la caution
   */
  static async createTransactionFromLoanReturn(
    clubId: string,
    loanId: string,
    returnData: {
      memberId: string;
      memberName?: string;
      caution_retournee: number;
      date_retour: Timestamp;
      fiscal_year_id?: string;
    },
    options?: {
      bankAccount?: string;
      autoReconcile?: boolean;
    }
  ): Promise<string> {
    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'bank_transactions');
      const newTransactionRef = doc(transactionsRef);

      // Générer numéro de séquence unique (format: INV-RETURN-{timestamp})
      const numeroSequence = `INV-RETURN-${Date.now()}`;

      // Créer le hash de déduplication
      const hashContent = `${numeroSequence}-${returnData.date_retour.toMillis()}-${returnData.caution_retournee}`;
      const hashDedup = await this.generateHash(hashContent);

      const transaction: Omit<TransactionBancaire, 'id'> = {
        // Identifiants
        numero_sequence: numeroSequence,
        hash_dedup: hashDedup,

        // Dates
        date_execution: returnData.date_retour,
        date_valeur: returnData.date_retour,

        // Montant (négatif = dépense - remboursement caution)
        montant: -Math.abs(returnData.caution_retournee),
        devise: 'EUR',

        // Compte
        numero_compte: options?.bankAccount || '',

        // Type et statut
        type_transaction: 'Remboursement caution - Inventaire',
        statut: 'accepte',
        type: 'expense',

        // Contrepartie (membre)
        contrepartie_iban: '',
        contrepartie_nom: returnData.memberName || `Membre ${returnData.memberId}`,
        communication: `Remboursement caution prêt matériel`,
        details: `Remboursement caution pour prêt ${loanId}`,

        // Catégorisation automatique
        categorie: 'cautions',
        code_comptable: '439-00', // Autres dettes diverses (cautions)

        // Liaison inventaire
        linked_to_loan_id: loanId,

        // Réconciliation
        reconcilie: options?.autoReconcile !== false,
        statut_reconciliation: 'reconcilie',

        // Année fiscale
        fiscal_year_id: returnData.fiscal_year_id || returnData.date_retour.toDate().getFullYear().toString(),

        // Matched entities
        matched_entities: [{
          entity_type: 'member',
          entity_id: returnData.memberId,
          entity_name: returnData.memberName,
          confidence: 100,
          matched_at: new Date(),
          matched_by: 'auto'
        }],

        // Métadonnées
        created_at: new Date(),
        updated_at: new Date()
      };

      await setDoc(newTransactionRef, {
        ...transaction,
        id: newTransactionRef.id
      });

      console.log(`Transaction remboursement créée depuis retour prêt: ${newTransactionRef.id} (-${returnData.caution_retournee} €)`);
      return newTransactionRef.id;
    } catch (error) {
      console.error('Erreur création transaction depuis retour prêt:', error);
      throw error;
    }
  }

  /**
   * Générer un hash SHA-256 pour déduplication
   */
  private static async generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }
}
