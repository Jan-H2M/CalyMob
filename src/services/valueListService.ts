/**
 * Value List Service
 *
 * Service voor CRUD operaties op waardelijsten in Firestore.
 * Beheert dynamische dropdowns en select options.
 */

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
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  ValueList,
  ValueListItem,
  ValueListCategory,
  CreateValueListDTO,
  UpdateValueListDTO,
  CreateValueListItemDTO,
  UpdateValueListItemDTO
} from '../types/valueList.types';

/**
 * Haal een enkele waardelijst op
 */
export async function getValueList(clubId: string, listId: string): Promise<ValueList | null> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      name: data.name,
      description: data.description,
      type: data.type,
      category: data.category,
      items: data.items || [],
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      createdBy: data.createdBy
    };
  } catch (error) {
    console.error('Error fetching value list:', error);
    throw error;
  }
}

/**
 * Haal alle waardelijsten op voor een club
 */
export async function getValueLists(clubId: string): Promise<ValueList[]> {
  try {
    const collectionRef = collection(db, 'clubs', clubId, 'value_lists');
    const querySnapshot = await getDocs(collectionRef);

    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        items: data.items || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        createdBy: data.createdBy
      };
    });
  } catch (error) {
    console.error('Error fetching value lists:', error);
    throw error;
  }
}

/**
 * Haal waardelijsten op gefilterd op categorie
 */
export async function getValueListsByCategory(
  clubId: string,
  category: ValueListCategory
): Promise<ValueList[]> {
  try {
    const collectionRef = collection(db, 'clubs', clubId, 'value_lists');
    const q = query(collectionRef, where('category', '==', category));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        description: data.description,
        type: data.type,
        category: data.category,
        items: data.items || [],
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        createdBy: data.createdBy
      };
    });
  } catch (error) {
    console.error('Error fetching value lists by category:', error);
    throw error;
  }
}

/**
 * Maak een nieuwe waardelijst aan
 */
export async function createValueList(
  clubId: string,
  data: CreateValueListDTO,
  createdBy: string
): Promise<string> {
  try {
    // Genereer unieke ID gebaseerd op naam (kebab-case)
    const listId = data.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Verwijder accenten
      .replace(/[^a-z0-9]+/g, '_')      // Vervang speciale tekens door underscore
      .replace(/^_+|_+$/g, '');         // Verwijder leading/trailing underscores

    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);

    const valueList = {
      name: data.name,
      description: data.description || '',
      type: data.type,
      category: data.category,
      items: data.items || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy
    };

    await setDoc(docRef, valueList);

    return listId;
  } catch (error) {
    console.error('Error creating value list:', error);
    throw error;
  }
}

/**
 * Update een bestaande waardelijst
 */
export async function updateValueList(
  clubId: string,
  listId: string,
  updates: UpdateValueListDTO
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);

    // Check if list exists and is not system type
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet gewijzigd worden');
    }

    const updateData: any = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating value list:', error);
    throw error;
  }
}

/**
 * Verwijder een waardelijst
 */
export async function deleteValueList(clubId: string, listId: string): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);

    // Check if list exists and is not system type
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet verwijderd worden');
    }

    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting value list:', error);
    throw error;
  }
}

/**
 * Voeg een item toe aan een waardelijst
 */
export async function addValueListItem(
  clubId: string,
  listId: string,
  itemData: CreateValueListItemDTO
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet gewijzigd worden');
    }

    const items: ValueListItem[] = data.items || [];

    // Check if value already exists
    if (items.some(item => item.value === itemData.value)) {
      throw new Error('Item met deze waarde bestaat al');
    }

    // Calculate order (max + 1)
    const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order)) : 0;

    const newItem: ValueListItem = {
      value: itemData.value,
      label: itemData.label,
      shortCode: itemData.shortCode,
      ...(itemData.color && { color: itemData.color }), // Only include if defined
      ...(itemData.icon && { icon: itemData.icon }),     // Only include if defined
      order: maxOrder + 1,
      isFavorite: itemData.isFavorite || false,
      active: itemData.active !== undefined ? itemData.active : true
    };

    items.push(newItem);

    await updateDoc(docRef, {
      items,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error adding value list item:', error);
    throw error;
  }
}

/**
 * Update een item in een waardelijst
 */
export async function updateValueListItem(
  clubId: string,
  listId: string,
  itemValue: string,
  updates: UpdateValueListItemDTO
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet gewijzigd worden');
    }

    const items: ValueListItem[] = data.items || [];
    const itemIndex = items.findIndex(item => item.value === itemValue);

    if (itemIndex === -1) {
      throw new Error('Item niet gevonden');
    }

    // Update item
    items[itemIndex] = {
      ...items[itemIndex],
      ...updates
    };

    await updateDoc(docRef, {
      items,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating value list item:', error);
    throw error;
  }
}

/**
 * Verwijder een item uit een waardelijst
 */
export async function deleteValueListItem(
  clubId: string,
  listId: string,
  itemValue: string
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet verwijderd worden');
    }

    const items: ValueListItem[] = data.items || [];
    const filteredItems = items.filter(item => item.value !== itemValue);

    await updateDoc(docRef, {
      items: filteredItems,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error deleting value list item:', error);
    throw error;
  }
}

/**
 * Wijzig de volgorde van items in een waardelijst
 */
export async function reorderValueListItems(
  clubId: string,
  listId: string,
  newOrder: { value: string; order: number }[]
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet gewijzigd worden');
    }

    const items: ValueListItem[] = data.items || [];

    // Update order for each item
    newOrder.forEach(({ value, order }) => {
      const item = items.find(i => i.value === value);
      if (item) {
        item.order = order;
      }
    });

    await updateDoc(docRef, {
      items,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error reordering value list items:', error);
    throw error;
  }
}

/**
 * Toggle favoriet status van een item
 */
export async function toggleItemFavorite(
  clubId: string,
  listId: string,
  itemValue: string
): Promise<void> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'value_lists', listId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Waardelijst bestaat niet');
    }

    const data = docSnap.data();
    if (data.type === 'system') {
      throw new Error('Systeem lijsten kunnen niet gewijzigd worden');
    }

    const items: ValueListItem[] = data.items || [];
    const item = items.find(i => i.value === itemValue);

    if (!item) {
      throw new Error('Item niet gevonden');
    }

    item.isFavorite = !item.isFavorite;

    await updateDoc(docRef, {
      items,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error toggling item favorite:', error);
    throw error;
  }
}

/**
 * Sorteer items: eerst favorieten, dan op volgorde
 */
export function sortValueListItems(items: ValueListItem[]): ValueListItem[] {
  return items
    .filter(item => item.active)  // Alleen actieve items
    .sort((a, b) => {
      // Eerst sorteren op favoriet
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;

      // Dan op order
      return a.order - b.order;
    });
}

/**
 * Haal een specifiek item op uit een waardelijst
 */
export async function getValueListItem(
  clubId: string,
  listId: string,
  value: string
): Promise<ValueListItem | null> {
  try {
    const valueList = await getValueList(clubId, listId);
    if (!valueList) return null;

    return valueList.items.find(item => item.value === value) || null;
  } catch (error) {
    console.error('Error fetching value list item:', error);
    return null;
  }
}

/**
 * Valideer een waardelijst item
 */
export function validateValueListItem(item: Partial<CreateValueListItemDTO>): string[] {
  const errors: string[] = [];

  if (!item.value || item.value.trim() === '') {
    errors.push('Valeur est obligatoire');
  }

  if (!item.label || item.label.trim() === '') {
    errors.push('Label est obligatoire');
  }

  if (!item.shortCode || item.shortCode.trim() === '') {
    errors.push('Code court est obligatoire');
  }

  if (item.shortCode && item.shortCode.length > 10) {
    errors.push('Code court maximum 10 caractères');
  }

  if (item.color && !/^#[0-9A-Fa-f]{6}$/.test(item.color)) {
    errors.push('Couleur doit être un code hex valide (ex: #3b82f6)');
  }

  return errors;
}

// Export all functions
export const ValueListService = {
  getValueList,
  getValueLists,
  getValueListsByCategory,
  createValueList,
  updateValueList,
  deleteValueList,
  addValueListItem,
  updateValueListItem,
  deleteValueListItem,
  reorderValueListItems,
  toggleItemFavorite,
  sortValueListItems,
  getValueListItem,
  validateValueListItem
};
