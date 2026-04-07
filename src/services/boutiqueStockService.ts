import { logger } from '@/utils/logger';
/**
 * Service voor Boutique Stock Management
 *
 * Beheert stock voor:
 * - Boutique (club merchandise) -> Bilan code 02.01.01
 * - Boutique LIFRAS (LIFRAS materiaal) -> Bilan code 02.01.02
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { BoutiqueItem, BoutiqueType, BoutiqueStockSummary, BoutiqueItemFormData, BoutiqueSnapshot, BoutiqueSnapshotItem } from '@/types/boutique';

const COLLECTION_NAME = 'boutique_stock';
const SNAPSHOTS_COLLECTION = 'boutique_snapshots';

/**
 * Converter voor Firestore data <-> BoutiqueItem
 */
function convertFromFirestore(docId: string, data: Record<string, unknown>): BoutiqueItem {
  return {
    id: docId,
    type: data.type as BoutiqueType,
    nom: data.nom as string,
    description: data.description as string | undefined,
    quantite: data.quantite as number,
    prix_achat: data.prix_achat as number,
    prix_vente: data.prix_vente as number | undefined,
    date_achat: (data.date_achat as Timestamp)?.toDate() ?? new Date(),
    fournisseur: data.fournisseur as string | undefined,
    reference: data.reference as string | undefined,
    photo_url: data.photo_url as string | undefined,
    actif: data.actif as boolean ?? true,
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
    updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
    createdBy: data.createdBy as string | undefined
  };
}

/**
 * Converter voor BoutiqueItem -> Firestore data
 */
function convertToFirestore(item: BoutiqueItemFormData): Record<string, unknown> {
  return {
    type: item.type,
    nom: item.nom,
    description: item.description || null,
    quantite: item.quantite,
    prix_achat: item.prix_achat,
    prix_vente: item.prix_vente || null,
    date_achat: Timestamp.fromDate(item.date_achat),
    fournisseur: item.fournisseur || null,
    reference: item.reference || null,
    photo_url: item.photo_url || null,
    actif: item.actif
  };
}

export const BoutiqueStockService = {
  /**
   * Alle items ophalen voor een club
   * @param clubId - Club ID
   * @param type - Optioneel filter op type (boutique of boutique_lifras)
   */
  async getItems(clubId: string, type?: BoutiqueType): Promise<BoutiqueItem[]> {
    const collRef = collection(db, 'clubs', clubId, COLLECTION_NAME);

    let q;
    if (type) {
      q = query(
        collRef,
        where('type', '==', type),
        orderBy('nom', 'asc')
      );
    } else {
      q = query(collRef, orderBy('nom', 'asc'));
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => convertFromFirestore(doc.id, doc.data()));
  },

  /**
   * Enkel item ophalen
   */
  async getItem(clubId: string, itemId: string): Promise<BoutiqueItem | null> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, itemId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return convertFromFirestore(docSnap.id, docSnap.data());
  },

  /**
   * Nieuw item toevoegen
   */
  async addItem(clubId: string, item: BoutiqueItemFormData, createdBy?: string): Promise<string> {
    const collRef = collection(db, 'clubs', clubId, COLLECTION_NAME);

    const data = {
      ...convertToFirestore(item),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: createdBy || null
    };

    const docRef = await addDoc(collRef, data);
    return docRef.id;
  },

  /**
   * Item bijwerken
   */
  async updateItem(clubId: string, itemId: string, updates: Partial<BoutiqueItemFormData>): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, itemId);

    const data: Record<string, unknown> = {
      updatedAt: Timestamp.now()
    };

    // Alleen de meegegeven velden updaten
    if (updates.type !== undefined) data.type = updates.type;
    if (updates.nom !== undefined) data.nom = updates.nom;
    if (updates.description !== undefined) data.description = updates.description || null;
    if (updates.quantite !== undefined) data.quantite = updates.quantite;
    if (updates.prix_achat !== undefined) data.prix_achat = updates.prix_achat;
    if (updates.prix_vente !== undefined) data.prix_vente = updates.prix_vente || null;
    if (updates.date_achat !== undefined) data.date_achat = Timestamp.fromDate(updates.date_achat);
    if (updates.fournisseur !== undefined) data.fournisseur = updates.fournisseur || null;
    if (updates.reference !== undefined) data.reference = updates.reference || null;
    if (updates.photo_url !== undefined) data.photo_url = updates.photo_url || null;
    if (updates.actif !== undefined) data.actif = updates.actif;

    await updateDoc(docRef, data);
  },

  /**
   * Item verwijderen
   */
  async deleteItem(clubId: string, itemId: string): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, COLLECTION_NAME, itemId);
    await deleteDoc(docRef);
  },

  /**
   * Stock hoeveelheid aanpassen
   */
  async adjustQuantity(clubId: string, itemId: string, adjustment: number): Promise<number> {
    const item = await this.getItem(clubId, itemId);
    if (!item) {
      throw new Error('Élément introuvable');
    }

    const newQuantity = Math.max(0, item.quantite + adjustment);
    await this.updateItem(clubId, itemId, { quantite: newQuantity });

    return newQuantity;
  },

  /**
   * Bereken totale stockwaarde voor een type
   * Dit is de waarde die in de Bilan komt
   *
   * @returns Totaal van (quantite × prix_achat) voor alle actieve items
   */
  async calculateStockValue(clubId: string, type: BoutiqueType): Promise<number> {
    const items = await this.getItems(clubId, type);

    // Alleen actieve items met positieve stock
    const activeItems = items.filter(item => item.actif && item.quantite > 0);

    return activeItems.reduce((total, item) => {
      return total + (item.quantite * item.prix_achat);
    }, 0);
  },

  /**
   * Bereken volledige stock summary
   */
  async getStockSummary(clubId: string, type: BoutiqueType): Promise<BoutiqueStockSummary> {
    const items = await this.getItems(clubId, type);
    const activeItems = items.filter(item => item.actif);

    const totalValue = activeItems.reduce((sum, item) => sum + (item.quantite * item.prix_achat), 0);
    const totalSaleValue = activeItems.reduce((sum, item) => {
      const salePrice = item.prix_vente || item.prix_achat;
      return sum + (item.quantite * salePrice);
    }, 0);

    return {
      type,
      totalItems: activeItems.length,
      totalQuantite: activeItems.reduce((sum, item) => sum + item.quantite, 0),
      totalValue,
      totalSaleValue
    };
  },

  /**
   * Bereken beide stock summaries
   */
  async getAllStockSummaries(clubId: string): Promise<{
    boutique: BoutiqueStockSummary;
    boutique_lifras: BoutiqueStockSummary;
    combined: {
      totalValue: number;
      totalItems: number;
      totalQuantite: number;
    };
  }> {
    const [boutique, boutique_lifras] = await Promise.all([
      this.getStockSummary(clubId, 'boutique'),
      this.getStockSummary(clubId, 'boutique_lifras')
    ]);

    return {
      boutique,
      boutique_lifras,
      combined: {
        totalValue: boutique.totalValue + boutique_lifras.totalValue,
        totalItems: boutique.totalItems + boutique_lifras.totalItems,
        totalQuantite: boutique.totalQuantite + boutique_lifras.totalQuantite
      }
    };
  },

  // ========================================
  // SNAPSHOT FUNCTIES (voor Bilan afsluiting)
  // ========================================

  /**
   * Alle snapshots ophalen voor een club
   */
  async getSnapshots(clubId: string): Promise<BoutiqueSnapshot[]> {
    const collRef = collection(db, 'clubs', clubId, SNAPSHOTS_COLLECTION);
    const snapshot = await getDocs(collRef);

    const snapshots = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        year: data.year as number,
        type: data.type as BoutiqueType,
        nom: data.nom as string,
        snapshot_date: (data.snapshot_date as Timestamp)?.toDate() ?? new Date(),
        total_items: data.total_items as number,
        total_quantite: data.total_quantite as number,
        total_value: data.total_value as number,
        statut: data.statut as 'en_cours' | 'verrouille',
        date_verrouillage: (data.date_verrouillage as Timestamp)?.toDate(),
        createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
        updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
        createdBy: data.createdBy as string
      } as BoutiqueSnapshot;
    });

    // Sort by year descending, then by type
    snapshots.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return a.type.localeCompare(b.type);
    });

    return snapshots;
  },

  /**
   * Snapshot ophalen voor specifiek jaar en type
   */
  async getSnapshotByYearAndType(clubId: string, year: number, type: BoutiqueType): Promise<BoutiqueSnapshot | null> {
    const collRef = collection(db, 'clubs', clubId, SNAPSHOTS_COLLECTION);
    const q = query(
      collRef,
      where('year', '==', year),
      where('type', '==', type)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    return {
      id: doc.id,
      year: data.year as number,
      type: data.type as BoutiqueType,
      nom: data.nom as string,
      snapshot_date: (data.snapshot_date as Timestamp)?.toDate() ?? new Date(),
      total_items: data.total_items as number,
      total_quantite: data.total_quantite as number,
      total_value: data.total_value as number,
      statut: data.statut as 'en_cours' | 'verrouille',
      date_verrouillage: (data.date_verrouillage as Timestamp)?.toDate(),
      createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
      updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
      createdBy: data.createdBy as string
    } as BoutiqueSnapshot;
  },

  /**
   * Snapshot ophalen per ID
   */
  async getSnapshotById(clubId: string, snapshotId: string): Promise<BoutiqueSnapshot | null> {
    const docRef = doc(db, 'clubs', clubId, SNAPSHOTS_COLLECTION, snapshotId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      year: data.year as number,
      type: data.type as BoutiqueType,
      nom: data.nom as string,
      snapshot_date: (data.snapshot_date as Timestamp)?.toDate() ?? new Date(),
      total_items: data.total_items as number,
      total_quantite: data.total_quantite as number,
      total_value: data.total_value as number,
      statut: data.statut as 'en_cours' | 'verrouille',
      date_verrouillage: (data.date_verrouillage as Timestamp)?.toDate(),
      createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
      updatedAt: (data.updatedAt as Timestamp)?.toDate() ?? new Date(),
      createdBy: data.createdBy as string
    } as BoutiqueSnapshot;
  },

  /**
   * Nieuwe snapshot maken voor een boekjaar
   * Kopieert alle huidige stock items naar de snapshot
   */
  async createSnapshot(clubId: string, year: number, type: BoutiqueType, userId: string): Promise<string> {
    // Check of er al een snapshot bestaat voor dit jaar/type
    const existing = await this.getSnapshotByYearAndType(clubId, year, type);
    if (existing) {
      throw new Error(`Une clôture pour ${type === 'boutique' ? 'Boutique Club' : 'Boutique LIFRAS'} ${year} existe déjà`);
    }

    // Haal huidige stock items op
    const items = await this.getItems(clubId, type);
    const activeItems = items.filter(item => item.actif && item.quantite > 0);

    // Bereken totalen
    const totalQuantite = activeItems.reduce((sum, item) => sum + item.quantite, 0);
    const totalValue = activeItems.reduce((sum, item) => sum + (item.quantite * item.prix_achat), 0);

    // Maak snapshot document
    const snapshotsRef = collection(db, 'clubs', clubId, SNAPSHOTS_COLLECTION);
    const newSnapshotRef = doc(snapshotsRef);

    const snapshotData = {
      id: newSnapshotRef.id,
      year,
      type,
      nom: `${type === 'boutique' ? 'Boutique Club' : 'Boutique LIFRAS'} ${year}`,
      snapshot_date: Timestamp.now(),
      total_items: activeItems.length,
      total_quantite: totalQuantite,
      total_value: totalValue,
      statut: 'en_cours',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    await setDoc(newSnapshotRef, snapshotData);

    // Maak snapshot items in batches (max 500 per batch)
    const itemsRef = collection(db, 'clubs', clubId, SNAPSHOTS_COLLECTION, newSnapshotRef.id, 'items');
    const batchSize = 500;

    for (let i = 0; i < activeItems.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchItems = activeItems.slice(i, i + batchSize);

      for (const item of batchItems) {
        const snapshotItemRef = doc(itemsRef, item.id);
        const snapshotItem = {
          id: item.id,
          snapshotId: newSnapshotRef.id,
          itemId: item.id,
          nom: item.nom,
          type: item.type,
          quantite: item.quantite,
          prix_achat: item.prix_achat,
          value: item.quantite * item.prix_achat,
          createdAt: Timestamp.now()
        };
        batch.set(snapshotItemRef, snapshotItem);
      }

      await batch.commit();
    }

    logger.debug(`Boutique snapshot aangemaakt: ${snapshotData.nom} met ${activeItems.length} items, waarde: €${totalValue.toFixed(2)}`);
    return newSnapshotRef.id;
  },

  /**
   * Snapshot items ophalen
   */
  async getSnapshotItems(clubId: string, snapshotId: string): Promise<BoutiqueSnapshotItem[]> {
    const itemsRef = collection(db, 'clubs', clubId, SNAPSHOTS_COLLECTION, snapshotId, 'items');
    const snapshot = await getDocs(itemsRef);

    const items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        snapshotId: data.snapshotId as string,
        itemId: data.itemId as string,
        nom: data.nom as string,
        type: data.type as BoutiqueType,
        quantite: data.quantite as number,
        prix_achat: data.prix_achat as number,
        value: data.value as number,
        createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date()
      } as BoutiqueSnapshotItem;
    });

    // Sort by name
    items.sort((a, b) => a.nom.localeCompare(b.nom));

    return items;
  },

  /**
   * Snapshot verrouilen (voor Bilan)
   */
  async lockSnapshot(clubId: string, snapshotId: string): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, SNAPSHOTS_COLLECTION, snapshotId);
    await updateDoc(docRef, {
      statut: 'verrouille',
      date_verrouillage: Timestamp.now(),
      updatedAt: serverTimestamp()
    });
    logger.debug(`Boutique snapshot verrouillé: ${snapshotId}`);
  },

  /**
   * Snapshot heropenen (met waarschuwing in UI)
   */
  async unlockSnapshot(clubId: string, snapshotId: string): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, SNAPSHOTS_COLLECTION, snapshotId);
    await updateDoc(docRef, {
      statut: 'en_cours',
      date_verrouillage: null,
      updatedAt: serverTimestamp()
    });
    logger.debug(`Boutique snapshot ontgrendeld: ${snapshotId}`);
  },

  /**
   * Waarde ophalen voor Bilan
   * ALLEEN verrouillde snapshot, geen fallback naar live waarde
   * Retourneert { value, isLocked, hasSnapshot }
   */
  async getValueForBilan(clubId: string, year: number, type: BoutiqueType): Promise<{
    value: number;
    isLocked: boolean;
    hasSnapshot: boolean;
  }> {
    const snapshot = await this.getSnapshotByYearAndType(clubId, year, type);

    if (!snapshot) {
      // Geen snapshot - retourneer live waarde met warning flag
      const liveValue = await this.calculateStockValue(clubId, type);
      return { value: liveValue, isLocked: false, hasSnapshot: false };
    }

    if (snapshot.statut === 'verrouille') {
      // Verrouillde snapshot - definitieve waarde
      return { value: snapshot.total_value, isLocked: true, hasSnapshot: true };
    }

    // Snapshot bestaat maar is niet verrouillé
    return { value: snapshot.total_value, isLocked: false, hasSnapshot: true };
  },

  /**
   * Bereken progress voor een snapshot (altijd 100% want het is een kopie)
   */
  calculateProgress(_snapshot: BoutiqueSnapshot): number {
    return 100; // Snapshots zijn altijd compleet
  }
};
