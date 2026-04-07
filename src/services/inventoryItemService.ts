import { db, storage } from '@/lib/firebase';
import { logger } from '@/utils/logger';
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
import { InventoryItem, MaintenanceRecord, ItemType } from '@/types/inventory';
import { AmortizationService } from './amortizationService';

/**
 * Service pour gérer le matériel unitaire dans Firebase
 *
 * Collection: /clubs/{clubId}/inventory_items/{itemId}
 * Photos: Firebase Storage /clubs/{clubId}/inventory_photos/{itemId}/{photoId}
 */
export class InventoryItemService {

  // ========================================
  // CRUD MATÉRIEL
  // ========================================

  /**
   * Récupérer tout le matériel avec filtres optionnels
   */
  static async getItems(
    clubId: string,
    filters?: {
      typeId?: string;
      statut?: 'disponible' | 'prete' | 'maintenance' | 'hors_service';
      etat?: string;
      search?: string;
    }
  ): Promise<InventoryItem[]> {
    try {
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_items');
      let q = query(itemsRef, orderBy('numero_serie', 'asc'));

      // Appliquer filtres Firestore
      if (filters?.typeId) {
        q = query(itemsRef, where('typeId', '==', filters.typeId), orderBy('numero_serie', 'asc'));
      }

      if (filters?.statut) {
        q = query(itemsRef, where('statut', '==', filters.statut), orderBy('numero_serie', 'asc'));
      }

      const snapshot = await getDocs(q);
      let items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as InventoryItem));

      // Filtres client-side
      if (filters?.etat) {
        items = items.filter(i => i.etat === filters.etat);
      }

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        items = items.filter(i =>
          (i.numero_serie?.toLowerCase().includes(searchLower)) ||
          (i.nom?.toLowerCase().includes(searchLower)) ||
          (i.code?.toLowerCase().includes(searchLower)) ||
          (i.fabricant?.toLowerCase().includes(searchLower)) ||
          (i.modele?.toLowerCase().includes(searchLower))
        );
      }

      return items;
    } catch (error) {
      logger.error('Erreur chargement matériel:', error);
      throw error;
    }
  }

  /**
   * Récupérer un matériel par ID
   */
  static async getItemById(clubId: string, itemId: string): Promise<InventoryItem | null> {
    try {
      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
      const snapshot = await getDoc(itemRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as InventoryItem;
    } catch (error) {
      logger.error('Erreur chargement matériel:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau matériel
   */
  static async createItem(
    clubId: string,
    data: Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      // Vérifier unicité du numéro de série
      const existingItem = await this.getItemBySerialNumber(clubId, data.numero_serie);
      if (existingItem) {
        throw new Error(`Le numéro de série "${data.numero_serie}" existe déjà`);
      }

      const itemsRef = collection(db, 'clubs', clubId, 'inventory_items');
      const newItemRef = doc(itemsRef);

      const newItem: InventoryItem = {
        ...data,
        id: newItemRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newItemRef, newItem);

      logger.debug(`Matériel créé: ${newItem.numero_serie} (${newItem.id})`);
      return newItemRef.id;
    } catch (error) {
      logger.error('Erreur création matériel:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un matériel existant
   */
  static async updateItem(
    clubId: string,
    itemId: string,
    data: Partial<Omit<InventoryItem, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);

      // Si changement de numéro de série, vérifier unicité
      if (data.numero_serie) {
        const existingItem = await this.getItemBySerialNumber(clubId, data.numero_serie);
        if (existingItem && existingItem.id !== itemId) {
          throw new Error(`Le numéro de série "${data.numero_serie}" existe déjà`);
        }
      }

      await updateDoc(itemRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      logger.debug(`Matériel mis à jour: ${itemId}`);
    } catch (error) {
      logger.error('Erreur mise à jour matériel:', error);
      throw error;
    }
  }

  /**
   * Supprimer un matériel (soft delete - passe en statut hors_service)
   */
  static async deleteItem(clubId: string, itemId: string): Promise<void> {
    try {
      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);

      await updateDoc(itemRef, {
        statut: 'hors_service',
        updatedAt: serverTimestamp()
      });

      logger.debug(`Matériel désactivé (soft delete): ${itemId}`);
    } catch (error) {
      logger.error('Erreur suppression matériel:', error);
      throw error;
    }
  }

  /**
   * Hard delete (utilisé uniquement pour nettoyage admin)
   */
  static async hardDeleteItem(clubId: string, itemId: string): Promise<void> {
    try {
      // Supprimer toutes les photos/documents
      const item = await this.getItemById(clubId, itemId);
      if (item && item.documents_urls && item.documents_urls.length > 0) {
        for (const photoUrl of item.documents_urls) {
          await this.deletePhotoByUrl(photoUrl);
        }
      }

      // Supprimer le document Firestore
      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
      await deleteDoc(itemRef);

      logger.debug(`Matériel supprimé définitivement: ${itemId}`);
    } catch (error) {
      logger.error('Erreur suppression définitive matériel:', error);
      throw error;
    }
  }

  // ========================================
  // PHOTOS
  // ========================================

  /**
   * Upload une photo pour un matériel
   *
   * @param file Fichier image (from camera or file input)
   * @returns URL de la photo uploadée
   */
  static async uploadPhoto(
    clubId: string,
    itemId: string,
    file: File
  ): Promise<string> {
    try {
      // Vérifier type de fichier
      if (!file.type.startsWith('image/')) {
        throw new Error('Le fichier doit être une image');
      }

      // Vérifier taille (max 10 MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('La photo ne doit pas dépasser 10 Mo');
      }

      // Créer un nom de fichier unique
      const timestamp = Date.now();
      const extension = file.name.split('.').pop() || 'jpg';
      const filename = `${timestamp}_${Math.random().toString(36).substring(7)}.${extension}`;

      // Upload vers Firebase Storage
      const storageRef = ref(storage, `clubs/${clubId}/inventory_photos/${itemId}/${filename}`);
      await uploadBytes(storageRef, file);

      // Récupérer URL de téléchargement
      const downloadURL = await getDownloadURL(storageRef);

      // Mettre à jour le matériel avec la nouvelle photo
      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
      const item = await this.getItemById(clubId, itemId);

      if (!item) {
        throw new Error('Matériel introuvable');
      }

      const updatedPhotos = [...(item.documents_urls || []), downloadURL];

      await updateDoc(itemRef, {
        documents_urls: updatedPhotos,
        updatedAt: serverTimestamp()
      });

      logger.debug(`Photo uploadée pour matériel ${itemId}: ${downloadURL}`);
      return downloadURL;
    } catch (error) {
      logger.error('Erreur upload photo:', error);
      throw error;
    }
  }

  /**
   * Supprimer une photo d'un matériel
   */
  static async deletePhoto(
    clubId: string,
    itemId: string,
    photoUrl: string
  ): Promise<void> {
    try {
      // Supprimer de Storage
      await this.deletePhotoByUrl(photoUrl);

      // Mettre à jour le matériel
      const item = await this.getItemById(clubId, itemId);
      if (!item) {
        throw new Error('Matériel introuvable');
      }

      const updatedPhotos = (item.documents_urls || []).filter(url => url !== photoUrl);

      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
      await updateDoc(itemRef, {
        documents_urls: updatedPhotos,
        updatedAt: serverTimestamp()
      });

      logger.debug(`Photo supprimée pour matériel ${itemId}`);
    } catch (error) {
      logger.error('Erreur suppression photo:', error);
      throw error;
    }
  }

  /**
   * Supprimer une photo de Storage par son URL
   */
  private static async deletePhotoByUrl(photoUrl: string): Promise<void> {
    try {
      // Extraire le path depuis l'URL Firebase Storage
      // Format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
      const urlParts = photoUrl.split('/o/');
      if (urlParts.length < 2) {
        logger.warn('URL invalide, impossible de supprimer:', photoUrl);
        return;
      }

      const pathWithToken = urlParts[1];
      const path = decodeURIComponent(pathWithToken.split('?')[0]);

      const storageRef = ref(storage, path);
      await deleteObject(storageRef);

      logger.debug(`Photo supprimée de Storage: ${path}`);
    } catch (error: any) {
      // Ignorer l'erreur si le fichier n'existe pas
      if (error.code === 'storage/object-not-found') {
        logger.warn('Photo déjà supprimée ou introuvable:', photoUrl);
      } else {
        throw error;
      }
    }
  }

  // ========================================
  // MAINTENANCE
  // ========================================

  /**
   * Ajouter un enregistrement de maintenance
   */
  static async addMaintenanceRecord(
    clubId: string,
    itemId: string,
    record: Omit<MaintenanceRecord, 'id' | 'date'>
  ): Promise<void> {
    try {
      const item = await this.getItemById(clubId, itemId);
      if (!item) {
        throw new Error('Matériel introuvable');
      }

      const newRecord: MaintenanceRecord = {
        ...record,
        id: `maint_${Date.now()}`,
        date: Timestamp.now()
      };

      const updatedRecords = [...(item.historique_maintenance || []), newRecord];

      // Mettre à jour les dates de maintenance
      let updateData: any = {
        historique_maintenance: updatedRecords,
        updatedAt: serverTimestamp()
      };

      if (record.type === 'entretien') {
        updateData.date_derniere_maintenance = newRecord.date;
      } else if (record.type === 'revision') {
        updateData.date_derniere_revision = newRecord.date;
      }

      const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
      await updateDoc(itemRef, updateData);

      logger.debug(`Maintenance ajoutée pour matériel ${itemId}: ${record.type}`);
    } catch (error) {
      logger.error('Erreur ajout maintenance:', error);
      throw error;
    }
  }

  /**
   * Récupérer l'historique de maintenance d'un matériel
   */
  static async getMaintenanceHistory(
    clubId: string,
    itemId: string
  ): Promise<MaintenanceRecord[]> {
    try {
      const item = await this.getItemById(clubId, itemId);
      if (!item) {
        return [];
      }

      return item.historique_maintenance || [];
    } catch (error) {
      logger.error('Erreur chargement historique maintenance:', error);
      throw error;
    }
  }

  // ========================================
  // RECHERCHE & STATISTIQUES
  // ========================================

  /**
   * Rechercher un matériel par numéro de série
   */
  static async getItemBySerialNumber(
    clubId: string,
    numeroSerie: string
  ): Promise<InventoryItem | null> {
    try {
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_items');
      const q = query(itemsRef, where('numero_serie', '==', numeroSerie));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      } as InventoryItem;
    } catch (error) {
      logger.error('Erreur recherche par numéro de série:', error);
      throw error;
    }
  }

  /**
   * Récupérer les statistiques du matériel
   */
  static async getStats(clubId: string): Promise<{
    total: number;
    disponible: number;
    prete: number;
    maintenance: number;
    hors_service: number;
    byType: Record<string, number>;
  }> {
    try {
      const items = await this.getItems(clubId);

      const stats = {
        total: items.length,
        disponible: items.filter(i => i.statut === 'disponible').length,
        prete: items.filter(i => i.statut === 'prete').length,
        maintenance: items.filter(i => i.statut === 'maintenance').length,
        hors_service: items.filter(i => i.statut === 'hors_service').length,
        byType: {} as Record<string, number>
      };

      // Compter par type
      items.forEach(item => {
        if (!stats.byType[item.typeId]) {
          stats.byType[item.typeId] = 0;
        }
        stats.byType[item.typeId]++;
      });

      return stats;
    } catch (error) {
      logger.error('Erreur chargement statistiques:', error);
      throw error;
    }
  }

  /**
   * Récupérer le matériel nécessitant maintenance
   * (basé sur date_prochaine_maintenance)
   */
  static async getItemsNeedingMaintenance(clubId: string): Promise<InventoryItem[]> {
    try {
      const items = await this.getItems(clubId);
      const now = Timestamp.now();

      return items.filter(item => {
        if (!item.date_prochaine_maintenance) return false;
        return item.date_prochaine_maintenance.toMillis() <= now.toMillis();
      });
    } catch (error) {
      logger.error('Erreur chargement matériel nécessitant maintenance:', error);
      throw error;
    }
  }

  // ========================================
  // TANK INSPECTION (Belgian Regulations)
  // ========================================

  /**
   * Calculer la prochaine date d'épreuve pour une bouteille
   * Réglementation belge: épreuve hydrostatique tous les 5 ans
   */
  static calculateNextTankInspection(lastInspectionDate: Date): Date {
    const next = new Date(lastInspectionDate);
    next.setFullYear(next.getFullYear() + 5);
    return next;
  }

  /**
   * Vérifier si une bouteille nécessite une épreuve bientôt
   * @param alertDaysBefore Nombre de jours avant l'échéance pour alerter (défaut: 180 jours = 6 mois)
   */
  static shouldAlertForTankInspection(
    nextInspectionDate: Date,
    alertDaysBefore: number = 180
  ): { needsAlert: boolean; isOverdue: boolean; daysUntil: number } {
    const now = new Date();
    const timeDiff = nextInspectionDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    return {
      needsAlert: daysUntil <= alertDaysBefore,
      isOverdue: daysUntil < 0,
      daysUntil
    };
  }

  /**
   * Récupérer les bouteilles avec alertes d'épreuve
   */
  static async getTanksWithInspectionAlerts(
    clubId: string,
    alertDaysBefore: number = 180
  ): Promise<{
    overdue: InventoryItem[];
    upcoming: InventoryItem[];
    ok: InventoryItem[];
  }> {
    try {
      const items = await this.getItems(clubId);

      // Filtrer uniquement les bouteilles
      const tanks = items.filter(item =>
        item.typeId === 'BOUTEILLE' || item.typeId?.toLowerCase().includes('bouteille')
      );

      const overdue: InventoryItem[] = [];
      const upcoming: InventoryItem[] = [];
      const ok: InventoryItem[] = [];

      tanks.forEach(tank => {
        // Chercher la date d'épreuve dans les customFieldsValues
        const lastEpreuve = tank.customFieldsValues?.date_derniere_epreuve;
        if (!lastEpreuve) {
          overdue.push(tank); // Pas de date = à vérifier
          return;
        }

        const lastDate = lastEpreuve instanceof Timestamp
          ? lastEpreuve.toDate()
          : new Date(lastEpreuve);

        const nextDate = this.calculateNextTankInspection(lastDate);
        const { needsAlert, isOverdue } = this.shouldAlertForTankInspection(nextDate, alertDaysBefore);

        if (isOverdue) {
          overdue.push(tank);
        } else if (needsAlert) {
          upcoming.push(tank);
        } else {
          ok.push(tank);
        }
      });

      return { overdue, upcoming, ok };
    } catch (error) {
      logger.error('Erreur chargement alertes bouteilles:', error);
      throw error;
    }
  }

  // ========================================
  // VALEUR & AMORTISSEMENT
  // ========================================

  /**
   * Récupérer les statistiques avec valeurs (incluant amortissement)
   */
  static async getStatsWithValues(
    clubId: string,
    itemTypes: Record<string, ItemType>
  ): Promise<{
    total: number;
    disponible: number;
    prete: number;
    maintenance: number;
    hors_service: number;
    byType: Record<string, number>;
    totalPurchaseValue: number;
    totalCurrentValue: number;
    totalDepreciation: number;
    percentDepreciated: number;
    fullyDepreciatedCount: number;
    tankAlerts: {
      overdue: number;
      upcoming: number;
    };
  }> {
    try {
      const items = await this.getItems(clubId);

      // Statistiques de base
      const stats = {
        total: items.length,
        disponible: items.filter(i => i.statut === 'disponible').length,
        prete: items.filter(i => i.statut === 'prete').length,
        maintenance: items.filter(i => i.statut === 'maintenance').length,
        hors_service: items.filter(i => i.statut === 'hors_service').length,
        byType: {} as Record<string, number>,
        totalPurchaseValue: 0,
        totalCurrentValue: 0,
        totalDepreciation: 0,
        percentDepreciated: 0,
        fullyDepreciatedCount: 0,
        tankAlerts: { overdue: 0, upcoming: 0 }
      };

      // Compter par type
      items.forEach(item => {
        if (!stats.byType[item.typeId]) {
          stats.byType[item.typeId] = 0;
        }
        stats.byType[item.typeId]++;
      });

      // Calcul des valeurs avec amortissement
      const summary = AmortizationService.calculateDepreciationSummary(items, itemTypes);
      stats.totalPurchaseValue = summary.totalPurchaseValue;
      stats.totalCurrentValue = summary.totalCurrentValue;
      stats.totalDepreciation = summary.totalAccumulatedDepreciation;
      stats.percentDepreciated = summary.percentDepreciated;
      stats.fullyDepreciatedCount = summary.fullyDepreciatedCount;

      // Alertes bouteilles
      const tankAlerts = await this.getTanksWithInspectionAlerts(clubId);
      stats.tankAlerts = {
        overdue: tankAlerts.overdue.length,
        upcoming: tankAlerts.upcoming.length
      };

      return stats;
    } catch (error) {
      logger.error('Erreur chargement statistiques avec valeurs:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour la valeur actuelle de tous les articles
   * (à appeler périodiquement ou à la clôture fiscale)
   */
  static async updateAllCurrentValues(
    clubId: string,
    itemTypes: Record<string, ItemType>
  ): Promise<number> {
    try {
      const items = await this.getItems(clubId);
      const batch = writeBatch(db);
      let updatedCount = 0;

      for (const item of items) {
        const itemType = itemTypes[item.typeId];
        if (!itemType) continue;

        const currentValue = AmortizationService.getItemCurrentValue(item, itemType);

        // Mettre à jour seulement si la valeur a changé
        if (item.valeur_actuelle !== currentValue) {
          const itemRef = doc(db, 'clubs', clubId, 'inventory_items', item.id);
          batch.update(itemRef, {
            valeur_actuelle: currentValue,
            updatedAt: serverTimestamp()
          });
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await batch.commit();
        logger.debug(`Valeurs mises à jour pour ${updatedCount} articles`);
      }

      return updatedCount;
    } catch (error) {
      logger.error('Erreur mise à jour valeurs actuelles:', error);
      throw error;
    }
  }

  // ========================================
  // BATCH OPERATIONS
  // ========================================

  /**
   * Changer le statut de plusieurs matériels à la fois
   */
  static async batchUpdateStatus(
    clubId: string,
    itemIds: string[],
    statut: 'disponible' | 'prete' | 'maintenance' | 'hors_service'
  ): Promise<void> {
    try {
      const batch = writeBatch(db);

      itemIds.forEach(itemId => {
        const itemRef = doc(db, 'clubs', clubId, 'inventory_items', itemId);
        batch.update(itemRef, {
          statut,
          updatedAt: serverTimestamp()
        });
      });

      await batch.commit();

      logger.debug(`${itemIds.length} matériels mis à jour avec statut: ${statut}`);
    } catch (error) {
      logger.error('Erreur batch update statut:', error);
      throw error;
    }
  }
}
