import { logger } from '@/utils/logger';
/**
 * Service voor beheer van fournisseurs (leveranciers)
 *
 * Collection: /clubs/{clubId}/fournisseurs
 *
 * Leveranciers zijn externe partijen (niet-leden) die terugbetaald kunnen worden
 * via het dépenses systeem. Hun IBAN wordt gebruikt voor EPC QR-code generatie.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Fournisseur } from '@/types';

// ============================================================
// TYPES & INTERFACES
// ============================================================

export interface FournisseurFilters {
  search?: string;      // Zoeken op naam, email, BTW-nummer
  actif?: boolean;      // Filter op actief/inactief
}

export interface CreateFournisseurDTO {
  nom: string;
  iban: string;
  adresse?: string;
  code_postal?: string;
  localite?: string;
  pays?: string;
  email?: string;
  telephone?: string;
  numero_tva?: string;
  notes?: string;
}

export interface UpdateFournisseurDTO {
  nom?: string;
  iban?: string;
  adresse?: string;
  code_postal?: string;
  localite?: string;
  pays?: string;
  email?: string;
  telephone?: string;
  numero_tva?: string;
  notes?: string;
  actif?: boolean;
}

// ============================================================
// CRUD FOURNISSEURS
// ============================================================

/**
 * Haalt alle fournisseurs op met optionele filters
 */
export async function getFournisseurs(
  clubId: string,
  filters?: FournisseurFilters
): Promise<Fournisseur[]> {
  try {
    const fournisseursRef = collection(db, 'clubs', clubId, 'fournisseurs');
    let q = query(fournisseursRef, orderBy('nom'));

    // Filter op actief status in Firestore
    if (filters?.actif !== undefined) {
      q = query(q, where('actif', '==', filters.actif));
    }

    const snapshot = await getDocs(q);
    let fournisseurs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      created_at: doc.data().created_at?.toDate?.() || new Date(),
      updated_at: doc.data().updated_at?.toDate?.() || new Date(),
    })) as Fournisseur[];

    // Client-side zoeken (voor flexibiliteit)
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      fournisseurs = fournisseurs.filter(f =>
        f.nom.toLowerCase().includes(searchLower) ||
        (f.email && f.email.toLowerCase().includes(searchLower)) ||
        (f.numero_tva && f.numero_tva.toLowerCase().includes(searchLower)) ||
        (f.iban && f.iban.toLowerCase().includes(searchLower))
      );
    }

    return fournisseurs;
  } catch (error) {
    logger.error('Error fetching fournisseurs:', error);
    throw error;
  }
}

/**
 * Haalt een fournisseur op via ID
 */
export async function getFournisseurById(
  clubId: string,
  fournisseurId: string
): Promise<Fournisseur | null> {
  try {
    const fournisseurRef = doc(db, 'clubs', clubId, 'fournisseurs', fournisseurId);
    const snapshot = await getDoc(fournisseurRef);

    if (!snapshot.exists()) {
      return null;
    }

    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      created_at: data.created_at?.toDate?.() || new Date(),
      updated_at: data.updated_at?.toDate?.() || new Date(),
    } as Fournisseur;
  } catch (error) {
    logger.error('Error fetching fournisseur:', error);
    throw error;
  }
}

/**
 * Maakt een nieuwe fournisseur aan
 */
export async function createFournisseur(
  clubId: string,
  data: CreateFournisseurDTO,
  createdBy: string
): Promise<string> {
  try {
    const fournisseursRef = collection(db, 'clubs', clubId, 'fournisseurs');
    const now = Timestamp.now();

    // Valideer IBAN formaat (basis check)
    const cleanIban = data.iban.replace(/\s/g, '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      throw new Error('IBAN invalide: longueur incorrecte');
    }

    const fournisseurData = {
      nom: data.nom.trim(),
      iban: cleanIban,
      adresse: data.adresse?.trim() || null,
      code_postal: data.code_postal?.trim() || null,
      localite: data.localite?.trim() || null,
      pays: data.pays?.trim() || 'Belgique',
      email: data.email?.trim().toLowerCase() || null,
      telephone: data.telephone?.trim() || null,
      numero_tva: data.numero_tva?.trim().toUpperCase() || null,
      notes: data.notes?.trim() || null,
      actif: true,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    };

    const docRef = await addDoc(fournisseursRef, fournisseurData);
    logger.debug(`✅ Fournisseur créé: ${data.nom} (${docRef.id})`);

    return docRef.id;
  } catch (error) {
    logger.error('Error creating fournisseur:', error);
    throw error;
  }
}

/**
 * Update een bestaande fournisseur
 */
export async function updateFournisseur(
  clubId: string,
  fournisseurId: string,
  data: UpdateFournisseurDTO
): Promise<void> {
  try {
    const fournisseurRef = doc(db, 'clubs', clubId, 'fournisseurs', fournisseurId);
    const now = Timestamp.now();

    const updateData: any = {
      updated_at: now,
    };

    // Voeg alleen gedefinieerde velden toe
    if (data.nom !== undefined) updateData.nom = data.nom.trim();
    if (data.iban !== undefined) {
      const cleanIban = data.iban.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        throw new Error('IBAN invalide: longueur incorrecte');
      }
      updateData.iban = cleanIban;
    }
    if (data.adresse !== undefined) updateData.adresse = data.adresse?.trim() || null;
    if (data.code_postal !== undefined) updateData.code_postal = data.code_postal?.trim() || null;
    if (data.localite !== undefined) updateData.localite = data.localite?.trim() || null;
    if (data.pays !== undefined) updateData.pays = data.pays?.trim() || 'Belgique';
    if (data.email !== undefined) updateData.email = data.email?.trim().toLowerCase() || null;
    if (data.telephone !== undefined) updateData.telephone = data.telephone?.trim() || null;
    if (data.numero_tva !== undefined) updateData.numero_tva = data.numero_tva?.trim().toUpperCase() || null;
    if (data.notes !== undefined) updateData.notes = data.notes?.trim() || null;
    if (data.actif !== undefined) updateData.actif = data.actif;

    await updateDoc(fournisseurRef, updateData);
    logger.debug(`✏️ Fournisseur mis à jour: ${fournisseurId}`);
  } catch (error) {
    logger.error('Error updating fournisseur:', error);
    throw error;
  }
}

/**
 * Verwijdert een fournisseur permanent uit de database
 */
export async function deleteFournisseur(
  clubId: string,
  fournisseurId: string
): Promise<void> {
  try {
    const fournisseurRef = doc(db, 'clubs', clubId, 'fournisseurs', fournisseurId);
    await deleteDoc(fournisseurRef);
    logger.debug(`🗑️ Fournisseur supprimé: ${fournisseurId}`);
  } catch (error) {
    logger.error('Error deleting fournisseur:', error);
    throw error;
  }
}

/**
 * Verwijdert een fournisseur permanent (hard delete)
 */
export async function hardDeleteFournisseur(
  clubId: string,
  fournisseurId: string
): Promise<void> {
  try {
    const fournisseurRef = doc(db, 'clubs', clubId, 'fournisseurs', fournisseurId);
    await deleteDoc(fournisseurRef);
    logger.debug(`🗑️ Fournisseur supprimé définitivement: ${fournisseurId}`);
  } catch (error) {
    logger.error('Error hard deleting fournisseur:', error);
    throw error;
  }
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Controleert of een fournisseur met dezelfde naam al bestaat
 */
export async function fournisseurNameExists(
  clubId: string,
  nom: string,
  excludeId?: string
): Promise<boolean> {
  try {
    const fournisseursRef = collection(db, 'clubs', clubId, 'fournisseurs');
    const q = query(fournisseursRef, where('nom', '==', nom.trim()));
    const snapshot = await getDocs(q);

    if (excludeId) {
      return snapshot.docs.some(doc => doc.id !== excludeId);
    }

    return !snapshot.empty;
  } catch (error) {
    logger.error('Error checking fournisseur name:', error);
    throw error;
  }
}

/**
 * Haalt actieve fournisseurs op voor dropdown selectie
 */
export async function getActiveFournisseurs(clubId: string): Promise<Fournisseur[]> {
  return getFournisseurs(clubId, { actif: true });
}

/**
 * Zoekt een fournisseur op basis van IBAN
 * Gebruikt voor het automatisch vinden van een fournisseur bij het aanmaken van een remboursement
 */
export async function findFournisseurByIban(
  clubId: string,
  iban: string
): Promise<Fournisseur | null> {
  try {
    const normalizedIban = iban.replace(/\s/g, '').toUpperCase();
    const fournisseurs = await getFournisseurs(clubId, { actif: true });

    return fournisseurs.find(f =>
      f.iban?.replace(/\s/g, '').toUpperCase() === normalizedIban
    ) || null;
  } catch (error) {
    logger.error('Error finding fournisseur by IBAN:', error);
    return null;
  }
}
