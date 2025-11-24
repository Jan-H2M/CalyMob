import { db, storage } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { Loan, Checklist, CautionRule } from '@/types/inventory';
import { InventoryConfigService } from './inventoryConfigService';
import { InventoryItemService } from './inventoryItemService';

/**
 * Service pour gérer les prêts de matériel dans Firebase
 *
 * Collection: /clubs/{clubId}/inventory_loans/{loanId}
 * Signatures: Firebase Storage /clubs/{clubId}/loan_signatures/{loanId}_{type}.png
 */
export class LoanService {

  // ========================================
  // CRUD PRÊTS
  // ========================================

  /**
   * Récupérer tous les prêts avec filtres optionnels
   */
  static async getLoans(
    clubId: string,
    filters?: {
      memberId?: string;
      itemId?: string;
      statut?: 'actif' | 'rendu' | 'en_retard';
      search?: string;
    }
  ): Promise<Loan[]> {
    try {
      const loansRef = collection(db, 'clubs', clubId, 'inventory_loans');
      let q = query(loansRef, orderBy('date_pret', 'desc'));

      // Appliquer filtres Firestore
      if (filters?.memberId) {
        q = query(loansRef, where('memberId', '==', filters.memberId), orderBy('date_pret', 'desc'));
      }

      if (filters?.itemId) {
        q = query(loansRef, where('itemIds', 'array-contains', filters.itemId), orderBy('date_pret', 'desc'));
      }

      if (filters?.statut) {
        q = query(loansRef, where('statut', '==', filters.statut), orderBy('date_pret', 'desc'));
      }

      const snapshot = await getDocs(q);
      let loans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Loan));

      // Filtres client-side
      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        loans = loans.filter(l =>
          l.notes?.toLowerCase().includes(searchLower)
        );
      }

      // Calculer les prêts en retard
      const now = Timestamp.now();
      loans = loans.map(loan => {
        if (loan.statut === 'actif' && loan.date_retour_prevue && loan.date_retour_prevue.toMillis() < now.toMillis()) {
          return { ...loan, statut: 'en_retard' as const };
        }
        return loan;
      });

      return loans;
    } catch (error) {
      console.error('Erreur chargement prêts:', error);
      throw error;
    }
  }

  /**
   * Récupérer un prêt par ID
   */
  static async getLoanById(clubId: string, loanId: string): Promise<Loan | null> {
    try {
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);
      const snapshot = await getDoc(loanRef);

      if (!snapshot.exists()) {
        return null;
      }

      const loan = {
        id: snapshot.id,
        ...snapshot.data()
      } as Loan;

      // Calculer si en retard
      const now = Timestamp.now();
      if (loan.statut === 'actif' && loan.date_retour_prevue && loan.date_retour_prevue.toMillis() < now.toMillis()) {
        loan.statut = 'en_retard';
      }

      return loan;
    } catch (error) {
      console.error('Erreur chargement prêt:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau prêt
   *
   * Workflow:
   * 1. Créer le prêt dans Firestore
   * 2. Snapshot des checklists associées
   * 3. Calculer le montant de caution
   * 4. Changer le statut du matériel en "prete"
   */
  static async createLoan(
    clubId: string,
    data: Omit<Loan, 'id' | 'createdAt' | 'updatedAt' | 'checklist_snapshot'>
  ): Promise<string> {
    try {
      const loansRef = collection(db, 'clubs', clubId, 'inventory_loans');
      const newLoanRef = doc(loansRef);

      // Récupérer les checklists à snapshot
      const checklistSnapshots: Loan['checklist_snapshot'] = [];

      for (const itemId of data.itemIds) {
        const item = await InventoryItemService.getItemById(clubId, itemId);
        if (!item) continue;

        const itemType = await InventoryConfigService.getItemTypeById(clubId, item.typeId);
        if (!itemType || !itemType.checklistIds || itemType.checklistIds.length === 0) continue;

        // Récupérer toutes les checklists associées
        for (const checklistId of itemType.checklistIds) {
          const checklist = await InventoryConfigService.getChecklistById(clubId, checklistId);
          if (!checklist) continue;

          checklistSnapshots.push({
            itemId: item.id,
            checklistId: checklist.id,
            checklistNom: checklist.nom,
            items: checklist.items.map(item => ({
              id: item.id,
              texte: item.texte,
              checked_depart: false, // À remplir lors du départ
              checked_retour: false  // À remplir lors du retour
            }))
          });
        }
      }

      const newLoan: Loan = {
        ...data,
        id: newLoanRef.id,
        checklist_snapshot: checklistSnapshots,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newLoanRef, newLoan);

      // Changer le statut du matériel en "prete"
      await this.updateItemsStatus(clubId, data.itemIds, 'prete');

      console.log(`Prêt créé: ${newLoan.id} (${data.itemIds.length} matériels)`);
      return newLoanRef.id;
    } catch (error) {
      console.error('Erreur création prêt:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un prêt existant
   */
  static async updateLoan(
    clubId: string,
    loanId: string,
    data: Partial<Omit<Loan, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);

      await updateDoc(loanRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Prêt mis à jour: ${loanId}`);
    } catch (error) {
      console.error('Erreur mise à jour prêt:', error);
      throw error;
    }
  }

  /**
   * Enregistrer le retour d'un prêt
   *
   * Workflow:
   * 1. Mettre à jour le prêt (date_retour_reel, checklist_retour, caution_retournee, notes_retour)
   * 2. Changer le statut du matériel en "disponible"
   * 3. Si caution non retournée, enregistrer caution non rendue
   */
  static async returnLoan(
    clubId: string,
    loanId: string,
    returnData: {
      date_retour_reel: Timestamp;
      caution_retournee: number;
      notes_retour?: string;
      checklist_snapshot: Loan['checklist_snapshot'];
    }
  ): Promise<void> {
    try {
      const loan = await this.getLoanById(clubId, loanId);
      if (!loan) {
        throw new Error('Prêt introuvable');
      }

      // Calculer caution non rendue
      const caution_non_rendue = loan.montant_caution - returnData.caution_retournee;

      // Mettre à jour le prêt
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);
      await updateDoc(loanRef, {
        statut: 'rendu',
        date_retour_reel: returnData.date_retour_reel,
        caution_retournee: returnData.caution_retournee,
        caution_non_rendue: caution_non_rendue,
        notes_retour: returnData.notes_retour,
        checklist_snapshot: returnData.checklist_snapshot,
        updatedAt: serverTimestamp()
      });

      // Changer le statut du matériel en "disponible"
      await this.updateItemsStatus(clubId, loan.itemIds, 'disponible');

      console.log(`Prêt retourné: ${loanId}, caution retournée: ${returnData.caution_retournee} €`);
    } catch (error) {
      console.error('Erreur retour prêt:', error);
      throw error;
    }
  }

  /**
   * Annuler un prêt (soft delete)
   */
  static async cancelLoan(clubId: string, loanId: string, reason: string): Promise<void> {
    try {
      const loan = await this.getLoanById(clubId, loanId);
      if (!loan) {
        throw new Error('Prêt introuvable');
      }

      // Mettre à jour le prêt
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);
      await updateDoc(loanRef, {
        statut: 'rendu', // Considéré comme rendu
        notes_retour: `ANNULÉ: ${reason}`,
        date_retour_reel: Timestamp.now(),
        caution_retournee: loan.montant_caution, // Caution entièrement retournée
        updatedAt: serverTimestamp()
      });

      // Changer le statut du matériel en "disponible"
      await this.updateItemsStatus(clubId, loan.itemIds, 'disponible');

      console.log(`Prêt annulé: ${loanId}`);
    } catch (error) {
      console.error('Erreur annulation prêt:', error);
      throw error;
    }
  }

  // ========================================
  // SIGNATURES
  // ========================================

  /**
   * Upload une signature pour un prêt
   *
   * @param type 'pret' (signature au départ) ou 'retour' (signature au retour)
   * @param signatureDataUrl Data URL de la signature (canvas.toDataURL())
   * @returns URL de la signature uploadée
   */
  static async uploadSignature(
    clubId: string,
    loanId: string,
    type: 'pret' | 'retour',
    signatureDataUrl: string
  ): Promise<string> {
    try {
      // Convertir Data URL en Blob
      const response = await fetch(signatureDataUrl);
      const blob = await response.blob();

      // Créer un nom de fichier
      const filename = `${loanId}_${type}.png`;

      // Upload vers Firebase Storage
      const storageRef = ref(storage, `clubs/${clubId}/loan_signatures/${filename}`);
      await uploadBytes(storageRef, blob);

      // Récupérer URL de téléchargement
      const downloadURL = await getDownloadURL(storageRef);

      // Mettre à jour le prêt avec l'URL de signature
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);
      await updateDoc(loanRef, {
        [type === 'pret' ? 'signature_emprunteur' : 'signature_retour']: downloadURL,
        updatedAt: serverTimestamp()
      });

      console.log(`Signature ${type} uploadée pour prêt ${loanId}`);
      return downloadURL;
    } catch (error) {
      console.error('Erreur upload signature:', error);
      throw error;
    }
  }

  /**
   * Supprimer une signature
   */
  static async deleteSignature(
    clubId: string,
    loanId: string,
    type: 'pret' | 'retour'
  ): Promise<void> {
    try {
      const loan = await this.getLoanById(clubId, loanId);
      if (!loan) {
        throw new Error('Prêt introuvable');
      }

      const signatureUrl = type === 'pret' ? loan.signature_emprunteur : loan.signature_retour;
      if (!signatureUrl) {
        return;
      }

      // Supprimer de Storage
      await this.deleteSignatureByUrl(signatureUrl);

      // Mettre à jour le prêt
      const loanRef = doc(db, 'clubs', clubId, 'inventory_loans', loanId);
      await updateDoc(loanRef, {
        [type === 'pret' ? 'signature_emprunteur' : 'signature_retour']: null,
        updatedAt: serverTimestamp()
      });

      console.log(`Signature ${type} supprimée pour prêt ${loanId}`);
    } catch (error) {
      console.error('Erreur suppression signature:', error);
      throw error;
    }
  }

  /**
   * Supprimer une signature de Storage par son URL
   */
  private static async deleteSignatureByUrl(signatureUrl: string): Promise<void> {
    try {
      const urlParts = signatureUrl.split('/o/');
      if (urlParts.length < 2) {
        console.warn('URL invalide, impossible de supprimer:', signatureUrl);
        return;
      }

      const pathWithToken = urlParts[1];
      const path = decodeURIComponent(pathWithToken.split('?')[0]);

      const storageRef = ref(storage, path);
      await deleteObject(storageRef);

      console.log(`Signature supprimée de Storage: ${path}`);
    } catch (error: any) {
      if (error.code === 'storage/object-not-found') {
        console.warn('Signature déjà supprimée ou introuvable:', signatureUrl);
      } else {
        throw error;
      }
    }
  }

  // ========================================
  // CALCUL CAUTION
  // ========================================

  /**
   * Calculer le montant de caution pour un prêt
   *
   * Basé sur les règles de caution configurées et la valeur du matériel
   */
  static async calculateCautionAmount(
    clubId: string,
    itemIds: string[]
  ): Promise<number> {
    try {
      let totalCaution = 0;

      for (const itemId of itemIds) {
        const item = await InventoryItemService.getItemById(clubId, itemId);
        if (!item) continue;

        const itemType = await InventoryConfigService.getItemTypeById(clubId, item.typeId);
        if (!itemType || !itemType.cautionRuleId) continue;

        const cautionRule = await InventoryConfigService.getCautionRuleById(clubId, itemType.cautionRuleId);
        if (!cautionRule) continue;

        totalCaution += cautionRule.montant;
      }

      return totalCaution;
    } catch (error) {
      console.error('Erreur calcul caution:', error);
      throw error;
    }
  }

  /**
   * Calculer le montant de caution à retourner selon l'état
   *
   * @param cautionRule Règle de caution appliquée
   * @param etat État du matériel au retour (excellent, bon, correct, mauvais, perte)
   * @returns Montant à retourner
   */
  static calculateCautionRefund(
    cautionRule: CautionRule,
    etat: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'perte'
  ): number {
    const percentages = {
      excellent: cautionRule.remboursement_excellent,
      bon: cautionRule.remboursement_bon,
      correct: cautionRule.remboursement_correct,
      mauvais: cautionRule.remboursement_mauvais,
      perte: cautionRule.remboursement_perte
    };

    const percentage = percentages[etat];
    return Math.round((cautionRule.montant * percentage / 100) * 100) / 100;
  }

  // ========================================
  // STATISTIQUES & HISTORIQUE
  // ========================================

  /**
   * Récupérer les statistiques des prêts
   */
  static async getStats(clubId: string): Promise<{
    total: number;
    actifs: number;
    en_retard: number;
    rendus: number;
    caution_totale_en_cours: number;
    caution_non_rendue_totale: number;
  }> {
    try {
      const loans = await this.getLoans(clubId);

      const stats = {
        total: loans.length,
        actifs: loans.filter(l => l.statut === 'actif').length,
        en_retard: loans.filter(l => l.statut === 'en_retard').length,
        rendus: loans.filter(l => l.statut === 'rendu').length,
        caution_totale_en_cours: loans
          .filter(l => l.statut === 'actif' || l.statut === 'en_retard')
          .reduce((sum, l) => sum + l.montant_caution, 0),
        caution_non_rendue_totale: loans
          .filter(l => l.statut === 'rendu')
          .reduce((sum, l) => sum + (l.caution_non_rendue || 0), 0)
      };

      return stats;
    } catch (error) {
      console.error('Erreur chargement statistiques prêts:', error);
      throw error;
    }
  }

  /**
   * Récupérer les prêts en retard
   */
  static async getOverdueLoans(clubId: string): Promise<Loan[]> {
    try {
      const loans = await this.getLoans(clubId);
      return loans.filter(l => l.statut === 'en_retard');
    } catch (error) {
      console.error('Erreur chargement prêts en retard:', error);
      throw error;
    }
  }

  // ========================================
  // UTILITAIRES
  // ========================================

  /**
   * Changer le statut de plusieurs matériels à la fois
   */
  private static async updateItemsStatus(
    clubId: string,
    itemIds: string[],
    statut: 'disponible' | 'prete' | 'maintenance' | 'hors_service'
  ): Promise<void> {
    try {
      await InventoryItemService.batchUpdateStatus(clubId, itemIds, statut);
    } catch (error) {
      console.error('Erreur mise à jour statut matériel:', error);
      throw error;
    }
  }
}
