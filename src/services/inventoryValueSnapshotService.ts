import { logger } from '@/utils/logger';
/**
 * Service voor Inventory Value Snapshots (Year-end equipment valuation)
 *
 * Beheert snapshots van equipment waarden voor Bilan afsluiting.
 * Analoog aan BoutiqueStockService voor shop inventory.
 *
 * Bilan code: 01.01 "Stock matériel (pour mémoire)"
 *
 * Collection: clubs/{clubId}/inventory_value_snapshots/{snapshotId}
 * Sub-collection: clubs/{clubId}/inventory_value_snapshots/{snapshotId}/items/{itemId}
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { InventoryValueSnapshot, InventoryValueSnapshotItem, ItemType } from '@/types/inventory';
import { InventoryItemService } from './inventoryItemService';
import { InventoryConfigService } from './inventoryConfigService';
import { AmortizationService } from './amortizationService';

const COLLECTION_NAME = 'inventory_value_snapshots';

export const InventoryValueSnapshotService = {

  // ========================================
  // SNAPSHOT CRUD
  // ========================================

  /**
   * Alle snapshots ophalen voor een club
   */
  async getSnapshots(clubId: string): Promise<InventoryValueSnapshot[]> {
    const collRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
    const snapshot = await getDocs(collRef);

    const snapshots = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        year: data.year as number,
        nom: data.nom as string,
        snapshot_date: data.snapshot_date as Timestamp,
        total_items: data.total_items as number,
        total_purchase_value: data.total_purchase_value as number,
        total_current_value: data.total_current_value as number,
        total_accumulated_depreciation: data.total_accumulated_depreciation as number,
        statut: data.statut as 'en_cours' | 'verrouille',
        date_verrouillage: data.date_verrouillage as Timestamp | undefined,
        createdAt: data.createdAt as Timestamp,
        updatedAt: data.updatedAt as Timestamp,
        createdBy: data.createdBy as string
      } as InventoryValueSnapshot;
    });

    // Sort by year descending
    snapshots.sort((a, b) => b.year - a.year);

    return snapshots;
  },

  /**
   * Snapshot ophalen voor specifiek jaar
   */
  async getSnapshotByYear(clubId: string, year: number): Promise<InventoryValueSnapshot | null> {
    const collRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
    const q = query(collRef, where('year', '==', year));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      year: data.year as number,
      nom: data.nom as string,
      snapshot_date: data.snapshot_date as Timestamp,
      total_items: data.total_items as number,
      total_purchase_value: data.total_purchase_value as number,
      total_current_value: data.total_current_value as number,
      total_accumulated_depreciation: data.total_accumulated_depreciation as number,
      statut: data.statut as 'en_cours' | 'verrouille',
      date_verrouillage: data.date_verrouillage as Timestamp | undefined,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
      createdBy: data.createdBy as string
    } as InventoryValueSnapshot;
  },

  /**
   * Snapshot ophalen per ID
   */
  async getSnapshotById(clubId: string, snapshotId: string): Promise<InventoryValueSnapshot | null> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, snapshotId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      year: data.year as number,
      nom: data.nom as string,
      snapshot_date: data.snapshot_date as Timestamp,
      total_items: data.total_items as number,
      total_purchase_value: data.total_purchase_value as number,
      total_current_value: data.total_current_value as number,
      total_accumulated_depreciation: data.total_accumulated_depreciation as number,
      statut: data.statut as 'en_cours' | 'verrouille',
      date_verrouillage: data.date_verrouillage as Timestamp | undefined,
      createdAt: data.createdAt as Timestamp,
      updatedAt: data.updatedAt as Timestamp,
      createdBy: data.createdBy as string
    } as InventoryValueSnapshot;
  },

  /**
   * Nieuwe snapshot maken voor een boekjaar
   * Kopieert alle huidige equipment items met hun berekende waarden
   */
  async createSnapshot(clubId: string, year: number, userId: string): Promise<string> {
    // Check of er al een snapshot bestaat voor dit jaar
    const existing = await this.getSnapshotByYear(clubId, year);
    if (existing) {
      throw new Error(`Une clôture matériel pour ${year} existe déjà`);
    }

    // Haal alle equipment items op
    const items = await InventoryItemService.getItems(clubId);
    if (items.length === 0) {
      throw new Error('Aucun matériel à clôturer');
    }

    // Haal item types op voor namen en depreciation settings
    const types = await InventoryConfigService.getItemTypes(clubId);
    const typesMap: Record<string, ItemType> = {};
    types.forEach(t => { typesMap[t.id] = t; });

    // Bereken depreciation summary voor alle items
    const summary = AmortizationService.calculateDepreciationSummary(items, typesMap);

    // Maak snapshot document
    const snapshotsRef = collection(db, 'clubs', clubId, COLLECTION_NAME);
    const newSnapshotRef = doc(snapshotsRef);

    const snapshotData: Omit<InventoryValueSnapshot, 'id'> & { id: string } = {
      id: newSnapshotRef.id,
      year,
      nom: `Clôture matériel ${year}`,
      snapshot_date: Timestamp.now(),
      total_items: summary.itemCount,
      total_purchase_value: summary.totalPurchaseValue,
      total_current_value: summary.totalCurrentValue,
      total_accumulated_depreciation: summary.totalAccumulatedDepreciation,
      statut: 'en_cours',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    await setDoc(newSnapshotRef, snapshotData);

    // Maak snapshot items in batches (max 500 per batch)
    const itemsRef = collection(db, 'clubs', clubId, COLLECTION_NAME, newSnapshotRef.id, 'items');
    const batchSize = 500;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchItems = items.slice(i, i + batchSize);

      for (const item of batchItems) {
        const itemType = typesMap[item.typeId];

        // Bereken huidige waarde voor dit specifieke item
        const currentValue = itemType
          ? AmortizationService.getItemCurrentValue(item, itemType)
          : 0;

        const purchaseValue = item.valeur_achat || 0;
        const accumulatedDepreciation = purchaseValue - currentValue;

        const snapshotItemRef = doc(itemsRef, item.id);
        const snapshotItem: InventoryValueSnapshotItem = {
          id: item.id,
          snapshotId: newSnapshotRef.id,
          itemId: item.id,
          code: item.code || item.numero_serie || item.id,
          nom: item.nom || `${itemType?.nom || 'Item'} ${item.numero_serie || ''}`,
          typeId: item.typeId,
          typeName: itemType?.nom || 'Type inconnu',
          valeur_achat: purchaseValue,
          accumulated_depreciation: Math.round(accumulatedDepreciation * 100) / 100,
          current_value: Math.round(currentValue * 100) / 100,
          etat: item.etat,
          statut: item.statut,
          createdAt: Timestamp.now()
        };
        batch.set(snapshotItemRef, snapshotItem);
      }

      await batch.commit();
    }

    logger.debug(`Inventory value snapshot créé: ${snapshotData.nom} avec ${items.length} items, valeur: €${summary.totalCurrentValue.toFixed(2)}`);
    return newSnapshotRef.id;
  },

  /**
   * Snapshot items ophalen
   */
  async getSnapshotItems(clubId: string, snapshotId: string): Promise<InventoryValueSnapshotItem[]> {
    const itemsRef = collection(db, 'clubs', clubId, COLLECTION_NAME, snapshotId, 'items');
    const snapshot = await getDocs(itemsRef);

    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        snapshotId: data.snapshotId as string,
        itemId: data.itemId as string,
        code: data.code as string,
        nom: data.nom as string,
        typeId: data.typeId as string,
        typeName: data.typeName as string,
        valeur_achat: data.valeur_achat as number,
        accumulated_depreciation: data.accumulated_depreciation as number,
        current_value: data.current_value as number,
        etat: data.etat,
        statut: data.statut,
        createdAt: data.createdAt as Timestamp
      } as InventoryValueSnapshotItem;
    });

    // Sort by code
    items.sort((a, b) => (a.code || '').localeCompare(b.code || ''));

    return items;
  },

  /**
   * Snapshot verrouilen (voor Bilan)
   */
  async lockSnapshot(clubId: string, snapshotId: string): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, snapshotId);
    await updateDoc(docRef, {
      statut: 'verrouille',
      date_verrouillage: Timestamp.now(),
      updatedAt: serverTimestamp()
    });
    logger.debug(`Inventory value snapshot verrouillé: ${snapshotId}`);
  },

  /**
   * Snapshot heropenen (met waarschuwing in UI)
   */
  async unlockSnapshot(clubId: string, snapshotId: string): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, snapshotId);
    await updateDoc(docRef, {
      statut: 'en_cours',
      date_verrouillage: null,
      updatedAt: serverTimestamp()
    });
    logger.debug(`Inventory value snapshot ontgrendeld: ${snapshotId}`);
  },

  /**
   * Snapshot verwijderen (alleen als niet verrouillé)
   */
  async deleteSnapshot(clubId: string, snapshotId: string): Promise<void> {
    const snapshot = await this.getSnapshotById(clubId, snapshotId);
    if (!snapshot) {
      throw new Error('Snapshot introuvable');
    }
    if (snapshot.statut === 'verrouille') {
      throw new Error('Impossible de supprimer une clôture verrouillée');
    }

    // Delete all items first
    const itemsRef = collection(db, 'clubs', clubId, COLLECTION_NAME, snapshotId, 'items');
    const itemsSnapshot = await getDocs(itemsRef);

    const batchSize = 500;
    const itemDocs = itemsSnapshot.docs;

    for (let i = 0; i < itemDocs.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchDocs = itemDocs.slice(i, i + batchSize);
      batchDocs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    // Delete the snapshot document
    const { deleteDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, snapshotId);
    await deleteDoc(docRef);

    logger.debug(`Inventory value snapshot supprimé: ${snapshotId}`);
  },

  // ========================================
  // BILAN INTEGRATION
  // ========================================

  /**
   * Waarde ophalen voor Bilan
   * BELANGRIJK: Gebruikt locked snapshot indien beschikbaar, anders fallback naar live waarde
   *
   * Retourneert:
   * - value: De waarde voor de Bilan (frozen of live)
   * - isLocked: True als de waarde uit een verrouillde snapshot komt
   * - hasSnapshot: True als er een snapshot bestaat (locked of niet)
   */
  async getValueForBilan(clubId: string, year: number): Promise<{
    value: number;
    isLocked: boolean;
    hasSnapshot: boolean;
  }> {
    const snapshot = await this.getSnapshotByYear(clubId, year);

    if (!snapshot) {
      // Geen snapshot - bereken live waarde met warning
      const liveValue = await this.calculateLiveValue(clubId);
      return { value: liveValue, isLocked: false, hasSnapshot: false };
    }

    if (snapshot.statut === 'verrouille') {
      // Verrouillde snapshot - definitieve waarde
      return { value: snapshot.total_current_value, isLocked: true, hasSnapshot: true };
    }

    // Snapshot bestaat maar is niet verrouillé - gebruik snapshot waarde maar niet definitief
    return { value: snapshot.total_current_value, isLocked: false, hasSnapshot: true };
  },

  /**
   * Bereken live waarde van alle equipment (zonder snapshot)
   * Gebruikt voor fallback en voor vergelijking met snapshot
   */
  async calculateLiveValue(clubId: string): Promise<number> {
    const items = await InventoryItemService.getItems(clubId);
    const types = await InventoryConfigService.getItemTypes(clubId);
    const typesMap: Record<string, ItemType> = {};
    types.forEach(t => { typesMap[t.id] = t; });

    const summary = AmortizationService.calculateDepreciationSummary(items, typesMap);
    return summary.totalCurrentValue;
  },

  /**
   * Vergelijk live waarde met snapshot waarde
   * Nuttig voor audit/controle
   */
  async compareWithLive(clubId: string, snapshotId: string): Promise<{
    snapshotValue: number;
    liveValue: number;
    difference: number;
    percentChange: number;
  }> {
    const snapshot = await this.getSnapshotById(clubId, snapshotId);
    if (!snapshot) {
      throw new Error('Snapshot introuvable');
    }

    const liveValue = await this.calculateLiveValue(clubId);
    const difference = liveValue - snapshot.total_current_value;
    const percentChange = snapshot.total_current_value !== 0
      ? (difference / snapshot.total_current_value) * 100
      : 0;

    return {
      snapshotValue: snapshot.total_current_value,
      liveValue,
      difference: Math.round(difference * 100) / 100,
      percentChange: Math.round(percentChange * 10) / 10
    };
  },

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Bereken progress (altijd 100% want snapshot is compleet)
   */
  calculateProgress(_snapshot: InventoryValueSnapshot): number {
    return 100; // Snapshots zijn altijd compleet
  }
};
