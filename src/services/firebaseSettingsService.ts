import { logger } from '@/utils/logger';
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
  DocumentData,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { Categorie, AccountCode } from '@/types';
import { SecuritySettings, DEFAULT_SECURITY_SETTINGS, DownloadSettings, DEFAULT_DOWNLOAD_SETTINGS, CompatibilitySettings, CategorizationSettings, DEFAULT_CATEGORIZATION_SETTINGS, LifrasRulesSettings, DEFAULT_LIFRAS_RULES } from '@/types/settings.types';
import { CommunicationSettings, DEFAULT_COMMUNICATION_SETTINGS } from '@/types/communication';
import { SMSSettings, SMSHistory, MemberSMSPreferences, DEFAULT_SMS_SETTINGS, SMSTemplate } from '@/types/sms';
import { normalizeCommunicationEmailType } from '@/services/communicationService';

/**
 * Email configuration type
 */
export interface EmailConfig {
  provider: 'gmail' | 'resend';
  resend: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
  };
  gmail: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    fromEmail: string;
    fromName: string;
  };
}

/**
 * Service pour gérer les paramètres dans Firebase
 */
export class FirebaseSettingsService {

  /**
   * Migrer les catégories depuis localStorage vers Firebase
   */
  static async migrateCategoriesToFirebase(clubId: string): Promise<void> {
    const savedCategories = localStorage.getItem('appCategories');

    if (savedCategories) {
      try {
        const categories: Categorie[] = JSON.parse(savedCategories);

        // Sauvegarder chaque catégorie dans Firebase
        for (const category of categories) {
          const categoryRef = doc(db, 'clubs', clubId, 'categories', category.id);
          await setDoc(categoryRef, {
            ...category,
            updated_at: new Date()
          });
        }

        logger.debug(`${categories.length} catégories migrées vers Firebase`);
      } catch (error) {
        logger.error('Erreur lors de la migration des catégories:', error);
        throw error;
      }
    }
  }

  /**
   * Charger les catégories depuis Firebase
   */
  static async loadCategories(clubId: string): Promise<Categorie[]> {
    try {
      const categoriesRef = collection(db, 'clubs', clubId, 'categories');
      const snapshot = await getDocs(query(categoriesRef));

      if (snapshot.empty) {
        // Si aucune catégorie dans Firebase, retourner les catégories par défaut
        return this.getDefaultCategories();
      }

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Categorie));
    } catch (error) {
      logger.error('Erreur lors du chargement des catégories:', error);
      return this.getDefaultCategories();
    }
  }

  /**
   * Sauvegarder une catégorie dans Firebase
   */
  static async saveCategory(clubId: string, category: Categorie): Promise<void> {
    try {
      const categoryRef = doc(db, 'clubs', clubId, 'categories', category.id);
      await setDoc(categoryRef, {
        ...category,
        updated_at: new Date()
      });

      // Mettre à jour le cache des catégories
      this.updateCategoriesCache(clubId, category);
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Met à jour le cache des catégories après une modification
   */
  private static updateCategoriesCache(clubId: string, updatedCategory: Categorie): void {
    try {
      const cachedCategories = sessionStorage.getItem('appCategories_cache');
      if (cachedCategories) {
        const categories: Categorie[] = JSON.parse(cachedCategories);
        const index = categories.findIndex(c => c.id === updatedCategory.id);

        if (index >= 0) {
          // Mettre à jour la catégorie existante
          categories[index] = updatedCategory;
        } else {
          // Ajouter la nouvelle catégorie
          categories.push(updatedCategory);
        }

        sessionStorage.setItem('appCategories_cache', JSON.stringify(categories));
      }
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du cache:', error);
    }
  }

  /**
   * Supprimer une catégorie de Firebase
   */
  static async deleteCategory(clubId: string, categoryId: string): Promise<void> {
    try {
      const categoryRef = doc(db, 'clubs', clubId, 'categories', categoryId);
      await deleteDoc(categoryRef);

      // Mettre à jour le cache (retirer la catégorie supprimée)
      this.removeCategoryFromCache(categoryId);
    } catch (error) {
      logger.error('Erreur lors de la suppression de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Retire une catégorie du cache après suppression
   */
  private static removeCategoryFromCache(categoryId: string): void {
    try {
      const cachedCategories = sessionStorage.getItem('appCategories_cache');
      if (cachedCategories) {
        const categories: Categorie[] = JSON.parse(cachedCategories);
        const filtered = categories.filter(c => c.id !== categoryId);
        sessionStorage.setItem('appCategories_cache', JSON.stringify(filtered));
      }
    } catch (error) {
      logger.error('Erreur lors de la mise à jour du cache:', error);
    }
  }

  /**
   * Migrer les codes comptables personnalisés vers Firebase
   */
  static async migrateAccountCodesToFirebase(clubId: string): Promise<void> {
    const savedCodes = localStorage.getItem('customAccountCodes');
    const selectedCodes = localStorage.getItem('selectedAccountCodes');

    if (savedCodes || selectedCodes) {
      try {
        const customCodes = savedCodes ? JSON.parse(savedCodes) : {};
        const selected = selectedCodes ? JSON.parse(selectedCodes) : [];

        const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
        await setDoc(settingsRef, {
          customAccountCodes: customCodes,
          selectedAccountCodes: selected,
          updated_at: new Date()
        }, { merge: true });

        logger.debug('Codes comptables migrés vers Firebase');
      } catch (error) {
        logger.error('Erreur lors de la migration des codes comptables:', error);
        throw error;
      }
    }
  }

  /**
   * Charger les codes comptables depuis Firebase
   */
  static async loadAccountCodesSettings(clubId: string): Promise<{
    customCodes: Record<string, any>;
    selectedCodes: string[];
  }> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          customCodes: data.customAccountCodes || {},
          selectedCodes: data.selectedAccountCodes || []
        };
      }

      return { customCodes: {}, selectedCodes: [] };
    } catch (error) {
      logger.error('Erreur lors du chargement des codes comptables:', error);
      return { customCodes: {}, selectedCodes: [] };
    }
  }

  /**
   * Sauvegarder les codes comptables dans Firebase
   */
  static async saveAccountCodesSettings(
    clubId: string,
    customCodes: Record<string, any>,
    selectedCodes: string[]
  ): Promise<void> {
    try {
      // Nettoyer les valeurs undefined (Firestore ne les accepte pas)
      const cleanedCodes: Record<string, any> = {};
      for (const [key, value] of Object.entries(customCodes)) {
        if (value && typeof value === 'object') {
          const cleanedValue: Record<string, any> = {};
          for (const [k, v] of Object.entries(value)) {
            if (v !== undefined) {
              cleanedValue[k] = v;
            }
          }
          cleanedCodes[key] = cleanedValue;
        } else if (value !== undefined) {
          cleanedCodes[key] = value;
        }
      }

      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      // BELANGRIJK: Geen merge gebruiken! Met merge doet Firestore deep merge
      // waardoor verwijderde codes nooit echt verwijderd worden uit customAccountCodes
      await setDoc(settingsRef, {
        customAccountCodes: cleanedCodes,
        selectedAccountCodes: selectedCodes,
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde des codes comptables:', error);
      throw error;
    }
  }

  /**
   * Nettoyer les codes comptables personnalisés
   * - Supprime l'ancien champ 'category' (remplacé par 'categories')
   * - Supprime les doublons dans 'categories'
   * - Supprime les category IDs invalides (qui n'existent pas)
   * - Supprime les customCodes qui sont identiques aux codes de base
   */
  static async cleanupAccountCodesSettings(clubId: string): Promise<{
    cleaned: number;
    removed: number;
  }> {
    try {
      const settings = await this.loadAccountCodesSettings(clubId);
      const { getCalypsoAccountCodes } = await import('@/config/calypso-accounts');
      const baseCodes = getCalypsoAccountCodes();
      const baseCodesMap = new Map(baseCodes.map(c => [c.code, c]));

      // Charger les catégories valides pour valider les IDs
      const validCategories = await this.loadCategories(clubId);
      // Créer des maps par type pour valider les categories
      const revenuCategoryIds = new Set(validCategories.filter(c => c.type === 'revenu').map(c => c.id));
      const depenseCategoryIds = new Set(validCategories.filter(c => c.type === 'depense').map(c => c.id));

      let cleaned = 0;
      let removed = 0;
      const cleanedCodes: Record<string, any> = {};

      for (const [codeKey, customCode] of Object.entries(settings.customCodes)) {
        const baseCode = baseCodesMap.get(codeKey);
        let needsUpdate = false;
        const cleanedCode = { ...customCode };

        // Supprimer l'ancien champ 'category'
        if ('category' in cleanedCode) {
          delete cleanedCode.category;
          needsUpdate = true;
        }

        // RESET type naar base code als het afwijkt (voorkomt corrupte data)
        if (baseCode && cleanedCode.type !== baseCode.type) {
          logger.debug(`Cleanup: Reset type voor ${codeKey} van '${cleanedCode.type}' naar '${baseCode.type}'`);
          cleanedCode.type = baseCode.type;
          needsUpdate = true;
        }

        // Bepaal welke categories geldig zijn voor dit type
        const effectiveType = cleanedCode.type || baseCode?.type;
        let validCategoryIdsForType: Set<string>;
        if (effectiveType === 'revenue') {
          validCategoryIdsForType = revenuCategoryIds;
        } else if (effectiveType === 'expense') {
          validCategoryIdsForType = depenseCategoryIds;
        } else {
          // liability/asset: geen categories (of gebruik base categories)
          validCategoryIdsForType = new Set<string>();
        }

        // Nettoyer categories: alleen behouden als ze geldig zijn voor het type
        if (cleanedCode.categories && Array.isArray(cleanedCode.categories)) {
          const seen = new Set<string>();
          const validUniqueCategories: string[] = [];
          for (const cat of cleanedCode.categories) {
            const normalized = cat.toLowerCase();
            // Vérifier: pas de doublon ET ID valide pour ce type
            if (!seen.has(normalized) && validCategoryIdsForType.has(cat)) {
              seen.add(normalized);
              validUniqueCategories.push(cat);
            }
          }
          if (validUniqueCategories.length !== cleanedCode.categories.length) {
            const removedCats = cleanedCode.categories.filter((c: string) => !validUniqueCategories.includes(c));
            if (removedCats.length > 0) {
              logger.debug(`Cleanup: Removed invalid categories from ${codeKey}:`, removedCats);
            }
            cleanedCode.categories = validUniqueCategories.length > 0 ? validUniqueCategories : undefined;
            needsUpdate = true;
          }
        }

        // Si le code personnalisé est maintenant identique au code de base, le supprimer
        if (baseCode) {
          const baseCategories = baseCode.categories || undefined;
          const cleanedCategories = cleanedCode.categories || undefined;
          const isIdentical =
            cleanedCode.label === baseCode.label &&
            cleanedCode.type === baseCode.type &&
            JSON.stringify(cleanedCategories) === JSON.stringify(baseCategories);

          if (isIdentical) {
            logger.debug(`Cleanup: Removing identical customCode for ${codeKey}`);
            removed++;
            continue; // Ne pas ajouter à cleanedCodes
          }
        }

        if (needsUpdate) {
          cleaned++;
        }

        cleanedCodes[codeKey] = cleanedCode;
      }

      // Sauvegarder les codes nettoyés
      if (cleaned > 0 || removed > 0) {
        await this.saveAccountCodesSettings(clubId, cleanedCodes, settings.selectedCodes);
        logger.debug(`Cleanup: ${cleaned} codes nettoyés, ${removed} codes supprimés`);
      }

      return { cleaned, removed };
    } catch (error) {
      logger.error('Erreur lors du nettoyage des codes comptables:', error);
      throw error;
    }
  }

  /**
   * Catégories par défaut
   * Note: Les codes comptables sont maintenant liés via AccountCode.categories[]
   */
  private static getDefaultCategories(): Categorie[] {
    return [
      // ============ REVENUS ============
      // Fréquents
      { id: 'cotisations_revenu', nom: 'Cotisations', type: 'revenu', couleur: '#10b981', isFrequent: true, label_court: 'Coti.' },
      { id: 'sorties_revenu', nom: 'Sorties', type: 'revenu', couleur: '#06b6d4', isFrequent: true, label_court: 'Sort.' },
      // Non-fréquents
      { id: 'boutique_revenu', nom: 'Boutique', type: 'revenu', couleur: '#f97316', isFrequent: false, label_court: 'Bout.' },
      { id: 'evenements_revenu', nom: 'Événements', type: 'revenu', couleur: '#3b82f6', isFrequent: false, label_court: 'Event.' },
      { id: 'subsides', nom: 'Subsides', type: 'revenu', couleur: '#14b8a6', isFrequent: false, label_court: 'Subs.' },
      { id: 'piscine_revenu', nom: 'Piscine', type: 'revenu', couleur: '#0ea5e9', isFrequent: false, label_court: 'Pisc.' },
      { id: 'activites_revenu', nom: 'Activités', type: 'revenu', couleur: '#8b5cf6', isFrequent: false, label_court: 'Activ.' },
      { id: 'frais_bancaires_revenu', nom: 'Intérêts bancaires', type: 'revenu', couleur: '#64748b', isFrequent: false, label_court: 'Int.' },
      { id: 'divers_revenu', nom: 'Divers', type: 'revenu', couleur: '#78716c', isFrequent: false, label_court: 'Div.' },
      { id: 'reports_revenu', nom: 'Reports', type: 'revenu', couleur: '#a3a3a3', isFrequent: false, label_court: 'Rep.' },

      // ============ DÉPENSES ============
      // Fréquents
      { id: 'cotisations_depense', nom: 'Cotisations', type: 'depense', couleur: '#ef4444', isFrequent: true, label_court: 'Coti.' },
      { id: 'sorties_depense', nom: 'Sorties', type: 'depense', couleur: '#0891b2', isFrequent: true, label_court: 'Sort.' },
      { id: 'piscine_depense', nom: 'Piscine', type: 'depense', couleur: '#f59e0b', isFrequent: true, label_court: 'Pisc.' },
      { id: 'materiel', nom: 'Matériel', type: 'depense', couleur: '#dc2626', isFrequent: true, label_court: 'Mat.' },
      // Non-fréquents
      { id: 'boutique_depense', nom: 'Boutique', type: 'depense', couleur: '#ea580c', isFrequent: false, label_court: 'Bout.' },
      { id: 'assurances', nom: 'Assurances', type: 'depense', couleur: '#ec4899', isFrequent: false, label_court: 'Assur.' },
      { id: 'reunions', nom: 'Réunions', type: 'depense', couleur: '#8b5cf6', isFrequent: false, label_court: 'Réun.' },
      { id: 'administration', nom: 'Administration', type: 'depense', couleur: '#6366f1', isFrequent: false, label_court: 'Admin.' },
      { id: 'activites_depense', nom: 'Activités', type: 'depense', couleur: '#7c3aed', isFrequent: false, label_court: 'Activ.' },
      { id: 'formation', nom: 'Formation', type: 'depense', couleur: '#a855f7', isFrequent: false, label_court: 'Form.' },
      { id: 'evenements_depense', nom: 'Événements', type: 'depense', couleur: '#2563eb', isFrequent: false, label_court: 'Event.' },
      { id: 'frais_bancaires_depense', nom: 'Frais bancaires', type: 'depense', couleur: '#64748b', isFrequent: false, label_court: 'Frais' },
      { id: 'divers_depense', nom: 'Divers', type: 'depense', couleur: '#78716c', isFrequent: false, label_court: 'Div.' },
      { id: 'reports_depense', nom: 'Reports', type: 'depense', couleur: '#a3a3a3', isFrequent: false, label_court: 'Rep.' }
    ];
  }

  /**
   * Initialiser les catégories par défaut dans Firebase si aucune n'existe
   */
  static async initializeDefaultCategories(clubId: string): Promise<void> {
    const categories = await this.loadCategories(clubId);

    if (categories.length === 0) {
      const defaultCategories = this.getDefaultCategories();

      for (const category of defaultCategories) {
        await this.saveCategory(clubId, category);
      }

      logger.debug('Catégories par défaut initialisées dans Firebase');
    }
  }

  /**
   * Réinitialiser les catégories aux valeurs par défaut
   * ATTENTION: Cette opération supprime toutes les catégories existantes et les remplace par les valeurs par défaut
   */
  static async resetCategoriesToDefault(clubId: string): Promise<void> {
    try {
      // 1. Supprimer toutes les catégories existantes
      const categoriesRef = collection(db, 'clubs', clubId, 'categories');
      const snapshot = await getDocs(query(categoriesRef));

      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      logger.debug(`${snapshot.docs.length} catégories supprimées`);

      // 2. Ajouter les catégories par défaut
      const defaultCategories = this.getDefaultCategories();
      const savePromises = defaultCategories.map(category =>
        this.saveCategory(clubId, category)
      );
      await Promise.all(savePromises);

      logger.debug(`${defaultCategories.length} catégories par défaut réinitialisées`);
    } catch (error) {
      logger.error('Erreur lors de la réinitialisation des catégories:', error);
      throw error;
    }
  }

  /**
   * Paramètres généraux par défaut
   */
  private static getDefaultGeneralSettings() {
    return {
      doubleApprovalThreshold: 100,
      enableDoubleApproval: true,
      clubName: 'Calypso Diving Club',
      logoUrl: '',
      fiscalYear: new Date().getFullYear(), // DEPRECATED - kept for backward compatibility
      fiscalYearStartDate: new Date(new Date().getFullYear(), 0, 1), // 1er janvier année courante
      fiscalYearEndDate: new Date(new Date().getFullYear(), 11, 31), // 31 décembre
      currency: 'EUR'
    };
  }

  /**
   * Migrer les paramètres généraux vers Firebase
   */
  static async migrateGeneralSettingsToFirebase(clubId: string): Promise<void> {
    const savedSettings = localStorage.getItem('generalSettings');

    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        const settingsRef = doc(db, 'clubs', clubId, 'settings', 'general');
        await setDoc(settingsRef, {
          ...settings,
          updated_at: new Date()
        });

        logger.debug('Paramètres généraux migrés vers Firebase');
      } catch (error) {
        logger.error('Erreur lors de la migration des paramètres généraux:', error);
        throw error;
      }
    }
  }

  /**
   * Charger les paramètres généraux depuis Firebase
   */
  static async loadGeneralSettings(clubId: string): Promise<any> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'general');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        return settingsDoc.data();
      }

      return this.getDefaultGeneralSettings();
    } catch (error) {
      logger.error('Erreur lors du chargement des paramètres généraux:', error);
      return this.getDefaultGeneralSettings();
    }
  }

  /**
   * Sauvegarder les paramètres généraux dans Firebase
   */
  static async saveGeneralSettings(clubId: string, settings: any): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'general');
      await setDoc(settingsRef, {
        ...settings,
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde des paramètres généraux:', error);
      throw error;
    }
  }

  /**
   * Migration complète de tous les paramètres vers Firebase
   */
  static async migrateAllSettings(clubId: string): Promise<void> {
    await this.migrateCategoriesToFirebase(clubId);
    await this.migrateAccountCodesToFirebase(clubId);
    await this.migrateGeneralSettingsToFirebase(clubId);
    logger.debug('Tous les paramètres ont été migrés vers Firebase');
  }

  /**
   * Migrer l'ancien système fiscalYear (number) vers le nouveau système FiscalYear
   * Cette fonction doit être appelée une seule fois lors de la migration
   */
  static async migrateFiscalYearToNewSystem(clubId: string): Promise<void> {
    try {
      const { FiscalYearService } = await import('./fiscalYearService');

      // Charger les paramètres généraux actuels
      const settings = await this.loadGeneralSettings(clubId);

      // Vérifier si l'ancien système est utilisé
      if (settings.fiscalYear && typeof settings.fiscalYear === 'number') {
        const year = settings.fiscalYear;

        logger.debug(`Migration de l'année fiscale ${year} vers le nouveau système...`);

        // Vérifier si une année fiscale existe déjà
        const existingFY = await FiscalYearService.getCurrentFiscalYear(clubId);

        if (!existingFY) {
          // Créer l'année fiscale avec des dates par défaut (année civile)
          const startDate = new Date(year, 0, 1); // 1er janvier
          const endDate = new Date(year, 11, 31); // 31 décembre

          // Calculer les soldes d'ouverture en sommant toutes les transactions avant le début de l'année
          const openingBalances = await this.calculateOpeningBalances(clubId, startDate);

          await FiscalYearService.createFiscalYear(
            clubId,
            year,
            startDate,
            endDate,
            openingBalances,
            undefined, // account_numbers à configurer manuellement
            'migration'
          );

          logger.debug(`Année fiscale ${year} créée avec succès`);
        } else {
          logger.debug('Une année fiscale existe déjà, migration annulée');
        }
      }
    } catch (error) {
      logger.error('Erreur lors de la migration du système fiscal:', error);
      throw error;
    }
  }

  /**
   * Calculer les soldes d'ouverture en sommant toutes les transactions avant une date
   */
  private static async calculateOpeningBalances(
    clubId: string,
    beforeDate: Date
  ): Promise<{ bank_current: number; bank_savings: number }> {
    try {
      const { collection, query, where, getDocs, Timestamp } = await import('firebase/firestore');

      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const q = query(txRef, where('date_execution', '<', Timestamp.fromDate(beforeDate)));
      const snapshot = await getDocs(q);

      let bankCurrent = 0;
      let bankSavings = 0;

      // TODO: Améliorer en filtrant par numero_compte
      // Pour l'instant, on additionne toutes les transactions
      snapshot.docs.forEach(doc => {
        const tx = doc.data();
        bankCurrent += tx.montant || 0;
      });

      return { bank_current: bankCurrent, bank_savings: bankSavings };
    } catch (error) {
      logger.error('Erreur lors du calcul des soldes d\'ouverture:', error);
      return { bank_current: 0, bank_savings: 0 };
    }
  }

  /**
   * Charger les paramètres de sécurité depuis Firebase
   */
  static async loadSecuritySettings(clubId: string): Promise<SecuritySettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'security');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        return settingsDoc.data() as SecuritySettings;
      }

      // Retourner les paramètres par défaut si aucun n'existe
      return DEFAULT_SECURITY_SETTINGS;
    } catch (error) {
      logger.error('Erreur lors du chargement des paramètres de sécurité:', error);
      return DEFAULT_SECURITY_SETTINGS;
    }
  }

  /**
   * Sauvegarder les paramètres de sécurité dans Firebase
   */
  static async saveSecuritySettings(
    clubId: string,
    settings: SecuritySettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'security');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Paramètres de sécurité sauvegardés');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des paramètres de sécurité:', error);
      throw error;
    }
  }

  /**
   * Charger les paramètres de téléchargement depuis Firebase
   */
  static async loadDownloadSettings(clubId: string): Promise<DownloadSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'downloads');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        // Merge avec les defaults pour ajouter les nouveaux champs manquants
        return {
          ...DEFAULT_DOWNLOAD_SETTINGS,
          ...settingsDoc.data()
        } as DownloadSettings;
      }

      // Retourner les paramètres par défaut si aucun n'existe
      return DEFAULT_DOWNLOAD_SETTINGS;
    } catch (error) {
      logger.error('Erreur lors du chargement des paramètres de téléchargement:', error);
      return DEFAULT_DOWNLOAD_SETTINGS;
    }
  }

  /**
   * Sauvegarder les paramètres de téléchargement dans Firebase
   */
  static async saveDownloadSettings(
    clubId: string,
    settings: DownloadSettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'downloads');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Paramètres de téléchargement sauvegardés');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des paramètres de téléchargement:', error);
      throw error;
    }
  }

  /**
   * Charger les clés API IA depuis Firebase
   */
  static async loadAIApiKeys(clubId: string): Promise<{
    openaiKey: string;
    anthropicKey: string;
  }> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'ai_api_keys');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          openaiKey: data.openaiKey || '',
          anthropicKey: data.anthropicKey || ''
        };
      }

      return { openaiKey: '', anthropicKey: '' };
    } catch (error) {
      logger.error('Erreur lors du chargement des clés API IA:', error);
      return { openaiKey: '', anthropicKey: '' };
    }
  }

  /**
   * Charger la configuration Google Mail depuis Firebase
   */
  static async loadGoogleMailConfig(clubId: string): Promise<{
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    fromEmail: string;
    fromName: string;
  }> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'google_mail');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          clientId: data.clientId || '',
          clientSecret: data.clientSecret || '',
          refreshToken: data.refreshToken || '',
          fromEmail: data.fromEmail || '',
          fromName: data.fromName || ''
        };
      }

      return {
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        fromEmail: '',
        fromName: ''
      };
    } catch (error) {
      logger.error('Erreur lors du chargement de la configuration Google Mail:', error);
      return {
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        fromEmail: '',
        fromName: ''
      };
    }
  }

  /**
   * Sauvegarder les clés API IA dans Firebase
   */
  static async saveAIApiKeys(
    clubId: string,
    openaiKey: string,
    anthropicKey: string,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'ai_api_keys');
      await setDoc(settingsRef, {
        openaiKey: openaiKey || '',
        anthropicKey: anthropicKey || '',
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Clés API IA sauvegardées dans Firebase');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des clés API IA:', error);
      throw error;
    }
  }

  /**
   * Sauvegarder la configuration Google Mail dans Firebase
   */
  static async saveGoogleMailConfig(
    clubId: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    fromEmail: string,
    fromName: string,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'google_mail');
      await setDoc(settingsRef, {
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        refreshToken: refreshToken || '',
        fromEmail: fromEmail || '',
        fromName: fromName || '',
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Configuration Google Mail sauvegardée dans Firebase');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de la configuration Google Mail:', error);
      throw error;
    }
  }

  /**
   * Charger la configuration Email (Resend + Gmail + Provider) depuis Firebase
   */
  static async loadEmailConfig(clubId: string): Promise<EmailConfig> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'email_config');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        const data = settingsDoc.data();
        return {
          provider: data.provider || 'resend',
          resend: {
            apiKey: data.resend?.apiKey || '',
            fromEmail: data.resend?.fromEmail || 'onboarding@resend.dev',
            fromName: data.resend?.fromName || 'Calypso Diving Club',
          },
          gmail: {
            clientId: data.gmail?.clientId || '',
            clientSecret: data.gmail?.clientSecret || '',
            refreshToken: data.gmail?.refreshToken || '',
            fromEmail: data.gmail?.fromEmail || 'noreply@calypso-diving.be',
            fromName: data.gmail?.fromName || 'Calypso Diving Club',
          },
        };
      }

      // Default configuration (Resend)
      return {
        provider: 'resend',
        resend: {
          apiKey: '',
          fromEmail: 'onboarding@resend.dev',
          fromName: 'Calypso Diving Club',
        },
        gmail: {
          clientId: '',
          clientSecret: '',
          refreshToken: '',
          fromEmail: 'noreply@calypso-diving.be',
          fromName: 'Calypso Diving Club',
        },
      };
    } catch (error) {
      logger.error('Erreur lors du chargement de la configuration Email:', error);
      return {
        provider: 'resend',
        resend: {
          apiKey: '',
          fromEmail: 'onboarding@resend.dev',
          fromName: 'Calypso Diving Club',
        },
        gmail: {
          clientId: '',
          clientSecret: '',
          refreshToken: '',
          fromEmail: 'noreply@calypso-diving.be',
          fromName: 'Calypso Diving Club',
        },
      };
    }
  }

  /**
   * Sauvegarder la configuration Email (Resend + Gmail + Provider) dans Firebase
   */
  static async saveEmailConfig(
    clubId: string,
    config: {
      provider: 'gmail' | 'resend';
      resend: {
        apiKey: string;
        fromEmail: string;
        fromName: string;
      };
      gmail: {
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        fromEmail: string;
        fromName: string;
      };
    },
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'email_config');
      await setDoc(settingsRef, {
        provider: config.provider,
        resend: {
          apiKey: config.resend.apiKey || '',
          fromEmail: config.resend.fromEmail || 'onboarding@resend.dev',
          fromName: config.resend.fromName || 'Calypso Diving Club',
        },
        gmail: {
          clientId: config.gmail.clientId || '',
          clientSecret: config.gmail.clientSecret || '',
          refreshToken: config.gmail.refreshToken || '',
          fromEmail: config.gmail.fromEmail || 'noreply@calypso-diving.be',
          fromName: config.gmail.fromName || 'Calypso Diving Club',
        },
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Configuration Email sauvegardée dans Firebase');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de la configuration Email:', error);
      throw error;
    }
  }


  /**
   * Charger les paramètres de communication depuis Firebase
   */
  static async loadCommunicationSettings(clubId: string): Promise<CommunicationSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'communication');
      const docSnap = await getDoc(settingsRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        // Convert Firestore Timestamps to Dates
        return {
          ...data,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
          jobs: data.jobs?.map((job: any) => ({
            ...job,
            emailType: normalizeCommunicationEmailType(job.emailType),
            createdAt: job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt),
            updatedAt: job.updatedAt?.toDate ? job.updatedAt.toDate() : new Date(job.updatedAt),
            lastRun: job.lastRun?.toDate ? job.lastRun.toDate() : job.lastRun ? new Date(job.lastRun) : undefined,
          })) || [],
        } as CommunicationSettings;
      }

      // Si pas de settings, retourner les valeurs par défaut
      logger.debug('📧 Aucun paramètre de communication trouvé, utilisation des valeurs par défaut');
      return DEFAULT_COMMUNICATION_SETTINGS;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des paramètres de communication:', error);
      return DEFAULT_COMMUNICATION_SETTINGS;
    }
  }

  /**
   * Sauvegarder les paramètres de communication dans Firebase
   */
  static async saveCommunicationSettings(
    clubId: string,
    settings: CommunicationSettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'communication');

      // Prepare data for Firestore (convert Dates to Timestamps and remove undefined values)
      const now = Timestamp.now();

      // Helper function to remove undefined values from object
      const removeUndefined = (obj: any): any => {
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            cleaned[key] = obj[key];
          }
        });
        return cleaned;
      };

      const firestoreData = removeUndefined({
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown',
        jobs: settings.jobs.map(job => removeUndefined({
          ...job,
          emailType: normalizeCommunicationEmailType(job.emailType),
          createdAt: job.createdAt instanceof Date ? Timestamp.fromDate(job.createdAt) : job.createdAt,
          updatedAt: now, // Use Timestamp.now() instead of serverTimestamp() in arrays
          lastRun: job.lastRun instanceof Date ? Timestamp.fromDate(job.lastRun) : (job.lastRun || null),
        })),
      });

      await setDoc(settingsRef, firestoreData);
      logger.debug('✅ Paramètres de communication sauvegardés dans Firebase');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des paramètres de communication:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour la dernière exécution d'un job de communication
   */
  static async updateJobLastRun(
    clubId: string,
    jobId: string,
    success: boolean
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'communication');
      const docSnap = await getDoc(settingsRef);

      if (docSnap.exists()) {
        const settings = docSnap.data() as CommunicationSettings;
        const now = Timestamp.now();
        const updatedJobs = settings.jobs.map(job => {
          if (job.id === jobId) {
            return {
              ...job,
              lastRun: now, // Use Timestamp.now() instead of serverTimestamp() in arrays
              lastRunSuccess: success,
            };
          }
          return job;
        });

        await updateDoc(settingsRef, { jobs: updatedJobs });
        logger.debug(`✅ Job ${jobId} dernière exécution mise à jour (success: ${success})`);
      }
    } catch (error) {
      logger.error('❌ Erreur lors de la mise à jour de la dernière exécution:', error);
      throw error;
    }
  }

  /**
   * Haal compatibility settings op voor een club
   */
  static async getCompatibilitySettings(clubId: string): Promise<CompatibilitySettings | null> {
    try {
      const docRef = doc(db, 'clubs', clubId, 'settings', 'compatibility');
      const snapshot = await getDoc(docRef);
      return snapshot.exists() ? snapshot.data() as CompatibilitySettings : null;
    } catch (error) {
      logger.error('Error fetching compatibility settings:', error);
      return null;
    }
  }

  /**
   * Sla compatibility settings op voor een club
   */
  static async saveCompatibilitySettings(
    clubId: string,
    settings: CompatibilitySettings,
    userId: string
  ): Promise<void> {
    const docRef = doc(db, 'clubs', clubId, 'settings', 'compatibility');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  }

  // ============================================
  // SMS Settings (Twilio Integration)
  // ============================================

  /**
   * Charger les paramètres SMS depuis Firebase
   */
  static async loadSMSSettings(clubId: string): Promise<SMSSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'sms');
      const docSnap = await getDoc(settingsRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        // Convert Firestore Timestamps to Dates
        return {
          ...DEFAULT_SMS_SETTINGS,
          ...data,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
          jobs: data.jobs?.map((job: any) => ({
            ...job,
            createdAt: job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt),
            updatedAt: job.updatedAt?.toDate ? job.updatedAt.toDate() : new Date(job.updatedAt),
            lastRun: job.lastRun?.toDate ? job.lastRun.toDate() : job.lastRun ? new Date(job.lastRun) : undefined,
          })) || [],
        } as SMSSettings;
      }

      logger.debug('📱 Aucun paramètre SMS trouvé, utilisation des valeurs par défaut');
      return DEFAULT_SMS_SETTINGS;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des paramètres SMS:', error);
      return DEFAULT_SMS_SETTINGS;
    }
  }

  /**
   * Sauvegarder les paramètres SMS dans Firebase
   */
  static async saveSMSSettings(
    clubId: string,
    settings: SMSSettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'sms');
      const now = Timestamp.now();

      // Helper function to remove undefined values from object
      const removeUndefined = (obj: any): any => {
        const cleaned: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            cleaned[key] = obj[key];
          }
        });
        return cleaned;
      };

      const firestoreData = removeUndefined({
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown',
        jobs: settings.jobs.map(job => removeUndefined({
          ...job,
          createdAt: job.createdAt instanceof Date ? Timestamp.fromDate(job.createdAt) : job.createdAt,
          updatedAt: now,
          lastRun: job.lastRun instanceof Date ? Timestamp.fromDate(job.lastRun) : (job.lastRun || null),
        })),
      });

      await setDoc(settingsRef, firestoreData);
      logger.debug('✅ Paramètres SMS sauvegardés dans Firebase');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des paramètres SMS:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour la dernière exécution d'un job SMS
   */
  static async updateSMSJobLastRun(
    clubId: string,
    jobId: string,
    success: boolean
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'sms');
      const docSnap = await getDoc(settingsRef);

      if (docSnap.exists()) {
        const settings = docSnap.data() as SMSSettings;
        const now = Timestamp.now();
        const updatedJobs = settings.jobs.map(job => {
          if (job.id === jobId) {
            return {
              ...job,
              lastRun: now,
              lastRunSuccess: success,
            };
          }
          return job;
        });

        await updateDoc(settingsRef, { jobs: updatedJobs });
        logger.debug(`✅ Job SMS ${jobId} dernière exécution mise à jour (success: ${success})`);
      }
    } catch (error) {
      logger.error('❌ Erreur lors de la mise à jour de la dernière exécution SMS:', error);
      throw error;
    }
  }

  /**
   * Sauvegarder un historique d'envoi SMS
   */
  static async saveSMSHistory(clubId: string, smsHistory: Omit<SMSHistory, 'id'>): Promise<string> {
    try {
      const historyRef = collection(db, 'clubs', clubId, 'sms_history');
      const docRef = doc(historyRef);

      await setDoc(docRef, {
        ...smsHistory,
        createdAt: serverTimestamp(),
        sentAt: smsHistory.sentAt ? Timestamp.fromDate(smsHistory.sentAt) : null,
        deliveredAt: smsHistory.deliveredAt ? Timestamp.fromDate(smsHistory.deliveredAt) : null,
      });

      logger.debug(`✅ SMS history saved: ${docRef.id}`);
      return docRef.id;
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de l\'historique SMS:', error);
      throw error;
    }
  }

  /**
   * Charger l'historique des SMS
   */
  static async loadSMSHistory(
    clubId: string,
    limitCount: number = 50
  ): Promise<SMSHistory[]> {
    try {
      const { orderBy, limit } = await import('firebase/firestore');
      const historyRef = collection(db, 'clubs', clubId, 'sms_history');
      const q = query(historyRef, orderBy('createdAt', 'desc'), limit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
          sentAt: data.sentAt?.toDate ? data.sentAt.toDate() : undefined,
          deliveredAt: data.deliveredAt?.toDate ? data.deliveredAt.toDate() : undefined,
        } as SMSHistory;
      });
    } catch (error) {
      logger.error('❌ Erreur lors du chargement de l\'historique SMS:', error);
      return [];
    }
  }

  /**
   * Charger les préférences SMS d'un membre
   */
  static async loadMemberSMSPreferences(
    clubId: string,
    memberId: string
  ): Promise<MemberSMSPreferences | null> {
    try {
      const prefsRef = doc(db, 'clubs', clubId, 'members', memberId, 'preferences', 'sms');
      const docSnap = await getDoc(prefsRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          ...data,
          memberId,
          smsOptInDate: data.smsOptInDate?.toDate ? data.smsOptInDate.toDate() : undefined,
          smsOptOutDate: data.smsOptOutDate?.toDate ? data.smsOptOutDate.toDate() : undefined,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        } as MemberSMSPreferences;
      }

      return null;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des préférences SMS du membre:', error);
      return null;
    }
  }

  /**
   * Sauvegarder les préférences SMS d'un membre
   */
  static async saveMemberSMSPreferences(
    clubId: string,
    memberId: string,
    preferences: Partial<MemberSMSPreferences>
  ): Promise<void> {
    try {
      const prefsRef = doc(db, 'clubs', clubId, 'members', memberId, 'preferences', 'sms');

      await setDoc(prefsRef, {
        ...preferences,
        memberId,
        updatedAt: serverTimestamp(),
        smsOptInDate: preferences.smsOptInDate ? Timestamp.fromDate(preferences.smsOptInDate) : null,
        smsOptOutDate: preferences.smsOptOutDate ? Timestamp.fromDate(preferences.smsOptOutDate) : null,
      }, { merge: true });

      logger.debug(`✅ Préférences SMS du membre ${memberId} sauvegardées`);
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des préférences SMS:', error);
      throw error;
    }
  }

  /**
   * Vérifier le quota SMS quotidien
   */
  static async checkSMSQuota(clubId: string): Promise<{
    used: number;
    limit: number;
    remaining: number;
    canSend: boolean;
  }> {
    try {
      // Charger les paramètres SMS pour obtenir la limite
      const settings = await this.loadSMSSettings(clubId);
      const dailyLimit = settings.maxSmsPerDay || 100;

      // Compter les SMS envoyés aujourd'hui
      const { where, Timestamp: FsTimestamp } = await import('firebase/firestore');
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const historyRef = collection(db, 'clubs', clubId, 'sms_history');
      const q = query(
        historyRef,
        where('createdAt', '>=', FsTimestamp.fromDate(today))
      );
      const snapshot = await getDocs(q);
      const usedToday = snapshot.size;

      return {
        used: usedToday,
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - usedToday),
        canSend: usedToday < dailyLimit,
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la vérification du quota SMS:', error);
      return {
        used: 0,
        limit: 100,
        remaining: 100,
        canSend: true,
      };
    }
  }

  /**
   * Obtenir les membres avec des numéros de téléphone vérifiés
   */
  static async getMembersWithVerifiedPhones(
    clubId: string,
    roles?: ('superadmin' | 'admin' | 'validateur' | 'user')[]
  ): Promise<Array<{ id: string; name: string; phone: string; role: string }>> {
    try {
      const membersRef = collection(db, 'clubs', clubId, 'members');
      const snapshot = await getDocs(membersRef);

      const members: Array<{ id: string; name: string; phone: string; role: string }> = [];

      for (const memberDoc of snapshot.docs) {
        const data = memberDoc.data();

        // Vérifier le rôle si spécifié
        const memberRole = data.app_role || 'user';
        if (roles && roles.length > 0 && !roles.includes(memberRole)) {
          continue;
        }

        // Vérifier si le membre a un numéro de téléphone
        const phone = data.telephone || data.phone;
        if (!phone) continue;

        // Vérifier le statut actif
        const isActive = data.isActive === true ||
                        data.app_status === 'active' ||
                        data.status === 'active';
        if (!isActive) continue;

        members.push({
          id: memberDoc.id,
          name: `${data.prenom || ''} ${data.nom || ''}`.trim(),
          phone,
          role: memberRole,
        });
      }

      return members;
    } catch (error) {
      logger.error('❌ Erreur lors de la récupération des membres avec téléphone:', error);
      return [];
    }
  }

  // ============================================
  // SMS Templates CRUD
  // ============================================

  /**
   * Charger les templates SMS depuis Firebase
   * @param clubId ID du club
   * @param context Optionnel: filtrer par contexte
   */
  static async loadSMSTemplates(
    clubId: string,
    context?: string
  ): Promise<SMSTemplate[]> {
    try {
      const templatesRef = collection(db, 'clubs', clubId, 'sms_templates');
      let q;

      if (context) {
        const { where } = await import('firebase/firestore');
        q = query(templatesRef, where('context', '==', context));
      } else {
        q = query(templatesRef);
      }

      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        } as SMSTemplate;
      });
    } catch (error) {
      logger.error('❌ Erreur lors du chargement des templates SMS:', error);
      return [];
    }
  }

  /**
   * Sauvegarder un template SMS
   * @param clubId ID du club
   * @param template Template à sauvegarder
   * @returns ID du template
   */
  static async saveSMSTemplate(
    clubId: string,
    template: Partial<SMSTemplate>,
    userId?: string
  ): Promise<string> {
    try {
      const templatesRef = collection(db, 'clubs', clubId, 'sms_templates');

      // Si c'est un nouveau template (pas d'ID)
      if (!template.id) {
        const newDocRef = doc(templatesRef);

        const templateData = {
          ...template,
          id: newDocRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: userId || 'unknown',
          isActive: template.isActive ?? true,
          isDefault: template.isDefault ?? false,
        };

        // Si c'est le default, désactiver les autres defaults pour ce contexte
        if (template.isDefault && template.context) {
          await this.clearDefaultTemplateForContext(clubId, template.context);
        }

        await setDoc(newDocRef, templateData);
        logger.debug(`✅ Template SMS créé: ${newDocRef.id}`);
        return newDocRef.id;
      }

      // Mise à jour d'un template existant
      const templateRef = doc(db, 'clubs', clubId, 'sms_templates', template.id);

      // Si c'est le default, désactiver les autres defaults pour ce contexte
      if (template.isDefault && template.context) {
        await this.clearDefaultTemplateForContext(clubId, template.context, template.id);
      }

      await updateDoc(templateRef, {
        ...template,
        updatedAt: serverTimestamp(),
      });

      logger.debug(`✅ Template SMS mis à jour: ${template.id}`);
      return template.id;
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde du template SMS:', error);
      throw error;
    }
  }

  /**
   * Supprimer un template SMS
   */
  static async deleteSMSTemplate(clubId: string, templateId: string): Promise<void> {
    try {
      const templateRef = doc(db, 'clubs', clubId, 'sms_templates', templateId);
      await deleteDoc(templateRef);
      logger.debug(`✅ Template SMS supprimé: ${templateId}`);
    } catch (error) {
      logger.error('❌ Erreur lors de la suppression du template SMS:', error);
      throw error;
    }
  }

  /**
   * Obtenir le template par défaut pour un contexte
   */
  static async getDefaultSMSTemplate(
    clubId: string,
    context: string
  ): Promise<SMSTemplate | null> {
    try {
      const { where } = await import('firebase/firestore');
      const templatesRef = collection(db, 'clubs', clubId, 'sms_templates');
      const q = query(
        templatesRef,
        where('context', '==', context),
        where('isDefault', '==', true)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      const doc = snapshot.docs[0];
      const data = doc.data();

      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
      } as SMSTemplate;
    } catch (error) {
      logger.error('❌ Erreur lors du chargement du template par défaut:', error);
      return null;
    }
  }

  /**
   * Désactiver le flag isDefault pour tous les templates d'un contexte
   * (sauf celui spécifié par excludeId)
   */
  private static async clearDefaultTemplateForContext(
    clubId: string,
    context: string,
    excludeId?: string
  ): Promise<void> {
    try {
      const { where } = await import('firebase/firestore');
      const templatesRef = collection(db, 'clubs', clubId, 'sms_templates');
      const q = query(
        templatesRef,
        where('context', '==', context),
        where('isDefault', '==', true)
      );

      const snapshot = await getDocs(q);

      const updatePromises = snapshot.docs
        .filter(doc => doc.id !== excludeId)
        .map(doc => updateDoc(doc.ref, { isDefault: false }));

      await Promise.all(updatePromises);
    } catch (error) {
      logger.error('❌ Erreur lors de la mise à jour des templates par défaut:', error);
    }
  }

  /**
   * Initialiser les templates par défaut pour un club
   * (si aucun template n'existe pour un contexte)
   */
  static async initializeDefaultSMSTemplates(clubId: string, userId?: string): Promise<void> {
    try {
      const { DEFAULT_CONTEXT_TEMPLATES } = await import('@/types/sms');

      for (const [context, templates] of Object.entries(DEFAULT_CONTEXT_TEMPLATES)) {
        // Vérifier si des templates existent déjà pour ce contexte
        const existing = await this.loadSMSTemplates(clubId, context);

        if (existing.length === 0) {
          // Créer les templates par défaut
          for (const template of templates) {
            await this.saveSMSTemplate(clubId, template, userId);
          }
          logger.debug(`✅ Templates par défaut créés pour le contexte: ${context}`);
        }
      }
    } catch (error) {
      logger.error('❌ Erreur lors de l\'initialisation des templates par défaut:', error);
    }
  }

  // ==========================================================================
  // CATEGORIZATION SETTINGS (Confidence Thresholds)
  // ==========================================================================

  /**
   * Charger les paramètres de catégorisation depuis Firebase
   */
  static async loadCategorizationSettings(clubId: string): Promise<CategorizationSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'categorization');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        // Merge avec les defaults pour ajouter les nouveaux champs manquants
        return {
          ...DEFAULT_CATEGORIZATION_SETTINGS,
          ...settingsDoc.data()
        } as CategorizationSettings;
      }

      // Retourner les paramètres par défaut si aucun n'existe
      return DEFAULT_CATEGORIZATION_SETTINGS;
    } catch (error) {
      logger.error('Erreur lors du chargement des paramètres de catégorisation:', error);
      return DEFAULT_CATEGORIZATION_SETTINGS;
    }
  }

  /**
   * Sauvegarder les paramètres de catégorisation dans Firebase
   */
  static async saveCategorizationSettings(
    clubId: string,
    settings: CategorizationSettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'categorization');
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown'
      });

      logger.debug('✅ Paramètres de catégorisation sauvegardés');
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde des paramètres de catégorisation:', error);
      throw error;
    }
  }

  // ============================================================================
  // KNOWN IBANS - IBANs connus pour catégorisation automatique
  // ============================================================================

  /**
   * Charger tous les IBANs connus
   */
  static async loadKnownIbans(clubId: string): Promise<import('@/types/settings.types').KnownIban[]> {
    try {
      const ibansRef = collection(db, 'clubs', clubId, 'known_ibans');
      const snapshot = await getDocs(ibansRef);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as import('@/types/settings.types').KnownIban[];
    } catch (error) {
      logger.error('Erreur lors du chargement des IBANs connus:', error);
      return [];
    }
  }

  /**
   * Chercher un IBAN connu par son numéro
   */
  static async findKnownIban(clubId: string, iban: string): Promise<import('@/types/settings.types').KnownIban | null> {
    try {
      // Normaliser l'IBAN (majuscules, sans espaces)
      const normalizedIban = iban.replace(/\s/g, '').toUpperCase();

      const ibansRef = collection(db, 'clubs', clubId, 'known_ibans');
      const snapshot = await getDocs(ibansRef);

      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.iban === normalizedIban) {
          return { id: doc.id, ...data } as import('@/types/settings.types').KnownIban;
        }
      }

      return null;
    } catch (error) {
      logger.error('Erreur lors de la recherche de l\'IBAN:', error);
      return null;
    }
  }

  /**
   * Ajouter ou mettre à jour un IBAN connu
   */
  static async saveKnownIban(
    clubId: string,
    knownIban: Omit<import('@/types/settings.types').KnownIban, 'id' | 'createdAt' | 'updatedAt'>,
    userId?: string
  ): Promise<string> {
    try {
      // Normaliser l'IBAN
      const normalizedIban = knownIban.iban.replace(/\s/g, '').toUpperCase();

      // Vérifier si l'IBAN existe déjà
      const existing = await this.findKnownIban(clubId, normalizedIban);

      if (existing?.id) {
        // Mise à jour
        const ibanRef = doc(db, 'clubs', clubId, 'known_ibans', existing.id);
        await updateDoc(ibanRef, {
          ...knownIban,
          iban: normalizedIban,
          updatedAt: serverTimestamp()
        });
        logger.debug(`✅ IBAN mis à jour: ${normalizedIban}`);
        return existing.id;
      } else {
        // Création
        const ibanId = `iban_${normalizedIban.substring(0, 4)}_${Date.now()}`;
        const ibanRef = doc(db, 'clubs', clubId, 'known_ibans', ibanId);
        await setDoc(ibanRef, {
          ...knownIban,
          iban: normalizedIban,
          createdBy: userId || 'unknown',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        logger.debug(`✅ IBAN ajouté: ${normalizedIban}`);
        return ibanId;
      }
    } catch (error) {
      logger.error('❌ Erreur lors de la sauvegarde de l\'IBAN:', error);
      throw error;
    }
  }

  /**
   * Supprimer un IBAN connu
   */
  static async deleteKnownIban(clubId: string, ibanId: string): Promise<void> {
    try {
      const ibanRef = doc(db, 'clubs', clubId, 'known_ibans', ibanId);
      await deleteDoc(ibanRef);
      logger.debug(`✅ IBAN supprimé: ${ibanId}`);
    } catch (error) {
      logger.error('❌ Erreur lors de la suppression de l\'IBAN:', error);
      throw error;
    }
  }

  /**
   * Incrémenter le compteur de transactions pour un IBAN connu
   */
  static async incrementIbanTransactionCount(clubId: string, ibanId: string): Promise<void> {
    try {
      const ibanRef = doc(db, 'clubs', clubId, 'known_ibans', ibanId);
      const ibanDoc = await getDoc(ibanRef);

      if (ibanDoc.exists()) {
        const currentCount = ibanDoc.data().transactionCount || 0;
        await updateDoc(ibanRef, {
          transactionCount: currentCount + 1,
          lastSeen: serverTimestamp()
        });
      }
    } catch (error) {
      logger.error('Erreur lors de l\'incrémentation du compteur:', error);
    }
  }

  // ============================================================================
  // CATEGORIZATION STATS - Dashboard statistics
  // ============================================================================

  // ============================================================================
  // LIFRAS RULES SETTINGS — Règles de composition des palanquées (MIL 2026)
  // ============================================================================

  /**
   * Charger les règles LIFRAS depuis Firebase
   */
  static async loadLifrasRules(clubId: string): Promise<LifrasRulesSettings> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'lifras_rules');
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        // Merge met defaults zodat nieuwe velden automatisch beschikbaar zijn
        const data = settingsDoc.data();
        return {
          ...DEFAULT_LIFRAS_RULES,
          ...data,
          nbRules: { ...DEFAULT_LIFRAS_RULES.nbRules, ...data.nbRules },
          oneStarRules: { ...DEFAULT_LIFRAS_RULES.oneStarRules, ...data.oneStarRules },
          twoStarRules: { ...DEFAULT_LIFRAS_RULES.twoStarRules, ...data.twoStarRules },
          zealandRules: { ...DEFAULT_LIFRAS_RULES.zealandRules, ...data.zealandRules },
          depthRecommendations: { ...DEFAULT_LIFRAS_RULES.depthRecommendations, ...data.depthRecommendations },
          depthMatrix: data.depthMatrix || DEFAULT_LIFRAS_RULES.depthMatrix,
        } as LifrasRulesSettings;
      }

      return { ...DEFAULT_LIFRAS_RULES } as LifrasRulesSettings;
    } catch (error) {
      logger.error('Erreur lors du chargement des règles LIFRAS:', error);
      return { ...DEFAULT_LIFRAS_RULES } as LifrasRulesSettings;
    }
  }

  /**
   * Sauvegarder les règles LIFRAS dans Firebase
   */
  static async saveLifrasRules(
    clubId: string,
    rules: LifrasRulesSettings,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'lifras_rules');
      await setDoc(settingsRef, {
        ...rules,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown',
      });
      logger.debug('Règles LIFRAS sauvegardées dans Firebase');
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde des règles LIFRAS:', error);
      throw error;
    }
  }

  /**
   * Réinitialiser les règles LIFRAS aux valeurs par défaut MIL 2026
   */
  static async resetLifrasRulesToDefault(
    clubId: string,
    updatedBy?: string
  ): Promise<void> {
    try {
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'lifras_rules');
      await setDoc(settingsRef, {
        ...DEFAULT_LIFRAS_RULES,
        updatedAt: serverTimestamp(),
        updatedBy: updatedBy || 'unknown',
      });
      logger.debug('Règles LIFRAS réinitialisées aux valeurs MIL 2026');
    } catch (error) {
      logger.error('Erreur lors de la réinitialisation des règles LIFRAS:', error);
      throw error;
    }
  }

  /**
   * Interface pour les statistiques de catégorisation
   */
  static async loadCategorizationStats(clubId: string): Promise<{
    totalPatterns: number;
    patternsByType: { iban: number; keyword: number; counterparty: number };
    knownIbans: number;
    antiPatterns: number;
    topPatterns: { keyword: string; code: string; useCount: number }[];
    recentCorrections: { from: string; to: string; count: number }[];
    activeSeasonalBoosts: string[];
  }> {
    try {
      const { orderBy, limit } = await import('firebase/firestore');

      // 1. Charger les patterns de catégorisation
      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
      const patternsSnapshot = await getDocs(patternsRef);

      let totalPatterns = 0;
      const patternsByType = { iban: 0, keyword: 0, counterparty: 0 };
      const patternUsage: { keyword: string; code: string; useCount: number }[] = [];

      patternsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        totalPatterns++;

        // Compter par type
        if (data.pattern_type === 'iban') {
          patternsByType.iban++;
        } else if (data.pattern_type === 'keyword') {
          patternsByType.keyword++;
        } else if (data.pattern_type === 'counterparty') {
          patternsByType.counterparty++;
        }

        // Collecter pour top patterns
        if (data.use_count && data.use_count > 1) {
          const keyword = data.primary_keyword || data.contrepartie_normalized || data.iban?.substring(0, 8) || 'unknown';
          patternUsage.push({
            keyword,
            code: data.code_comptable || '',
            useCount: data.use_count
          });
        }
      });

      // Trier et garder les top 5 patterns
      const topPatterns = patternUsage
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, 5);

      // 2. Charger les IBANs connus
      const ibansRef = collection(db, 'clubs', clubId, 'known_ibans');
      const ibansSnapshot = await getDocs(ibansRef);
      const knownIbans = ibansSnapshot.size;

      // 3. Charger les anti-patterns
      const antiPatternsRef = collection(db, 'clubs', clubId, 'anti_patterns');
      const antiPatternsSnapshot = await getDocs(antiPatternsRef);
      const antiPatterns = antiPatternsSnapshot.size;

      // 4. Analyser les corrections récentes (depuis anti_patterns)
      const correctionMap = new Map<string, number>();
      antiPatternsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.wrong_code && data.correct_code) {
          const key = `${data.wrong_code}→${data.correct_code}`;
          correctionMap.set(key, (correctionMap.get(key) || 0) + (data.correction_count || 1));
        }
      });

      const recentCorrections = Array.from(correctionMap.entries())
        .map(([key, count]) => {
          const [from, to] = key.split('→');
          return { from, to, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

      // 5. Déterminer les boosts saisonniers actifs
      const currentMonth = new Date().getMonth() + 1; // 1-12
      const activeSeasonalBoosts: string[] = [];

      // Cotisations: jan-fév, sept-oct
      if ([1, 2, 9, 10].includes(currentMonth)) {
        activeSeasonalBoosts.push('Cotisations');
      }
      // Sorties: juin-août
      if ([6, 7, 8].includes(currentMonth)) {
        activeSeasonalBoosts.push('Sorties plongée');
      }
      // Événements: nov-déc
      if ([11, 12].includes(currentMonth)) {
        activeSeasonalBoosts.push('Événements');
      }
      // Piscine: sept-mai
      if ([9, 10, 11, 12, 1, 2, 3, 4, 5].includes(currentMonth)) {
        activeSeasonalBoosts.push('Piscine');
      }

      return {
        totalPatterns,
        patternsByType,
        knownIbans,
        antiPatterns,
        topPatterns,
        recentCorrections,
        activeSeasonalBoosts
      };
    } catch (error) {
      logger.error('Erreur lors du chargement des statistiques de catégorisation:', error);
      return {
        totalPatterns: 0,
        patternsByType: { iban: 0, keyword: 0, counterparty: 0 },
        knownIbans: 0,
        antiPatterns: 0,
        topPatterns: [],
        recentCorrections: [],
        activeSeasonalBoosts: []
      };
    }
  }
}
