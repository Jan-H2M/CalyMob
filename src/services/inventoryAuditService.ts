import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { InventoryAudit, InventoryAuditItem, ItemType } from '@/types/inventory';
import { InventoryItemService } from './inventoryItemService';
import { InventoryConfigService } from './inventoryConfigService';

/**
 * Service pour gérer les audits d'inventaire annuels
 *
 * Collection: /clubs/{clubId}/inventory_audits/{auditId}
 * Sous-collection: /clubs/{clubId}/inventory_audits/{auditId}/items/{itemId}
 */
export class InventoryAuditService {

  // ========================================
  // CRUD AUDITS
  // ========================================

  /**
   * Démarrer un nouvel audit d'inventaire
   * Crée un InventoryAuditItem pour chaque InventoryItem existant
   */
  static async startAudit(clubId: string, year: number, userId: string): Promise<string> {
    try {
      // Vérifier qu'il n'y a pas déjà un audit en cours pour cette année
      const existingAudit = await this.getAuditByYear(clubId, year);
      if (existingAudit && existingAudit.statut === 'en_cours') {
        throw new Error(`Un audit est déjà en cours pour l'année ${year}`);
      }

      // Récupérer tous les items de l'inventaire
      const items = await InventoryItemService.getItems(clubId);
      if (items.length === 0) {
        throw new Error('Aucun matériel à auditer');
      }

      // Récupérer les types pour les noms
      const types = await InventoryConfigService.getItemTypes(clubId);
      const typesMap: Record<string, ItemType> = {};
      types.forEach(t => { typesMap[t.id] = t; });

      // Créer l'audit
      const auditsRef = collection(db, 'clubs', clubId, 'inventory_audits');
      const newAuditRef = doc(auditsRef);

      const audit: InventoryAudit = {
        id: newAuditRef.id,
        year,
        nom: `Inventaire ${year}`,
        statut: 'en_cours',
        date_debut: Timestamp.now(),
        total_items: items.length,
        items_controles: 0,
        items_manquants: 0,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: userId
      };

      await setDoc(newAuditRef, audit);

      // Créer les audit items en batch (max 500 par batch)
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_audits', newAuditRef.id, 'items');
      const batchSize = 500;

      for (let i = 0; i < items.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchItems = items.slice(i, i + batchSize);

        for (const item of batchItems) {
          const auditItemRef = doc(itemsRef, item.id);
          const auditItem: InventoryAuditItem = {
            id: item.id,
            auditId: newAuditRef.id,
            itemId: item.id,
            code: item.code || item.numero_serie || item.id,
            typeId: item.typeId,
            typeName: typesMap[item.typeId]?.nom || 'Type inconnu',
            etat_initial: item.etat || 'bon',
            retrouve: false,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          };
          batch.set(auditItemRef, auditItem);
        }

        await batch.commit();
      }

      logger.debug(`Audit démarré: ${audit.nom} avec ${items.length} items`);
      return newAuditRef.id;
    } catch (error) {
      logger.error('Erreur démarrage audit:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'audit en cours (le plus récent non terminé)
   */
  static async getCurrentAudit(clubId: string): Promise<InventoryAudit | null> {
    try {
      const auditsRef = collection(db, 'clubs', clubId, 'inventory_audits');
      // Simple query without orderBy to avoid composite index requirement
      const q = query(
        auditsRef,
        where('statut', '==', 'en_cours')
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      // If multiple audits en_cours (shouldn't happen), get the most recent
      const audits = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryAudit));

      // Sort client-side by date_debut descending
      audits.sort((a, b) => {
        const dateA = a.date_debut?.toMillis() || 0;
        const dateB = b.date_debut?.toMillis() || 0;
        return dateB - dateA;
      });

      return audits[0];
    } catch (error) {
      logger.error('Erreur récupération audit en cours:', error);
      throw error;
    }
  }

  /**
   * Récupérer un audit par année
   */
  static async getAuditByYear(clubId: string, year: number): Promise<InventoryAudit | null> {
    try {
      const auditsRef = collection(db, 'clubs', clubId, 'inventory_audits');
      const q = query(auditsRef, where('year', '==', year));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      return {
        id: snapshot.docs[0].id,
        ...snapshot.docs[0].data()
      } as InventoryAudit;
    } catch (error) {
      logger.error('Erreur récupération audit par année:', error);
      throw error;
    }
  }

  /**
   * Récupérer un audit par ID
   */
  static async getAuditById(clubId: string, auditId: string): Promise<InventoryAudit | null> {
    try {
      const auditRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId);
      const snapshot = await getDoc(auditRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as InventoryAudit;
    } catch (error) {
      logger.error('Erreur récupération audit:', error);
      throw error;
    }
  }

  /**
   * Récupérer tous les audits (historique)
   */
  static async getAudits(clubId: string): Promise<InventoryAudit[]> {
    try {
      const auditsRef = collection(db, 'clubs', clubId, 'inventory_audits');
      // No orderBy to avoid index requirement - sort client-side
      const snapshot = await getDocs(auditsRef);

      const audits = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryAudit));

      // Sort by year descending
      audits.sort((a, b) => (b.year || 0) - (a.year || 0));

      return audits;
    } catch (error) {
      logger.error('Erreur récupération audits:', error);
      throw error;
    }
  }

  // ========================================
  // AUDIT ITEMS
  // ========================================

  /**
   * Récupérer les items d'un audit avec filtre optionnel
   */
  static async getAuditItems(
    clubId: string,
    auditId: string,
    filter?: 'all' | 'todo' | 'done' | 'missing'
  ): Promise<InventoryAuditItem[]> {
    try {
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_audits', auditId, 'items');
      // Fetch all items without orderBy to avoid index requirement
      const snapshot = await getDocs(itemsRef);

      let items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryAuditItem));

      // Apply filters client-side
      if (filter === 'todo') {
        items = items.filter(item => !item.date_controle);
      } else if (filter === 'done') {
        items = items.filter(item => item.retrouve === true);
      } else if (filter === 'missing') {
        items = items.filter(item => item.date_controle && !item.retrouve);
      }

      // Sort by code
      items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

      return items;
    } catch (error) {
      logger.error('Erreur récupération items audit:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un item d'audit (marquer comme retrouvé/manquant + nouvelle condition)
   */
  static async updateAuditItem(
    clubId: string,
    auditId: string,
    itemId: string,
    data: {
      retrouve: boolean;
      etat_final?: 'excellent' | 'bon' | 'correct' | 'mauvais' | 'hors_service';
      notes?: string;
    },
    userId: string
  ): Promise<void> {
    try {
      const itemRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId, 'items', itemId);

      await updateDoc(itemRef, {
        retrouve: data.retrouve,
        etat_final: data.etat_final || null,
        notes: data.notes || null,
        date_controle: Timestamp.now(),
        controle_par: userId,
        updatedAt: serverTimestamp()
      });

      // Mettre à jour les stats de l'audit
      await this.updateAuditStats(clubId, auditId);

      logger.debug(`Item audit mis à jour: ${itemId} - retrouvé: ${data.retrouve}`);
    } catch (error) {
      logger.error('Erreur mise à jour item audit:', error);
      throw error;
    }
  }

  /**
   * Réinitialiser un item d'audit (annuler le contrôle)
   * Remet l'item à l'état "à vérifier"
   */
  static async resetAuditItem(
    clubId: string,
    auditId: string,
    itemId: string
  ): Promise<void> {
    try {
      const itemRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId, 'items', itemId);

      await updateDoc(itemRef, {
        retrouve: false,
        etat_final: null,
        notes: null,
        date_controle: null,
        controle_par: null,
        updatedAt: serverTimestamp()
      });

      // Mettre à jour les stats de l'audit
      await this.updateAuditStats(clubId, auditId);

      logger.debug(`Item audit réinitialisé: ${itemId}`);
    } catch (error) {
      logger.error('Erreur réinitialisation item audit:', error);
      throw error;
    }
  }

  /**
   * Recalculer les statistiques d'un audit
   */
  static async updateAuditStats(clubId: string, auditId: string): Promise<void> {
    try {
      const items = await this.getAuditItems(clubId, auditId, 'all');

      const stats = {
        total_items: items.length,
        items_controles: items.filter(i => i.date_controle).length,
        items_manquants: items.filter(i => i.date_controle && !i.retrouve).length,
        updatedAt: serverTimestamp()
      };

      const auditRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId);
      await updateDoc(auditRef, stats);
    } catch (error) {
      logger.error('Erreur mise à jour stats audit:', error);
      throw error;
    }
  }

  /**
   * Verrouiller un audit (définitif, pour la comptabilité)
   * Après verrouillage, l'audit ne peut plus être modifié
   */
  static async lockAudit(clubId: string, auditId: string): Promise<void> {
    try {
      // Mettre à jour les stats finales avant verrouillage
      await this.updateAuditStats(clubId, auditId);

      const auditRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId);
      await updateDoc(auditRef, {
        statut: 'verrouille',
        date_verrouillage: Timestamp.now(),
        updatedAt: serverTimestamp()
      });

      logger.debug(`Audit verrouillé: ${auditId}`);
    } catch (error) {
      logger.error('Erreur verrouillage audit:', error);
      throw error;
    }
  }

  /**
   * Réouvrir un audit verrouillé (pour modifications exceptionnelles)
   * Remet l'audit en statut "en_cours"
   */
  static async reopenAudit(clubId: string, auditId: string): Promise<void> {
    try {
      const auditRef = doc(db, 'clubs', clubId, 'inventory_audits', auditId);
      await updateDoc(auditRef, {
        statut: 'en_cours',
        date_verrouillage: null,
        updatedAt: serverTimestamp()
      });

      logger.debug(`Audit réouvert: ${auditId}`);
    } catch (error) {
      logger.error('Erreur réouverture audit:', error);
      throw error;
    }
  }

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Calculer le pourcentage de progression
   */
  static calculateProgress(audit: InventoryAudit): number {
    if (audit.total_items === 0) return 100;
    return Math.round((audit.items_controles / audit.total_items) * 100);
  }
}
