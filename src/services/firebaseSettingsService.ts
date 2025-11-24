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
import { SecuritySettings, DEFAULT_SECURITY_SETTINGS, DownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } from '@/types/settings.types';
import { CommunicationSettings, DEFAULT_COMMUNICATION_SETTINGS } from '@/types/communication';

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

        console.log(`${categories.length} catégories migrées vers Firebase`);
      } catch (error) {
        console.error('Erreur lors de la migration des catégories:', error);
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
      console.error('Erreur lors du chargement des catégories:', error);
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
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la catégorie:', error);
      throw error;
    }
  }

  /**
   * Supprimer une catégorie de Firebase
   */
  static async deleteCategory(clubId: string, categoryId: string): Promise<void> {
    try {
      const categoryRef = doc(db, 'clubs', clubId, 'categories', categoryId);
      await deleteDoc(categoryRef);
    } catch (error) {
      console.error('Erreur lors de la suppression de la catégorie:', error);
      throw error;
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

        console.log('Codes comptables migrés vers Firebase');
      } catch (error) {
        console.error('Erreur lors de la migration des codes comptables:', error);
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
      console.error('Erreur lors du chargement des codes comptables:', error);
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
      const settingsRef = doc(db, 'clubs', clubId, 'settings', 'accounting');
      await setDoc(settingsRef, {
        customAccountCodes: customCodes,
        selectedAccountCodes: selectedCodes,
        updated_at: new Date()
      }, { merge: true });
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des codes comptables:', error);
      throw error;
    }
  }

  /**
   * Catégories par défaut
   * IMPORTANT: Ces catégories doivent être synchronisées avec DEFAULT_CATEGORIES dans categorizationService.ts
   * Elles sont utilisées pour initialiser Firebase et le cache local
   */
  private static getDefaultCategories(): Categorie[] {
    return [
      // REVENUS (fréquents en premier)
      { id: 'cotisation', nom: 'Cotisations', type: 'revenu', couleur: '#10b981', compte_comptable: '730-00', isFrequent: true, description: 'Cotisations des membres' },
      { id: 'sorties_revenu', nom: 'Sorties plongées', type: 'revenu', couleur: '#06b6d4', compte_comptable: '618-00-732', isFrequent: true, description: 'Revenus des sorties plongées' },
      { id: 'evenement', nom: 'Événements', type: 'revenu', couleur: '#3b82f6', compte_comptable: '664-00', isFrequent: false, description: 'Revenus des événements' },
      { id: 'subside', nom: 'Subsides', type: 'revenu', couleur: '#14b8a6', compte_comptable: '15-000', isFrequent: false, description: 'Subsides reçus' },

      // DÉPENSES (fréquents en premier)
      { id: 'piscine', nom: 'Piscine', type: 'depense', couleur: '#f59e0b', compte_comptable: '610-00', isFrequent: true, description: 'Location de piscine' },
      { id: 'materiel', nom: 'Matériel', type: 'depense', couleur: '#ef4444', compte_comptable: '612-00', isFrequent: true, description: 'Achat de matériel de plongée' },
      { id: 'sorties_depense', nom: 'Sorties plongées', type: 'depense', couleur: '#0891b2', compte_comptable: '618-00', isFrequent: true, description: 'Dépenses des sorties plongées' },
      { id: 'reunions', nom: 'Réunions', type: 'depense', couleur: '#8b5cf6', compte_comptable: '613', isFrequent: false, description: 'Frais de réunions' },
      { id: 'formation', nom: 'Formation', type: 'depense', couleur: '#a855f7', compte_comptable: '616-00', isFrequent: false, description: 'Frais de formation' },
      { id: 'administration', nom: 'Administration', type: 'depense', couleur: '#6366f1', compte_comptable: '614-00', isFrequent: false, description: 'Frais administratifs' },
      { id: 'assurance', nom: 'Assurances', type: 'depense', couleur: '#ec4899', compte_comptable: '611-00', isFrequent: false, description: 'Assurances' },
      { id: 'frais_bancaires', nom: 'Frais bancaires', type: 'depense', couleur: '#64748b', compte_comptable: '657-00', isFrequent: false, description: 'Frais bancaires' }
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

      console.log('Catégories par défaut initialisées dans Firebase');
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

      console.log(`${snapshot.docs.length} catégories supprimées`);

      // 2. Ajouter les catégories par défaut
      const defaultCategories = this.getDefaultCategories();
      const savePromises = defaultCategories.map(category =>
        this.saveCategory(clubId, category)
      );
      await Promise.all(savePromises);

      console.log(`${defaultCategories.length} catégories par défaut réinitialisées`);
    } catch (error) {
      console.error('Erreur lors de la réinitialisation des catégories:', error);
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

        console.log('Paramètres généraux migrés vers Firebase');
      } catch (error) {
        console.error('Erreur lors de la migration des paramètres généraux:', error);
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
      console.error('Erreur lors du chargement des paramètres généraux:', error);
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
      console.error('Erreur lors de la sauvegarde des paramètres généraux:', error);
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
    console.log('Tous les paramètres ont été migrés vers Firebase');
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

        console.log(`Migration de l'année fiscale ${year} vers le nouveau système...`);

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

          console.log(`Année fiscale ${year} créée avec succès`);
        } else {
          console.log('Une année fiscale existe déjà, migration annulée');
        }
      }
    } catch (error) {
      console.error('Erreur lors de la migration du système fiscal:', error);
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
      console.error('Erreur lors du calcul des soldes d\'ouverture:', error);
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
      console.error('Erreur lors du chargement des paramètres de sécurité:', error);
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

      console.log('✅ Paramètres de sécurité sauvegardés');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des paramètres de sécurité:', error);
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
      console.error('Erreur lors du chargement des paramètres de téléchargement:', error);
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

      console.log('✅ Paramètres de téléchargement sauvegardés');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des paramètres de téléchargement:', error);
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
      console.error('Erreur lors du chargement des clés API IA:', error);
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
      console.error('Erreur lors du chargement de la configuration Google Mail:', error);
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

      console.log('✅ Clés API IA sauvegardées dans Firebase');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des clés API IA:', error);
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

      console.log('✅ Configuration Google Mail sauvegardée dans Firebase');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde de la configuration Google Mail:', error);
      throw error;
    }
  }

  /**
   * Charger la configuration Email (Resend + Gmail + Provider) depuis Firebase
   */
  static async loadEmailConfig(clubId: string): Promise<{
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
  }> {
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
      console.error('Erreur lors du chargement de la configuration Email:', error);
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

      console.log('✅ Configuration Email sauvegardée dans Firebase');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde de la configuration Email:', error);
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
            createdAt: job.createdAt?.toDate ? job.createdAt.toDate() : new Date(job.createdAt),
            updatedAt: job.updatedAt?.toDate ? job.updatedAt.toDate() : new Date(job.updatedAt),
            lastRun: job.lastRun?.toDate ? job.lastRun.toDate() : job.lastRun ? new Date(job.lastRun) : undefined,
          })) || [],
        } as CommunicationSettings;
      }

      // Si pas de settings, retourner les valeurs par défaut
      console.log('📧 Aucun paramètre de communication trouvé, utilisation des valeurs par défaut');
      return DEFAULT_COMMUNICATION_SETTINGS;
    } catch (error) {
      console.error('❌ Erreur lors du chargement des paramètres de communication:', error);
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
          createdAt: job.createdAt instanceof Date ? Timestamp.fromDate(job.createdAt) : job.createdAt,
          updatedAt: now, // Use Timestamp.now() instead of serverTimestamp() in arrays
          lastRun: job.lastRun instanceof Date ? Timestamp.fromDate(job.lastRun) : (job.lastRun || null),
        })),
      });

      await setDoc(settingsRef, firestoreData);
      console.log('✅ Paramètres de communication sauvegardés dans Firebase');
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des paramètres de communication:', error);
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
        console.log(`✅ Job ${jobId} dernière exécution mise à jour (success: ${success})`);
      }
    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour de la dernière exécution:', error);
      throw error;
    }
  }
}
