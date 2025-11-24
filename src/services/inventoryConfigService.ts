import { db } from '@/lib/firebase';
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
import {
  ItemType,
  Checklist,
  CautionRule,
  Location,
  AlertSettings,
  EmailTemplate
} from '@/types/inventory';

/**
 * Service pour gérer la configuration du module inventaire dans Firebase
 *
 * Collections:
 * - /clubs/{clubId}/inventory_config/item_types/{typeId}
 * - /clubs/{clubId}/inventory_config/checklists/{checklistId}
 * - /clubs/{clubId}/inventory_config/caution_rules/{ruleId}
 * - /clubs/{clubId}/inventory_config/locations/{locationId}
 * - /clubs/{clubId}/inventory_config/settings/alerts
 * - /clubs/{clubId}/inventory_config/email_templates/{templateId}
 */
export class InventoryConfigService {

  // ========================================
  // TYPES DE MATÉRIEL (Item Types)
  // ========================================

  /**
   * Récupérer tous les types de matériel
   */
  static async getItemTypes(clubId: string): Promise<ItemType[]> {
    try {
      const typesRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'item_types');
      const snapshot = await getDocs(query(typesRef, orderBy('nom', 'asc')));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ItemType));
    } catch (error) {
      console.error('Erreur lors du chargement des types de matériel:', error);
      throw error;
    }
  }

  /**
   * Récupérer un type de matériel par ID
   */
  static async getItemTypeById(clubId: string, typeId: string): Promise<ItemType | null> {
    try {
      const typeRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'item_types', typeId);
      const snapshot = await getDoc(typeRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as ItemType;
    } catch (error) {
      console.error('Erreur lors du chargement du type de matériel:', error);
      throw error;
    }
  }

  /**
   * Créer un nouveau type de matériel
   */
  static async createItemType(clubId: string, type: Omit<ItemType, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const typesRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'item_types');
      const newTypeRef = doc(typesRef);

      const newType: ItemType = {
        ...type,
        id: newTypeRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newTypeRef, newType);

      console.log(`Type de matériel créé: ${newType.nom} (${newType.id})`);
      return newTypeRef.id;
    } catch (error) {
      console.error('Erreur lors de la création du type de matériel:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un type de matériel existant
   */
  static async updateItemType(
    clubId: string,
    typeId: string,
    data: Partial<Omit<ItemType, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const typeRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'item_types', typeId);

      await updateDoc(typeRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Type de matériel mis à jour: ${typeId}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du type de matériel:', error);
      throw error;
    }
  }

  /**
   * Supprimer un type de matériel
   * ATTENTION: Vérifie qu'aucun matériel n'utilise ce type avant suppression
   */
  static async deleteItemType(clubId: string, typeId: string): Promise<void> {
    try {
      // Vérifier qu'aucun matériel n'utilise ce type
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_items');
      const itemsQuery = query(itemsRef, where('typeId', '==', typeId));
      const itemsSnapshot = await getDocs(itemsQuery);

      if (!itemsSnapshot.empty) {
        throw new Error(`Impossible de supprimer ce type: ${itemsSnapshot.size} matériel(s) l'utilisent encore`);
      }

      const typeRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'item_types', typeId);
      await deleteDoc(typeRef);

      console.log(`Type de matériel supprimé: ${typeId}`);
    } catch (error) {
      console.error('Erreur lors de la suppression du type de matériel:', error);
      throw error;
    }
  }

  // ========================================
  // CHECKLISTS
  // ========================================

  /**
   * Récupérer toutes les checklists
   */
  static async getChecklists(clubId: string): Promise<Checklist[]> {
    try {
      const checklistsRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'checklists');
      const snapshot = await getDocs(query(checklistsRef, orderBy('nom', 'asc')));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Checklist));
    } catch (error) {
      console.error('Erreur lors du chargement des checklists:', error);
      throw error;
    }
  }

  /**
   * Récupérer une checklist par ID
   */
  static async getChecklistById(clubId: string, checklistId: string): Promise<Checklist | null> {
    try {
      const checklistRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'checklists', checklistId);
      const snapshot = await getDoc(checklistRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as Checklist;
    } catch (error) {
      console.error('Erreur lors du chargement de la checklist:', error);
      throw error;
    }
  }

  /**
   * Créer une nouvelle checklist
   */
  static async createChecklist(clubId: string, checklist: Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const checklistsRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'checklists');
      const newChecklistRef = doc(checklistsRef);

      const newChecklist: Checklist = {
        ...checklist,
        id: newChecklistRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newChecklistRef, newChecklist);

      console.log(`Checklist créée: ${newChecklist.nom} (${newChecklist.id})`);
      return newChecklistRef.id;
    } catch (error) {
      console.error('Erreur lors de la création de la checklist:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour une checklist existante
   */
  static async updateChecklist(
    clubId: string,
    checklistId: string,
    data: Partial<Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const checklistRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'checklists', checklistId);

      await updateDoc(checklistRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Checklist mise à jour: ${checklistId}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la checklist:', error);
      throw error;
    }
  }

  /**
   * Supprimer une checklist
   */
  static async deleteChecklist(clubId: string, checklistId: string): Promise<void> {
    try {
      const checklistRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'checklists', checklistId);
      await deleteDoc(checklistRef);

      console.log(`Checklist supprimée: ${checklistId}`);
    } catch (error) {
      console.error('Erreur lors de la suppression de la checklist:', error);
      throw error;
    }
  }

  /**
   * Dupliquer une checklist
   */
  static async duplicateChecklist(clubId: string, checklistId: string, newName: string): Promise<string> {
    try {
      const originalChecklist = await this.getChecklistById(clubId, checklistId);

      if (!originalChecklist) {
        throw new Error('Checklist originale introuvable');
      }

      const duplicateData: Omit<Checklist, 'id' | 'createdAt' | 'updatedAt'> = {
        nom: newName,
        description: originalChecklist.description,
        items: originalChecklist.items.map(item => ({ ...item })), // Deep copy
        type_materiel_ids: [...originalChecklist.type_materiel_ids],
        actif: originalChecklist.actif
      };

      const newChecklistId = await this.createChecklist(clubId, duplicateData);

      console.log(`Checklist dupliquée: ${checklistId} → ${newChecklistId}`);
      return newChecklistId;
    } catch (error) {
      console.error('Erreur lors de la duplication de la checklist:', error);
      throw error;
    }
  }

  // ========================================
  // RÈGLES DE CAUTION
  // ========================================

  /**
   * Récupérer toutes les règles de caution
   */
  static async getCautionRules(clubId: string): Promise<CautionRule[]> {
    try {
      const rulesRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'caution_rules');
      const snapshot = await getDocs(query(rulesRef, orderBy('nom', 'asc')));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as CautionRule));
    } catch (error) {
      console.error('Erreur lors du chargement des règles de caution:', error);
      throw error;
    }
  }

  /**
   * Récupérer une règle de caution par ID
   */
  static async getCautionRuleById(clubId: string, ruleId: string): Promise<CautionRule | null> {
    try {
      const ruleRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'caution_rules', ruleId);
      const snapshot = await getDoc(ruleRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as CautionRule;
    } catch (error) {
      console.error('Erreur lors du chargement de la règle de caution:', error);
      throw error;
    }
  }

  /**
   * Créer ou mettre à jour une règle de caution
   */
  static async saveCautionRule(clubId: string, rule: CautionRule): Promise<void> {
    try {
      const ruleRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'caution_rules', rule.id);

      await setDoc(ruleRef, {
        ...rule,
        updatedAt: serverTimestamp()
      }, { merge: true });

      console.log(`Règle de caution sauvegardée: ${rule.nom} (${rule.id})`);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la règle de caution:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour toutes les règles de caution (batch)
   */
  static async updateCautionRules(clubId: string, rules: CautionRule[]): Promise<void> {
    try {
      const batch = writeBatch(db);

      for (const rule of rules) {
        const ruleRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'caution_rules', rule.id);
        batch.set(ruleRef, {
          ...rule,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();

      console.log(`${rules.length} règles de caution mises à jour`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour des règles de caution:', error);
      throw error;
    }
  }

  /**
   * Supprimer une règle de caution
   */
  static async deleteCautionRule(clubId: string, ruleId: string): Promise<void> {
    try {
      const ruleRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'caution_rules', ruleId);
      await deleteDoc(ruleRef);

      console.log(`Règle de caution supprimée: ${ruleId}`);
    } catch (error) {
      console.error('Erreur lors de la suppression de la règle de caution:', error);
      throw error;
    }
  }

  // ========================================
  // EMPLACEMENTS (Locations)
  // ========================================

  /**
   * Récupérer tous les emplacements
   */
  static async getLocations(clubId: string): Promise<Location[]> {
    try {
      const locationsRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'locations');
      const snapshot = await getDocs(query(locationsRef, orderBy('nom', 'asc')));

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Location));
    } catch (error) {
      console.error('Erreur lors du chargement des emplacements:', error);
      throw error;
    }
  }

  /**
   * Récupérer un emplacement par ID
   */
  static async getLocationById(clubId: string, locationId: string): Promise<Location | null> {
    try {
      const locationRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'locations', locationId);
      const snapshot = await getDoc(locationRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as Location;
    } catch (error) {
      console.error('Erreur lors du chargement de l\'emplacement:', error);
      throw error;
    }
  }

  /**
   * Créer un nouvel emplacement
   */
  static async createLocation(clubId: string, location: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const locationsRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'locations');
      const newLocationRef = doc(locationsRef);

      const newLocation: Location = {
        ...location,
        id: newLocationRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await setDoc(newLocationRef, newLocation);

      console.log(`Emplacement créé: ${newLocation.nom} (${newLocation.id})`);
      return newLocationRef.id;
    } catch (error) {
      console.error('Erreur lors de la création de l\'emplacement:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un emplacement existant
   */
  static async updateLocation(
    clubId: string,
    locationId: string,
    data: Partial<Omit<Location, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    try {
      const locationRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'locations', locationId);

      await updateDoc(locationRef, {
        ...data,
        updatedAt: serverTimestamp()
      });

      console.log(`Emplacement mis à jour: ${locationId}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour de l\'emplacement:', error);
      throw error;
    }
  }

  /**
   * Supprimer un emplacement
   * ATTENTION: Vérifie qu'aucun matériel n'est stocké à cet emplacement
   */
  static async deleteLocation(clubId: string, locationId: string): Promise<void> {
    try {
      // Vérifier qu'aucun matériel n'est stocké ici
      const itemsRef = collection(db, 'clubs', clubId, 'inventory_items');
      const itemsQuery = query(itemsRef, where('locationId', '==', locationId));
      const itemsSnapshot = await getDocs(itemsQuery);

      if (!itemsSnapshot.empty) {
        throw new Error(`Impossible de supprimer cet emplacement: ${itemsSnapshot.size} matériel(s) y sont stocké(s)`);
      }

      const locationRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'locations', locationId);
      await deleteDoc(locationRef);

      console.log(`Emplacement supprimé: ${locationId}`);
    } catch (error) {
      console.error('Erreur lors de la suppression de l\'emplacement:', error);
      throw error;
    }
  }

  // ========================================
  // PARAMÈTRES D'ALERTE (Alert Settings)
  // ========================================

  /**
   * Récupérer les paramètres d'alerte
   */
  static async getAlertSettings(clubId: string): Promise<AlertSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'alerts', 'main');
      const snapshot = await getDoc(settingsRef);

      if (!snapshot.exists()) {
        // Retourner les paramètres par défaut
        return this.getDefaultAlertSettings();
      }

      return snapshot.data() as AlertSettings;
    } catch (error) {
      console.error('Erreur lors du chargement des paramètres d\'alerte:', error);
      return this.getDefaultAlertSettings();
    }
  }

  /**
   * Mettre à jour les paramètres d'alerte
   */
  static async updateAlertSettings(clubId: string, settings: AlertSettings): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'alerts', 'main');

      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });

      console.log('Paramètres d\'alerte mis à jour');
    } catch (error) {
      console.error('Erreur lors de la mise à jour des paramètres d\'alerte:', error);
      throw error;
    }
  }

  /**
   * Paramètres d'alerte par défaut
   */
  private static getDefaultAlertSettings(): AlertSettings {
    return {
      retour_rappel_jours: 7,
      retour_rappel_actif: true,
      retour_overdue_actif: true,
      maintenance_avant_jours: 30,
      maintenance_actif: true,
      stock_faible_actif: true,
      destinataires_retard: [],
      destinataires_maintenance: [],
      destinataires_stock: []
    };
  }

  // ========================================
  // TEMPLATES D'EMAIL (Email Templates)
  // ========================================

  /**
   * Récupérer tous les templates d'email
   */
  static async getEmailTemplates(clubId: string): Promise<EmailTemplate[]> {
    try {
      const templatesRef = collection(db, 'clubs', clubId, 'inventory_config', 'settings', 'email_templates');
      const snapshot = await getDocs(templatesRef);

      if (snapshot.empty) {
        // Retourner les templates par défaut
        return this.getDefaultEmailTemplates();
      }

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as EmailTemplate));
    } catch (error) {
      console.error('Erreur lors du chargement des templates d\'email:', error);
      return this.getDefaultEmailTemplates();
    }
  }

  /**
   * Récupérer un template d'email par ID
   */
  static async getEmailTemplateById(clubId: string, templateId: string): Promise<EmailTemplate | null> {
    try {
      const templateRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'email_templates', templateId);
      const snapshot = await getDoc(templateRef);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: snapshot.id,
        ...snapshot.data()
      } as EmailTemplate;
    } catch (error) {
      console.error('Erreur lors du chargement du template d\'email:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour un template d'email
   */
  static async updateEmailTemplate(
    clubId: string,
    templateId: string,
    content: string
  ): Promise<void> {
    try {
      const templateRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'email_templates', templateId);

      await updateDoc(templateRef, {
        contenu: content,
        updatedAt: serverTimestamp()
      });

      console.log(`Template d\'email mis à jour: ${templateId}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du template d\'email:', error);
      throw error;
    }
  }

  /**
   * Réinitialiser un template d'email aux valeurs par défaut
   */
  static async resetEmailTemplate(clubId: string, templateId: string): Promise<void> {
    try {
      const defaultTemplates = this.getDefaultEmailTemplates();
      const defaultTemplate = defaultTemplates.find(t => t.id === templateId);

      if (!defaultTemplate) {
        throw new Error('Template par défaut introuvable');
      }

      const templateRef = doc(db, 'clubs', clubId, 'inventory_config', 'settings', 'email_templates', templateId);

      await setDoc(templateRef, {
        ...defaultTemplate,
        updatedAt: serverTimestamp()
      });

      console.log(`Template d\'email réinitialisé: ${templateId}`);
    } catch (error) {
      console.error('Erreur lors de la réinitialisation du template d\'email:', error);
      throw error;
    }
  }

  /**
   * Templates d'email par défaut
   */
  private static getDefaultEmailTemplates(): EmailTemplate[] {
    return [
      {
        id: 'loan_confirmation',
        type: 'loan_confirmation',
        nom: 'Confirmation de prêt',
        sujet: 'Confirmation de prêt - Matériel Calypso',
        contenu: `Bonjour {{membre_nom}},

Nous confirmons le prêt du matériel suivant :

{{materiel_liste}}

Date de retour prévue : {{date_retour}}
Montant de la caution : {{montant_caution}}€

Merci de rapporter le matériel en bon état à la date prévue.

Bonne plongée !
L'équipe Calypso`,
        variables: ['membre_nom', 'materiel_liste', 'date_retour', 'montant_caution'],
        actif: true
      },
      {
        id: 'return_reminder',
        type: 'return_reminder',
        nom: 'Rappel de retour',
        sujet: 'Rappel - Retour de matériel dans {{jours_restants}} jour(s)',
        contenu: `Bonjour {{membre_nom}},

Ce message pour vous rappeler que le matériel suivant doit être retourné le {{date_retour}} :

{{materiel_liste}}

Merci de le rapporter en bon état.

L'équipe Calypso`,
        variables: ['membre_nom', 'materiel_liste', 'date_retour', 'jours_restants'],
        actif: true
      },
      {
        id: 'return_overdue',
        type: 'return_overdue',
        nom: 'Matériel en retard',
        sujet: 'URGENT - Matériel en retard',
        contenu: `Bonjour {{membre_nom}},

Le matériel suivant devait être retourné le {{date_retour}} :

{{materiel_liste}}

Merci de le rapporter dès que possible.

L'équipe Calypso`,
        variables: ['membre_nom', 'materiel_liste', 'date_retour', 'jours_retard'],
        actif: true
      },
      {
        id: 'return_confirmation',
        type: 'return_confirmation',
        nom: 'Confirmation de retour',
        sujet: 'Confirmation de retour - Matériel Calypso',
        contenu: `Bonjour {{membre_nom}},

Nous confirmons le retour du matériel suivant :

{{materiel_liste}}

État du matériel : {{etat_materiel}}
Montant de la caution remboursé : {{montant_rembourse}}€

Merci et à bientôt !
L'équipe Calypso`,
        variables: ['membre_nom', 'materiel_liste', 'etat_materiel', 'montant_rembourse'],
        actif: true
      },
      {
        id: 'maintenance_reminder',
        type: 'maintenance_reminder',
        nom: 'Rappel de maintenance',
        sujet: 'Maintenance à prévoir - {{materiel_nom}}',
        contenu: `Bonjour,

Le matériel suivant nécessite une maintenance prochainement :

Code : {{materiel_code}}
Nom : {{materiel_nom}}
Date de maintenance prévue : {{date_maintenance}}

Merci de planifier l'intervention.

L'équipe Calypso`,
        variables: ['materiel_code', 'materiel_nom', 'date_maintenance'],
        actif: true
      },
      {
        id: 'stock_alert',
        type: 'stock_alert',
        nom: 'Alerte stock faible',
        sujet: 'Alerte - Stock faible : {{produit_nom}}',
        contenu: `Bonjour,

Le stock du produit suivant est faible :

Produit : {{produit_nom}}
Stock actuel : {{stock_actuel}}
Seuil minimum : {{stock_minimum}}

Merci de prévoir une commande.

L'équipe Calypso`,
        variables: ['produit_nom', 'stock_actuel', 'stock_minimum'],
        actif: true
      }
    ];
  }
}
