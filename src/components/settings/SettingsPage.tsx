/**
 * ⚠️ DEPRECATED - This page will be removed in a future version
 *
 * This page has been split into separate pages accessible via:
 * - /parametres/systeme → System settings hub with buttons to:
 *   - /parametres/comptabilite → Plan Comptable & Catégories
 *   - /parametres/annees-fiscales → Années Fiscales
 *   - /parametres/general → Paramètres Généraux
 *   - /parametres/securite → Sécurité (session timeout)
 *   - /parametres/ia-settings → IA API keys
 *   - /parametres/listes-valeurs → Listes de valeurs
 *   - /parametres/maintenance → Maintenance & cleanup
 *
 * Please update any links to use the new routes above.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  BookOpen,
  Download,
  Upload,
  Search,
  Filter,
  Check,
  X,
  Info,
  Database,
  Users,
  Shield,
  Palette,
  Eye,
  Plus,
  Star,
  Save,
  Euro,
  Calendar,
  Building2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  FileSpreadsheet,
  Trash2,
  Link2,
  Loader2,
  Receipt,
  CalendarX,
  FileText,
  RefreshCw,
  CheckCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Mail
} from 'lucide-react';
import { AccountCode, Categorie } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { getCalypsoAccountCodes } from '@/config/calypso-accounts';
import { AccountCodeDetailView } from './AccountCodeDetailView';
import { CategoryDetailView } from './CategoryDetailView';
import { FiscalYearsManagement } from './FiscalYearsManagement';
import { PermissionsManagement } from './PermissionsManagement';
import { SecuritySettings } from './SecuritySettings';
import { AISettings } from './AISettings';
import { DuplicateCleanup } from './DuplicateCleanup';
import { FindDuplicateLinks } from '../admin/FindDuplicateLinks';
import CommunicationSettings from './CommunicationSettings';
import ValueListsSettings from './ValueListsSettings';
import { deleteMultipleStorageFiles } from '@/utils/storageUtils';
import { cn } from '@/utils/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { linkCleanupService, GlobalCleanupStats } from '@/services/linkCleanupService';
import { DownloadSettings, DEFAULT_DOWNLOAD_SETTINGS } from '@/types/settings.types';

export function SettingsPage() {
  const navigate = useNavigate();
  const { clubId, appUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'accounting' | 'categories' | 'general' | 'fiscal_years' | 'permissions' | 'value_lists' | 'security' | 'ai' | 'data' | 'communication'>('accounting');
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<AccountCode[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense' | 'asset' | 'liability'>('all');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [detailViewCode, setDetailViewCode] = useState<AccountCode | null>(null);
  const [frequentCodes, setFrequentCodes] = useState<Set<string>>(new Set());

  // États pour le tri (account codes)
  type SortColumn = 'selected' | 'frequent' | 'code' | 'label' | 'type' | 'category';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [sortPattern, setSortPattern] = useState<string>(''); // Pattern de tri pour codes (ex: ".XX-..-..")

  // États pour le tri (categories)
  type CategorySortColumn = 'frequent' | 'nom' | 'label_court' | 'type' | 'compte_comptable';
  const [categorySortColumn, setCategorySortColumn] = useState<CategorySortColumn | null>(null);
  const [categorySortDirection, setCategorySortDirection] = useState<SortDirection>(null);

  const [detailViewCategory, setDetailViewCategory] = useState<Categorie | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  
  // Paramètres généraux
  const [generalSettings, setGeneralSettings] = useState({
    doubleApprovalThreshold: 100,
    enableDoubleApproval: true,
    clubName: 'Calypso Diving Club',
    fiscalYear: new Date().getFullYear(),
    currency: 'EUR'
  });

  // État pour la suppression
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, message: '' });

  // État pour le nettoyage des doublons
  const [cleaning, setCleaning] = useState(false);
  const [cleanProgress, setCleanProgress] = useState({ current: 0, total: 0, fixed: 0, message: '' });

  // Catégories
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // Paramètres de téléchargement
  const [downloadSettings, setDownloadSettings] = useState<DownloadSettings>(DEFAULT_DOWNLOAD_SETTINGS);

  // Charger tous les paramètres depuis Firebase au montage
  useEffect(() => {
    const loadAllSettings = async () => {
      if (!clubId) return;

      try {
        // Migration automatique désactivée - les permissions Firestore requièrent une session valide
        // Si migration nécessaire, utiliser un bouton manuel dans l'interface admin
        // const hasLocalCategories = localStorage.getItem('appCategories');
        // const hasLocalAccountCodes = localStorage.getItem('customAccountCodes');
        // const hasLocalGeneralSettings = localStorage.getItem('generalSettings');
        //
        // if (hasLocalCategories || hasLocalAccountCodes || hasLocalGeneralSettings) {
        //   console.log('Migration des paramètres vers Firebase...');
        //   await FirebaseSettingsService.migrateAllSettings(clubId);
        //   toast.success('Paramètres migrés vers Firebase');
        // }

        // Charger les catégories depuis Firebase
        const firebaseCategories = await FirebaseSettingsService.loadCategories(clubId);
        setCategories(firebaseCategories);
        CategorizationService.updateCategoriesCache(firebaseCategories);

        // Charger les codes comptables depuis Firebase
        const accountCodesSettings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);

        // Charger les paramètres généraux depuis Firebase
        const loadedGeneralSettings = await FirebaseSettingsService.loadGeneralSettings(clubId);
        setGeneralSettings(loadedGeneralSettings);

        // Charger les paramètres de téléchargement depuis Firebase
        const loadedDownloadSettings = await FirebaseSettingsService.loadDownloadSettings(clubId);
        setDownloadSettings(loadedDownloadSettings);

        // Appliquer les codes personnalisés
        let codes = getCalypsoAccountCodes().map(code => {
          if (accountCodesSettings.customCodes[code.code]) {
            return { ...code, ...accountCodesSettings.customCodes[code.code] };
          }
          return code;
        });

        setAccountCodes(codes);
        setFilteredCodes(codes);

        // Codes sélectionnés
        if (accountCodesSettings.selectedCodes.length > 0) {
          setSelectedCodes(new Set(accountCodesSettings.selectedCodes));
        } else {
          setSelectedCodes(new Set(codes.map(c => c.code)));
        }

        // Codes fréquents
        const frequents = new Set(codes.filter(c => c.isFrequent).map(c => c.code));
        setFrequentCodes(frequents);

        // Charger le cache pour calypso-accounts.ts
        const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
        loadAccountCodesCache(accountCodesSettings.customCodes, accountCodesSettings.selectedCodes);

        setCategoriesLoaded(true);
      } catch (error) {
        console.error('Erreur lors du chargement des paramètres:', error);
        toast.error('Erreur lors du chargement des paramètres');
      }
    };

    loadAllSettings();
  }, [clubId]);

  // Fonction pour extraire les parties d'un code selon un pattern
  // Pattern exemple: ".XX-..-..""
  // "6" devient "X", tout autre chiffre devient "."
  const matchesPattern = (code: string, pattern: string): string[] => {
    const parts: string[] = [];

    for (let i = 0; i < pattern.length && i < code.length; i++) {
      const patternChar = pattern[i];
      const codeChar = code[i];

      if (patternChar === 'X') {
        // Position importante - capturer
        parts.push(codeChar);
      }
      // Les "." et autres caractères sont ignorés pour le tri
    }

    return parts;
  };

  // Filtrer ET trier les codes selon la recherche, le type et le tri
  useEffect(() => {
    let filtered = accountCodes;

    // Filtrer par type
    if (filterType !== 'all') {
      filtered = filtered.filter(code => code.type === filterType);
    }

    // Filtrer par recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(code =>
        code.code.toLowerCase().includes(term) ||
        code.label.toLowerCase().includes(term)
      );
    }

    // Appliquer le tri
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;

        switch (sortColumn) {
          case 'selected':
            comparison = (selectedCodes.has(a.code) ? 1 : 0) - (selectedCodes.has(b.code) ? 1 : 0);
            break;
          case 'frequent':
            comparison = (a.isFrequent ? 1 : 0) - (b.isFrequent ? 1 : 0);
            break;
          case 'code':
            // Tri intelligent avec pattern si défini
            if (sortPattern && sortPattern.trim()) {
              const partsA = matchesPattern(a.code, sortPattern);
              const partsB = matchesPattern(b.code, sortPattern);

              // Comparer les parties extraites
              for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const partA = partsA[i] || '';
                const partB = partsB[i] || '';
                if (partA !== partB) {
                  comparison = partA.localeCompare(partB);
                  break;
                }
              }

              // Si toutes les parties sont égales, comparer les codes entiers
              if (comparison === 0) {
                comparison = a.code.localeCompare(b.code);
              }
            } else {
              // Tri normal sur le code complet
              comparison = a.code.localeCompare(b.code);
            }
            break;
          case 'label':
            comparison = a.label.localeCompare(b.label);
            break;
          case 'type':
            const typeOrder = { revenue: 1, expense: 2, asset: 3, liability: 4 };
            comparison = (typeOrder[a.type as keyof typeof typeOrder] || 0) - (typeOrder[b.type as keyof typeof typeOrder] || 0);
            break;
          case 'category':
            const catA = a.category || '';
            const catB = b.category || '';
            comparison = catA.localeCompare(catB);
            break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    setFilteredCodes(filtered);
  }, [searchTerm, filterType, accountCodes, sortColumn, sortDirection, sortPattern, selectedCodes]);

  // Fonction pour gérer le clic sur un en-tête de colonne
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Même colonne - cycle: asc → desc → null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      // Nouvelle colonne - commencer par asc
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Icône de tri pour les en-têtes (account codes)
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

  // Fonction pour gérer le tri des catégories
  const handleCategorySort = (column: CategorySortColumn) => {
    if (categorySortColumn === column) {
      // Même colonne - cycle: asc → desc → null
      if (categorySortDirection === 'asc') {
        setCategorySortDirection('desc');
      } else if (categorySortDirection === 'desc') {
        setCategorySortDirection(null);
        setCategorySortColumn(null);
      }
    } else {
      // Nouvelle colonne - commencer par asc
      setCategorySortColumn(column);
      setCategorySortDirection('asc');
    }
  };

  // Icône de tri pour les catégories
  const CategorySortIcon = ({ column }: { column: CategorySortColumn }) => {
    if (categorySortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (categorySortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

  // Sorted categories avec mémo
  const sortedCategories = useMemo(() => {
    let sorted = [...categories];

    if (categorySortColumn && categorySortDirection) {
      sorted.sort((a, b) => {
        let comparison = 0;

        switch (categorySortColumn) {
          case 'frequent':
            comparison = (a.isFrequent ? 1 : 0) - (b.isFrequent ? 1 : 0);
            break;
          case 'nom':
            comparison = a.nom.localeCompare(b.nom);
            break;
          case 'label_court':
            const aLabel = a.label_court || a.nom.split(' ')[0];
            const bLabel = b.label_court || b.nom.split(' ')[0];
            comparison = aLabel.localeCompare(bLabel);
            break;
          case 'type':
            comparison = a.type.localeCompare(b.type);
            break;
          case 'compte_comptable':
            const aCode = a.compte_comptable || '';
            const bCode = b.compte_comptable || '';
            comparison = aCode.localeCompare(bCode);
            break;
        }

        return categorySortDirection === 'asc' ? comparison : -comparison;
      });
    } else {
      // Tri par défaut: favoris d'abord, puis par nom
      sorted.sort((a, b) => {
        if (a.isFrequent && !b.isFrequent) return -1;
        if (!a.isFrequent && b.isFrequent) return 1;
        return a.nom.localeCompare(b.nom);
      });
    }

    return sorted;
  }, [categories, categorySortColumn, categorySortDirection]);

  // Basculer la sélection d'un code
  const toggleCodeSelection = (code: string) => {
    const newSelected = new Set(selectedCodes);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCodes(newSelected);
  };
  
  // Basculer le statut fréquent d'un code
  const toggleFrequent = async (codeStr: string) => {
    if (!clubId) return;

    const code = accountCodes.find(c => c.code === codeStr);

    if (code) {
      const updatedCode = { ...code, isFrequent: !code.isFrequent };

      try {
        // Charger les codes actuels depuis Firebase
        const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
        settings.customCodes[codeStr] = updatedCode;

        // Sauvegarder dans Firebase
        await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, settings.selectedCodes);

        // Mettre à jour l'état local
        setAccountCodes(prev => prev.map(c => c.code === codeStr ? updatedCode : c));
        setFilteredCodes(prev => prev.map(c => c.code === codeStr ? updatedCode : c));

        // Mettre à jour la liste des fréquents
        const newFrequents = new Set(frequentCodes);
        if (updatedCode.isFrequent) {
          newFrequents.add(codeStr);
        } else {
          newFrequents.delete(codeStr);
        }
        setFrequentCodes(newFrequents);

        // Mettre à jour le cache
        const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
        loadAccountCodesCache(settings.customCodes, settings.selectedCodes);

        toast.success(updatedCode.isFrequent ? 'Code marqué comme fréquent' : 'Code retiré des fréquents');
      } catch (error) {
        console.error('Erreur lors de la sauvegarde:', error);
        toast.error('Erreur lors de la sauvegarde');
      }
    }
  };

  // Sauvegarder les codes sélectionnés
  const saveSelectedCodes = async () => {
    if (!clubId) return;

    try {
      const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
      await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, Array.from(selectedCodes));

      // Mettre à jour le cache
      const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
      loadAccountCodesCache(settings.customCodes, Array.from(selectedCodes));

      toast.success('Codes comptables sauvegardés');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };
  
  // Mettre à jour un code après édition
  const handleUpdateCode = async (updatedCode: AccountCode) => {
    if (!clubId) return;

    try {
      // Charger les codes actuels depuis Firebase
      const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
      settings.customCodes[updatedCode.code] = updatedCode;

      // Sauvegarder dans Firebase
      await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, settings.selectedCodes);

      // Mettre à jour l'état local
      setAccountCodes(prev => prev.map(code =>
        code.code === updatedCode.code ? updatedCode : code
      ));
      setFilteredCodes(prev => prev.map(code =>
        code.code === updatedCode.code ? updatedCode : code
      ));

      // Mettre à jour le cache
      const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
      loadAccountCodesCache(settings.customCodes, settings.selectedCodes);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Supprimer un code
  const handleDeleteCode = async (codeToDelete: string) => {
    const newSelected = new Set(selectedCodes);
    newSelected.delete(codeToDelete);
    setSelectedCodes(newSelected);
    await saveSelectedCodes();
  };
  
  // Mettre à jour une catégorie après édition
  const handleUpdateCategory = async (updatedCategory: Categorie) => {
    if (!clubId) return;

    try {
      // Sauvegarder dans Firebase
      await FirebaseSettingsService.saveCategory(clubId, updatedCategory);

      // Mettre à jour l'état local
      if (isNewCategory) {
        setCategories(prev => [...prev, updatedCategory]);
      } else {
        setCategories(prev => prev.map(cat =>
          cat.id === updatedCategory.id ? updatedCategory : cat
        ));
      }

      // Mettre à jour le cache
      const updatedCategories = isNewCategory
        ? [...categories, updatedCategory]
        : categories.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat);
      CategorizationService.updateCategoriesCache(updatedCategories);

      setIsNewCategory(false);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la catégorie:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Supprimer une catégorie
  const handleDeleteCategory = async (categoryId: string) => {
    if (!clubId) return;

    try {
      // Supprimer de Firebase
      await FirebaseSettingsService.deleteCategory(clubId, categoryId);

      // Mettre à jour l'état local
      const updatedCategories = categories.filter(cat => cat.id !== categoryId);
      setCategories(updatedCategories);

      // Mettre à jour le cache
      CategorizationService.updateCategoriesCache(updatedCategories);
    } catch (error) {
      console.error('Erreur lors de la suppression de la catégorie:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  // Basculer le statut fréquent d'une catégorie
  const toggleCategoryFrequent = async (categoryId: string) => {
    if (!clubId) return;

    const category = categories.find(c => c.id === categoryId);

    if (category) {
      const updatedCategory = { ...category, isFrequent: !category.isFrequent };

      try {
        // Sauvegarder dans Firebase
        await FirebaseSettingsService.saveCategory(clubId, updatedCategory);

        // Mettre à jour l'état local
        setCategories(prev => prev.map(cat =>
          cat.id === categoryId ? updatedCategory : cat
        ));

        // Mettre à jour le cache
        const updatedCategories = categories.map(cat =>
          cat.id === categoryId ? updatedCategory : cat
        );
        CategorizationService.updateCategoriesCache(updatedCategories);

        toast.success(updatedCategory.isFrequent ? 'Catégorie ajoutée aux favoris' : 'Catégorie retirée des favoris');
      } catch (error) {
        console.error('Erreur lors de la mise à jour de la catégorie:', error);
        toast.error('Erreur lors de la mise à jour');
      }
    }
  };

  // Sauvegarder les paramètres généraux
  const saveGeneralSettings = async () => {
    if (!clubId) return;

    try {
      await FirebaseSettingsService.saveGeneralSettings(clubId, generalSettings);
      toast.success('Paramètres sauvegardés');
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des paramètres:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };
  
  // Mettre à jour un paramètre général
  const updateGeneralSetting = (key: string, value: any) => {
    setGeneralSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Exporter les codes en JSON
  const exportCodes = () => {
    const dataStr = JSON.stringify({
      accountCodes: accountCodes.filter(c => selectedCodes.has(c.code)),
      categories: categories
    }, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

    const exportFileDefaultName = 'calypso_plan_comptable.json';

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();

    toast.success('Plan comptable exporté');
  };

  // Supprimer uniquement les transactions bancaires
  const handleDeleteTransactions = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '⚠️ ATTENTION: Supprimer toutes les transactions bancaires?\n\n' +
      'Cette action supprimera:\n' +
      '• Toutes les transactions bancaires\n' +
      '• Les liaisons avec activités et dépenses seront perdues\n\n' +
      'Cette action est IRRÉVERSIBLE!\n\n' +
      'Tapez "SUPPRIMER" dans la boîte de dialogue suivante pour confirmer.'
    );

    if (!confirmation) return;

    const confirmText = window.prompt('Tapez "SUPPRIMER" en majuscules pour confirmer:');
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Suppression annulée');
      return;
    }

    setDeleting(true);

    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const transactionsSnapshot = await getDocs(transactionsRef);

      setDeleteProgress({
        current: 0,
        total: transactionsSnapshot.docs.length,
        message: 'Suppression des transactions bancaires...'
      });

      for (let i = 0; i < transactionsSnapshot.docs.length; i++) {
        const document = transactionsSnapshot.docs[i];
        await deleteDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', document.id));

        if (i % 10 === 0 || i === transactionsSnapshot.docs.length - 1) {
          setDeleteProgress({
            current: i + 1,
            total: transactionsSnapshot.docs.length,
            message: `Suppression des transactions: ${i + 1}/${transactionsSnapshot.docs.length}`
          });
        }
      }

      toast.success(`✅ ${transactionsSnapshot.docs.length} transaction(s) supprimée(s)`);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur lors de la suppression des transactions');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Supprimer uniquement les activités
  const handleDeleteEvents = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '⚠️ ATTENTION: Supprimer toutes les activités?\n\n' +
      'Cette action supprimera:\n' +
      '• Toutes les activités\n' +
      '• Les participants associés\n' +
      '• Les liaisons avec transactions\n\n' +
      'Cette action est IRRÉVERSIBLE!\n\n' +
      'Tapez "SUPPRIMER" dans la boîte de dialogue suivante pour confirmer.'
    );

    if (!confirmation) return;

    const confirmText = window.prompt('Tapez "SUPPRIMER" en majuscules pour confirmer:');
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Suppression annulée');
      return;
    }

    setDeleting(true);

    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // 🆕 MIGRATION: Delete from 'operations' collection instead of 'evenements'
      const eventsRef = collection(db, 'clubs', clubId, 'operations');
      const eventsSnapshot = await getDocs(eventsRef);

      setDeleteProgress({
        current: 0,
        total: eventsSnapshot.docs.length,
        message: 'Suppression des activités...'
      });

      for (let i = 0; i < eventsSnapshot.docs.length; i++) {
        const document = eventsSnapshot.docs[i];
        await deleteDoc(doc(db, 'clubs', clubId, 'operations', document.id));

        if (i % 5 === 0 || i === eventsSnapshot.docs.length - 1) {
          setDeleteProgress({
            current: i + 1,
            total: eventsSnapshot.docs.length,
            message: `Suppression des activités: ${i + 1}/${eventsSnapshot.docs.length}`
          });
        }
      }

      toast.success(`✅ ${eventsSnapshot.docs.length} activité(s) supprimée(s)`);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur lors de la suppression des activités');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Supprimer uniquement les dépenses
  const handleDeleteExpenses = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '⚠️ ATTENTION: Supprimer toutes les dépenses?\n\n' +
      'Cette action supprimera:\n' +
      '• Toutes les demandes de remboursement (Firestore)\n' +
      '• Les liaisons avec transactions\n' +
      '• Les documents justificatifs (Storage)\n\n' +
      'Cette action est IRRÉVERSIBLE!\n\n' +
      'Tapez "SUPPRIMER" dans la boîte de dialogue suivante pour confirmer.'
    );

    if (!confirmation) return;

    const confirmText = window.prompt('Tapez "SUPPRIMER" en majuscules pour confirmer:');
    if (confirmText !== 'SUPPRIMER') {
      toast.error('Suppression annulée');
      return;
    }

    setDeleting(true);

    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const demandsRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const demandsSnapshot = await getDocs(demandsRef);

      setDeleteProgress({
        current: 0,
        total: demandsSnapshot.docs.length * 2, // x2 pour Storage + Firestore
        message: 'Suppression des dépenses et documents...'
      });

      let storageDeleted = 0;
      let storageFailed = 0;

      for (let i = 0; i < demandsSnapshot.docs.length; i++) {
        const document = demandsSnapshot.docs[i];
        const data = document.data();

        // ÉTAPE 1: Supprimer les fichiers Storage
        const urls = data.urls_justificatifs || [];
        if (urls.length > 0) {
          const result = await deleteMultipleStorageFiles(urls);
          storageDeleted += result.deleted;
          storageFailed += result.failed;

          setDeleteProgress({
            current: i * 2 + 1,
            total: demandsSnapshot.docs.length * 2,
            message: `Suppression documents: ${i + 1}/${demandsSnapshot.docs.length}`
          });
        }

        // ÉTAPE 2: Supprimer le document Firestore
        await deleteDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', document.id));

        if (i % 5 === 0 || i === demandsSnapshot.docs.length - 1) {
          setDeleteProgress({
            current: i * 2 + 2,
            total: demandsSnapshot.docs.length * 2,
            message: `Suppression Firestore: ${i + 1}/${demandsSnapshot.docs.length}`
          });
        }
      }

      toast.success(
        `✅ ${demandsSnapshot.docs.length} dépense(s) supprimée(s)\n` +
        `📁 ${storageDeleted} fichier(s) Storage supprimé(s)` +
        (storageFailed > 0 ? `\n⚠️ ${storageFailed} fichier(s) non trouvé(s)` : '')
      );
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur lors de la suppression des dépenses');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Supprimer TOUTES les données
  const handleDeleteAllData = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '🔴 ATTENTION MAXIMALE: Supprimer TOUTES les données?\n\n' +
      'Cette action supprimera:\n' +
      '• TOUTES les transactions bancaires\n' +
      '• TOUTES les activités et participants\n' +
      '• TOUTES les dépenses\n\n' +
      '🔴 CETTE ACTION EST TOTALEMENT IRRÉVERSIBLE!\n\n' +
      'Tapez "SUPPRIMER TOUT" dans la boîte de dialogue suivante pour confirmer.'
    );

    if (!confirmation) return;

    const confirmText = window.prompt('Tapez "SUPPRIMER TOUT" en majuscules pour confirmer:');
    if (confirmText !== 'SUPPRIMER TOUT') {
      toast.error('Suppression annulée');
      return;
    }

    setDeleting(true);

    try {
      const { collection, getDocs, deleteDoc, doc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      let totalDeleted = 0;

      // Supprimer les transactions
      setDeleteProgress({ current: 1, total: 3, message: 'Suppression des transactions bancaires...' });
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const transactionsSnapshot = await getDocs(transactionsRef);
      for (let i = 0; i < transactionsSnapshot.docs.length; i++) {
        const document = transactionsSnapshot.docs[i];
        await deleteDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', document.id));
        totalDeleted++;
        if (i % 10 === 0) {
          setDeleteProgress({
            current: 1,
            total: 3,
            message: `Suppression des transactions: ${i + 1}/${transactionsSnapshot.docs.length}`
          });
        }
      }

      // Supprimer les activités
      setDeleteProgress({ current: 2, total: 3, message: 'Suppression des activités...' });
      // 🆕 MIGRATION: Delete from 'operations' collection instead of 'evenements'
      const eventsRef = collection(db, 'clubs', clubId, 'operations');
      const eventsSnapshot = await getDocs(eventsRef);
      for (const document of eventsSnapshot.docs) {
        await deleteDoc(doc(db, 'clubs', clubId, 'operations', document.id));
        totalDeleted++;
      }

      // Supprimer les demandes
      setDeleteProgress({ current: 3, total: 3, message: 'Suppression des dépenses...' });
      const demandsRef = collection(db, 'clubs', clubId, 'demandes_remboursement');
      const demandsSnapshot = await getDocs(demandsRef);
      for (const document of demandsSnapshot.docs) {
        await deleteDoc(doc(db, 'clubs', clubId, 'demandes_remboursement', document.id));
        totalDeleted++;
      }

      toast.success(`✅ ${totalDeleted} documents supprimés avec succès`);
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toast.error('Erreur lors de la suppression des données');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Nettoyer les liaisons orphelines
  const handleCleanOrphanLinks = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '🔗 Nettoyer les liaisons orphelines\n\n' +
      'Cette action va:\n' +
      '• Analyser toutes les transactions, inscriptions et dépenses\n' +
      '• Supprimer les liaisons vers des entités supprimées\n' +
      '• Afficher un rapport détaillé des nettoyages\n\n' +
      '✅ Aucune donnée ne sera supprimée, seules les liaisons invalides seront retirées.\n\n' +
      'Voulez-vous continuer?'
    );

    if (!confirmation) return;

    setDeleting(true);
    setDeleteProgress({ current: 1, total: 1, message: 'Analyse et nettoyage des liaisons...' });

    try {
      const stats: GlobalCleanupStats = await linkCleanupService.cleanAllOrphans(clubId);

      const message =
        `✅ Nettoyage terminé en ${stats.processingTimeMs}ms\n\n` +
        `📊 Statistiques:\n` +
        `• ${stats.transactionsUpdated} transactions mises à jour\n` +
        `• ${stats.inscriptionsUpdated} participants mis à jour\n` +
        `• ${stats.expensesUpdated} dépenses mises à jour\n` +
        `• ${stats.totalLinksRemoved} liaisons orphelines supprimées\n\n` +
        `🔍 Détail des orphelins trouvés:\n` +
        `• ${stats.orphanedExpenses} dépenses supprimées\n` +
        `• ${stats.orphanedEvents} activités supprimées\n` +
        `• ${stats.orphanedInscriptions} participants supprimés\n` +
        `• ${stats.orphanedMembers} membres désactivés`;

      console.log(message);

      toast.success(
        `Nettoyage terminé! ${stats.totalLinksRemoved} liaisons orphelines supprimées. ` +
        `Voir la console pour les détails.`,
        { duration: 5000 }
      );

      // Afficher aussi dans une alerte
      alert(message);
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
      toast.error('Erreur lors du nettoyage des liaisons');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Réparer les statuts de réconciliation
  const handleRepairReconciliation = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '🔧 Réparer les statuts de réconciliation\n\n' +
      'Cette action va:\n' +
      '• Vérifier toutes les transactions\n' +
      '• Recalculer le statut "réconcilié" en fonction des liaisons réelles\n' +
      '• Corriger les incohérences (transactions sans liaisons marquées réconciliées)\n\n' +
      '✅ Aucune donnée ne sera supprimée, seuls les statuts seront corrigés.\n\n' +
      'Voulez-vous continuer?'
    );

    if (!confirmation) return;

    setDeleting(true);
    setDeleteProgress({ current: 1, total: 1, message: 'Réparation des statuts de réconciliation...' });

    try {
      const stats = await linkCleanupService.repairReconciliationStatus(clubId);

      const message =
        `✅ Réparation terminée en ${stats.processingTimeMs}ms\n\n` +
        `📊 Résultats:\n` +
        `• ${stats.transactionsChecked} transactions vérifiées\n` +
        `• ${stats.transactionsFixed} statuts corrigés`;

      console.log(message);

      toast.success(
        `Réparation terminée! ${stats.transactionsFixed} transaction(s) corrigée(s).`,
        { duration: 5000 }
      );

      alert(message);
    } catch (error) {
      console.error('Erreur lors de la réparation:', error);
      toast.error('Erreur lors de la réparation des statuts');
    } finally {
      setDeleting(false);
      setDeleteProgress({ current: 0, total: 0, message: '' });
    }
  };

  // Réinitialiser les catégories aux valeurs par défaut
  const handleResetCategories = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '🔄 Réinitialiser les catégories aux valeurs par défaut\n\n' +
      'Cette action va:\n' +
      '• Supprimer toutes les catégories existantes\n' +
      '• Réinstaller les 12 catégories par défaut\n' +
      '• Inclure "Sorties plongées" en revenu ET dépense\n\n' +
      '⚠️ Les catégories personnalisées seront perdues!\n\n' +
      'Voulez-vous continuer?'
    );

    if (!confirmation) return;

    const confirmText = window.prompt('Tapez "REINITIALISER" en majuscules pour confirmer:');
    if (confirmText !== 'REINITIALISER') {
      toast.error('Réinitialisation annulée');
      return;
    }

    try {
      await FirebaseSettingsService.resetCategoriesToDefault(clubId);

      // Recharger les catégories depuis Firebase
      const firebaseCategories = await FirebaseSettingsService.loadCategories(clubId);
      setCategories(firebaseCategories);

      // Mettre à jour le cache
      CategorizationService.updateCategoriesCache(firebaseCategories);

      toast.success(`✅ ${firebaseCategories.length} catégories réinitialisées avec succès`);
    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
      toast.error('Erreur lors de la réinitialisation des catégories');
    }
  };

  // Nettoyer les doublons dans matched_entities
  const handleCleanDuplicates = async () => {
    if (!clubId) return;

    const confirmation = window.confirm(
      '🔧 Nettoyage des doublons dans les liaisons\n\n' +
      'Cette action va:\n' +
      '• Analyser toutes les transactions\n' +
      '• Détecter les matched_entities en double\n' +
      '• Garder seulement une entrée par entity_id\n' +
      '• Corriger entity_type "demand" en "expense"\n\n' +
      'Voulez-vous continuer?'
    );

    if (!confirmation) return;

    setCleaning(true);
    setCleanProgress({ current: 0, total: 0, fixed: 0, message: 'Analyse des transactions...' });

    try {
      const { collection, getDocs, doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Charger toutes les transactions
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const snapshot = await getDocs(transactionsRef);

      setCleanProgress({
        current: 0,
        total: snapshot.docs.length,
        fixed: 0,
        message: `Analyse de ${snapshot.docs.length} transactions...`
      });

      let fixedCount = 0;

      for (let i = 0; i < snapshot.docs.length; i++) {
        const docSnap = snapshot.docs[i];
        const data = docSnap.data();

        if (data.matched_entities && Array.isArray(data.matched_entities) && data.matched_entities.length > 0) {
          let needsUpdate = false;

          // Détecter les doublons et corriger les types
          const uniqueEntities = new Map();

          for (const entity of data.matched_entities) {
            const key = entity.entity_id;

            if (!uniqueEntities.has(key)) {
              // Corriger le type si nécessaire
              const correctedEntity = {
                ...entity,
                entity_type: entity.entity_type === 'demand' ? 'expense' : entity.entity_type
              };
              uniqueEntities.set(key, correctedEntity);

              if (entity.entity_type === 'demand') {
                needsUpdate = true;
              }
            } else {
              // Doublon détecté
              needsUpdate = true;
            }
          }

          // Mettre à jour si nécessaire
          if (needsUpdate) {
            const cleanedEntities = Array.from(uniqueEntities.values());
            const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', docSnap.id);

            await updateDoc(txRef, {
              matched_entities: cleanedEntities
            });

            fixedCount++;
            console.log(`✅ Fixed transaction ${docSnap.id}: ${data.matched_entities.length} → ${cleanedEntities.length} entities`);
          }
        }

        // Mettre à jour la progression tous les 10 documents
        if (i % 10 === 0 || i === snapshot.docs.length - 1) {
          setCleanProgress({
            current: i + 1,
            total: snapshot.docs.length,
            fixed: fixedCount,
            message: `Analysé ${i + 1}/${snapshot.docs.length} transactions, ${fixedCount} corrigées`
          });
        }
      }

      toast.success(`✅ Nettoyage terminé! ${fixedCount} transaction(s) corrigée(s)`);
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
      toast.error('Erreur lors du nettoyage des doublons');
    } finally {
      setCleaning(false);
      setCleanProgress({ current: 0, total: 0, fixed: 0, message: '' });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-700 dark:text-dark-text-primary" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Paramètres</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">Configuration de l'application CalyCompta</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-dark-border mb-6">
        <nav className="flex space-x-8 -mb-px">
          <button
            onClick={() => setActiveTab('accounting')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'accounting'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <BookOpen className="h-4 w-4" />
            Plan comptable
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'categories'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Database className="h-4 w-4" />
            Catégories
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'general'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Palette className="h-4 w-4" />
            Général
          </button>
          <button
            onClick={() => setActiveTab('fiscal_years')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'fiscal_years'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Calendar className="h-4 w-4" />
            Années
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'permissions'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Shield className="h-4 w-4" />
            Droits
          </button>
          <button
            onClick={() => setActiveTab('value_lists')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'value_lists'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Database className="h-4 w-4" />
            Listes de valeurs
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'security'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Users className="h-4 w-4" />
            Sécurité
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'ai'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Star className="h-4 w-4" />
            IA
          </button>
          <button
            onClick={() => setActiveTab('data')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'data'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Database className="h-4 w-4" />
            Données
          </button>
          <button
            onClick={() => setActiveTab('communication')}
            className={cn(
              "py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2",
              activeTab === 'communication'
                ? "border-calypso-blue text-calypso-blue"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            )}
          >
            <Mail className="h-4 w-4" />
            Communication
          </button>
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'accounting' && (
        <div className="space-y-6">
          {/* Actions bar */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-3 items-center flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                  <input
                    type="text"
                    placeholder="Rechercher un code ou libellé..."
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <select
                  className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                >
                  <option value="all">Tous types</option>
                  <option value="revenue">Revenus</option>
                  <option value="expense">Dépenses</option>
                  <option value="asset">Actifs</option>
                  <option value="liability">Passifs</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDetailViewCode({
                    code: '',
                    label: '',
                    type: 'expense',
                    category: '',
                    description: '',
                    isFrequent: false
                  } as AccountCode)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nouveau code
                </button>
                <button
                  onClick={saveSelectedCodes}
                  className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors flex items-center gap-2"
                >
                  <Check className="h-4 w-4" />
                  Sauvegarder
                </button>
                <button
                  onClick={exportCodes}
                  className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exporter
                </button>
              </div>
            </div>
          </div>

          {/* Pattern de tri codes */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-blue-900 dark:text-blue-100 whitespace-nowrap">
                  Tri sur codes:
                </label>
                <input
                  type="text"
                  value={sortPattern}
                  onChange={(e) => setSortPattern(e.target.value)}
                  placeholder="Exemple: .XX-..-.."
                  className="flex-1 px-2 py-1 border border-blue-300 dark:border-blue-700 rounded focus:ring-1 focus:ring-blue-500 font-mono text-xs bg-white dark:bg-dark-bg-tertiary"
                />
                {sortPattern && sortColumn === 'code' && sortDirection && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 whitespace-nowrap">✓ Actif</span>
                )}
              </div>
              <div className="text-xs text-blue-700 dark:text-blue-300">
                <span className="font-medium">Utilisation:</span> Utilisez <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">X</code> pour les positions à trier, <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.</code> pour ignorer.
                Cliquez sur <span className="font-medium">"Code"</span> pour activer le tri.
                <br/>
                <span className="font-medium">Exemples:</span>
                <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">.XX-..-..</code> = 2ème et 3ème caractères,
                <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">X..-..-..</code> = 1er caractère,
                <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded mx-1">...-XX-..</code> = 5ème et 6ème caractères
              </div>
            </div>
          </div>

          {/* Account codes table */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <tr>
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('selected')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Utilisé
                        <SortIcon column="selected" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('frequent')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Fréquent
                        <SortIcon column="frequent" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('code')}
                    >
                      <div className="flex items-center gap-1">
                        Code
                        <SortIcon column="code" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('label')}
                    >
                      <div className="flex items-center gap-1">
                        Libellé
                        <SortIcon column="label" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('type')}
                    >
                      <div className="flex items-center gap-1">
                        Type
                        <SortIcon column="type" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleSort('category')}
                    >
                      <div className="flex items-center gap-1">
                        Catégorie
                        <SortIcon column="category" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCodes.map((code) => (
                    <tr key={code.code} className="hover:bg-gray-50 dark:bg-dark-bg-tertiary">
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleCodeSelection(code.code)}
                          className={cn(
                            "inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors",
                            selectedCodes.has(code.code)
                              ? "bg-green-100 text-green-600 hover:bg-green-200"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                        >
                          {selectedCodes.has(code.code) ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleFrequent(code.code)}
                          className={cn(
                            "inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors",
                            code.isFrequent
                              ? "bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                          title={code.isFrequent ? "Retirer des fréquents" : "Marquer comme fréquent"}
                        >
                          <Star className={cn(
                            "h-4 w-4",
                            code.isFrequent && "fill-yellow-600"
                          )} />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm text-gray-900 dark:text-dark-text-primary">{code.code}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900 dark:text-dark-text-primary">{code.label}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          code.type === 'revenue' && "bg-green-100 text-green-700",
                          code.type === 'expense' && "bg-red-100 text-red-700",
                          code.type === 'asset' && "bg-blue-100 text-blue-700",
                          code.type === 'liability' && "bg-purple-100 text-purple-700"
                        )}>
                          {code.type === 'revenue' && 'Revenu'}
                          {code.type === 'expense' && 'Dépense'}
                          {code.type === 'asset' && 'Actif'}
                          {code.type === 'liability' && 'Passif'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-500 dark:text-dark-text-muted">
                          {code.category?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => setDetailViewCode(code)}
                          className="text-gray-600 dark:text-dark-text-secondary hover:text-gray-700 dark:text-dark-text-primary transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="space-y-6">
          {/* Actions bar */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                  {categories.length} catégorie{categories.length > 1 ? 's' : ''} configurée{categories.length > 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleResetCategories}
                  className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors flex items-center gap-2 border border-orange-300"
                  title="Réinitialiser aux valeurs par défaut"
                >
                  <RefreshCw className="h-4 w-4" />
                  Réinitialiser
                </button>
                <button
                  onClick={() => {
                    setDetailViewCategory(null);
                    setIsNewCategory(true);
                  }}
                  className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Nouvelle catégorie
                </button>
              </div>
            </div>
          </div>

          {/* Categories table */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
                  <tr>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-24 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleCategorySort('frequent')}
                    >
                      <div className="flex items-center justify-center gap-1">
                        Fréquent
                        <CategorySortIcon column="frequent" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleCategorySort('nom')}
                    >
                      <div className="flex items-center gap-1">
                        Nom
                        <CategorySortIcon column="nom" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-32 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleCategorySort('label_court')}
                    >
                      <div className="flex items-center gap-1">
                        Label court
                        <CategorySortIcon column="label_court" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-32 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleCategorySort('type')}
                    >
                      <div className="flex items-center gap-1">
                        Type
                        <CategorySortIcon column="type" />
                      </div>
                    </th>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-48 cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-bg-primary transition-colors"
                      onClick={() => handleCategorySort('compte_comptable')}
                    >
                      <div className="flex items-center gap-1">
                        Code comptable
                        <CategorySortIcon column="compte_comptable" />
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sortedCategories.map((category) => (
                    <tr key={category.id} className="hover:bg-gray-50 dark:bg-dark-bg-tertiary">
                      <td className="px-3 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleCategoryFrequent(category.id)}
                          className={cn(
                            "inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors",
                            category.isFrequent
                              ? "bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          )}
                          title={category.isFrequent ? "Retirer des favoris" : "Marquer comme favori"}
                        >
                          <Star className={cn(
                            "h-4 w-4",
                            category.isFrequent && "fill-yellow-600"
                          )} />
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-gray-900 dark:text-dark-text-primary">{category.nom}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          {category.label_court || category.nom.split(' ')[0]}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          category.type === 'revenu' && "bg-green-100 text-green-700",
                          category.type === 'depense' && "bg-red-100 text-red-700"
                        )}>
                          {category.type === 'revenu' ? 'Revenu' : 'Dépense'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm text-gray-600 dark:text-dark-text-secondary">
                          {category.compte_comptable || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right">
                        <button
                          onClick={() => {
                            setDetailViewCategory(category);
                            setIsNewCategory(false);
                          }}
                          className="text-gray-600 dark:text-dark-text-secondary hover:text-gray-700 dark:text-dark-text-primary transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Carte des paramètres généraux */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-6 flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Paramètres généraux
            </h2>
            
            <div className="space-y-6">
              {/* Nom du club */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Building2 className="inline h-4 w-4 mr-1" />
                  Nom du club
                </label>
                <input
                  type="text"
                  value={generalSettings.clubName}
                  onChange={(e) => updateGeneralSetting('clubName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Nom du club"
                />
              </div>
              
              {/* Année fiscale */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Année fiscale courante
                </label>
                <input
                  type="number"
                  value={generalSettings.fiscalYear}
                  onChange={(e) => updateGeneralSetting('fiscalYear', parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="2024"
                  min="2020"
                  max="2030"
                />
              </div>
              
              {/* Devise */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Euro className="inline h-4 w-4 mr-1" />
                  Devise
                </label>
                <select
                  value={generalSettings.currency}
                  onChange={(e) => updateGeneralSetting('currency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                >
                  <option value="EUR">EUR - Euro</option>
                  <option value="USD">USD - Dollar américain</option>
                  <option value="CHF">CHF - Franc suisse</option>
                  <option value="GBP">GBP - Livre sterling</option>
                </select>
              </div>
            </div>
          </div>
          
          {/* Carte des paramètres de double approbation */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-6 flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Paramètres de double approbation
            </h2>
            
            <div className="space-y-6">
              {/* Activation de la double approbation */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                    Double approbation requise
                  </label>
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-1">
                    Active la validation à deux personnes pour les montants élevés
                  </p>
                </div>
                <button
                  onClick={() => updateGeneralSetting('enableDoubleApproval', !generalSettings.enableDoubleApproval)}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    generalSettings.enableDoubleApproval
                      ? "text-green-600 hover:bg-green-50"
                      : "text-gray-400 hover:bg-gray-100"
                  )}
                >
                  {generalSettings.enableDoubleApproval ? (
                    <ToggleRight className="h-8 w-8" />
                  ) : (
                    <ToggleLeft className="h-8 w-8" />
                  )}
                </button>
              </div>
              
              {/* Montant seuil pour double approbation */}
              {generalSettings.enableDoubleApproval && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Montant seuil pour double signature
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={generalSettings.doubleApprovalThreshold}
                      onChange={(e) => updateGeneralSetting('doubleApprovalThreshold', parseInt(e.target.value))}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                      placeholder="100"
                      min="0"
                      step="10"
                    />
                    <span className="text-gray-500 dark:text-dark-text-muted font-medium">
                      {generalSettings.currency}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-2">
                    Les dépenses supérieures à ce montant nécessiteront l'approbation de deux personnes
                  </p>
                </div>
              )}
              
              {/* Message d'information */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Information sur la double approbation</p>
                    <p className="text-sm text-blue-700 mt-1">
                      {generalSettings.enableDoubleApproval ? (
                        <>Les dépenses de plus de {generalSettings.doubleApprovalThreshold} {generalSettings.currency} nécessiteront
                        l'approbation de deux personnes autorisées avant de pouvoir être remboursées.</>
                      ) : (
                        "La double approbation est désactivée. Toutes les dépenses peuvent être approuvées par une seule personne."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Bouton de sauvegarde */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={saveGeneralSettings}
                className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Sauvegarder les paramètres
              </button>
            </div>
          </div>

          {/* Carte des paramètres de téléchargement */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <Download className="h-6 w-6 text-blue-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Téléchargements des justificatifs</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Configuration du renommage automatique des fichiers téléchargés
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Option renommage automatique */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-dark-text-primary">Renommer automatiquement les fichiers</p>
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    Activer le renommage automatique avec le format personnalisable ci-dessous
                  </p>
                </div>
                <button
                  onClick={() => setDownloadSettings({ ...downloadSettings, autoRenameFiles: !downloadSettings.autoRenameFiles })}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    downloadSettings.autoRenameFiles ? "bg-green-600" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      downloadSettings.autoRenameFiles ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              {/* Format du nom de fichier (editable) */}
              {downloadSettings.autoRenameFiles && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                    Format du nom de fichier
                  </label>
                  <input
                    type="text"
                    value={downloadSettings.filenamePattern || ''}
                    onChange={(e) => setDownloadSettings({ ...downloadSettings, filenamePattern: e.target.value })}
                    placeholder="{ANNÉE}-{NUMÉRO} - {DATE} {DESCRIPTION}.{ext}"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Variables disponibles: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{`{ANNÉE}`}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{`{NUMÉRO}`}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{`{DATE}`}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{`{DESCRIPTION}`}</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{`{ext}`}</code>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Exemple: <span className="font-mono">2025-00175 - 2025 10 22 Coltri liée à LEMAITRE GEOFFROY.pdf</span>
                  </p>
                </div>
              )}

              {/* Option utiliser numéro de transaction */}
              {downloadSettings.autoRenameFiles && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-dark-text-primary">Utiliser le numéro de transaction bancaire</p>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                      Si une transaction est liée, utiliser son numéro de séquence au lieu de l'ID de la demande
                    </p>
                  </div>
                  <button
                    onClick={() => setDownloadSettings({ ...downloadSettings, useTransactionNumber: !downloadSettings.useTransactionNumber })}
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                      downloadSettings.useTransactionNumber ? "bg-green-600" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        downloadSettings.useTransactionNumber ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              )}

              {/* Bouton Sauvegarder */}
              <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={async () => {
                    if (!clubId) return;
                    try {
                      await FirebaseSettingsService.saveDownloadSettings(clubId, downloadSettings, 'current-user');
                      toast.success('Paramètres de téléchargement sauvegardés');
                    } catch (error) {
                      toast.error('Erreur lors de la sauvegarde');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </button>
              </div>
            </div>
          </div>

          {/* Carte d'import de données */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import de données
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Importez vos données dans CalyCompta</p>
                  <p className="mb-2">Page centralisée pour tous les imports de données:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Transactions bancaires (CSV - BNP, KBC, ING, Belfius)</li>
                    <li>Événements VP Dive (XLS)</li>
                    <li>Membres depuis iClubSport (Excel)</li>
                    <li>Dépenses avec IA (PDF, images)</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/parametres/import-batch')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
            >
              <Upload className="h-5 w-5" />
              Accéder à la page d'import
            </button>
          </div>

          {/* Carte de liaison automatique */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Liaison automatique des dépenses
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Matching intelligent</p>
                  <p>Associez automatiquement les transactions bancaires de remboursement aux demandes approuvées.</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Comparaison du montant exact</li>
                    <li>Analyse du nom du bénéficiaire</li>
                    <li>Vérification des dates de transaction</li>
                    <li>Score de confiance pour chaque correspondance</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigate('/parametres/auto-link-expenses')}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Link2 className="h-5 w-5" />
              Lier les dépenses automatiquement
            </button>
          </div>

          {/* Carte de nettoyage des doublons */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-blue-200 p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-4 flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Maintenance des données
            </h2>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">Nettoyage des doublons</p>
                  <p>Supprime les liaisons en double dans les matched_entities et corrige les types incorrects.</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleCleanDuplicates}
              disabled={cleaning}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {cleaning ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Nettoyage en cours...
                </>
              ) : (
                <>
                  <Link2 className="h-5 w-5" />
                  Nettoyer les doublons de liaisons
                </>
              )}
            </button>

            {/* Progress bar pour le nettoyage */}
            {cleaning && cleanProgress.total > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">{cleanProgress.message}</span>
                  <span className="text-sm text-blue-700">
                    {cleanProgress.fixed} corrigées / {cleanProgress.current}/{cleanProgress.total}
                  </span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(cleanProgress.current / cleanProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Carte de suppression des données */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-red-200 p-6">
            <h2 className="text-lg font-semibold text-red-900 mb-4 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Zone dangereuse - Suppression des données
            </h2>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-800">
                  <p className="font-medium mb-1">⚠️ Actions irréversibles</p>
                  <p>Les suppressions ci-dessous sont définitives et ne peuvent pas être annulées.</p>
                  <p className="mt-2">Vous pouvez supprimer les données par catégorie ou tout supprimer en une fois.</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* Supprimer les transactions bancaires */}
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <Receipt className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-red-900">Transactions bancaires</h3>
                      <p className="text-sm text-red-700 mt-1">
                        Supprime toutes les transactions importées depuis les fichiers CSV.
                        Les liaisons avec activités et dépenses seront perdues.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDeleteTransactions}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Receipt className="h-4 w-4" />
                      Supprimer les transactions
                    </>
                  )}
                </button>
              </div>

              {/* Supprimer les activités */}
              <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <CalendarX className="h-5 w-5 text-orange-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-orange-900">Activités</h3>
                      <p className="text-sm text-orange-700 mt-1">
                        Supprime toutes les activités importées, les participants et les liaisons avec transactions.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDeleteEvents}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <CalendarX className="h-4 w-4" />
                      Supprimer les activités
                    </>
                  )}
                </button>
              </div>

              {/* Supprimer les dépenses */}
              <div className="border border-pink-200 rounded-lg p-4 bg-pink-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-pink-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-pink-900">Dépenses</h3>
                      <p className="text-sm text-pink-700 mt-1">
                        Supprime toutes les demandes de remboursement et leurs liaisons.
                        Les documents justificatifs resteront dans le stockage.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDeleteExpenses}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Supprimer les dépenses
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-blue-300"></div>
                <span className="text-sm font-semibold text-blue-700 uppercase">Maintenance</span>
                <div className="flex-1 h-px bg-blue-300"></div>
              </div>

              {/* Nettoyer les liaisons orphelines */}
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <Link2 className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-blue-900">Nettoyer les liaisons orphelines</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        Supprime les liaisons vers des dépenses, activités ou participants qui ont été supprimés.
                        <span className="font-medium"> Aucune donnée ne sera supprimée</span>, seulement les références invalides.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleCleanOrphanLinks}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Nettoyage en cours...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      Nettoyer les liaisons
                    </>
                  )}
                </button>
              </div>

              {/* Réparer les statuts de réconciliation */}
              <div className="border border-green-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-green-900">Réparer les statuts de réconciliation</h3>
                      <p className="text-sm text-green-700 mt-1">
                        Recalcule les statuts "réconcilié" de toutes les transactions en fonction de leurs liaisons réelles.
                        <span className="font-medium"> Corrige les incohérences</span> (ex: transaction sans liaison marquée réconciliée).
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleRepairReconciliation}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Réparation en cours...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Réparer les statuts
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-red-300"></div>
                <span className="text-sm font-semibold text-red-700 uppercase">Suppression totale</span>
                <div className="flex-1 h-px bg-red-300"></div>
              </div>

              {/* Supprimer TOUTES les données */}
              <div className="border-2 border-red-600 rounded-lg p-4 bg-red-100">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <Trash2 className="h-5 w-5 text-red-800 mt-0.5" />
                    <div>
                      <h3 className="font-bold text-red-900 text-lg">🔴 Supprimer TOUTES les données</h3>
                      <p className="text-sm text-red-800 mt-1 font-medium">
                        Supprime TOUT : transactions, activités ET dépenses.
                        Cette action est irréversible. Utilisez avec précaution extrême.
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleDeleteAllData}
                  disabled={deleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors disabled:opacity-50 font-semibold"
                >
                  {deleting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Suppression en cours...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-5 w-5" />
                      SUPPRIMER TOUT
                    </>
                  )}
                </button>
              </div>

              {/* Progress bar pour la suppression */}
              {deleting && deleteProgress.total > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-red-900">{deleteProgress.message}</span>
                    <span className="text-sm text-red-700">{deleteProgress.current}/{deleteProgress.total}</span>
                  </div>
                  <div className="w-full bg-red-200 rounded-full h-2">
                    <div
                      className="bg-red-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fiscal_years' && (
        <FiscalYearsManagement />
      )}

      {activeTab === 'permissions' && (
        <PermissionsManagement />
      )}

      {activeTab === 'value_lists' && (
        <ValueListsSettings />
      )}

      {activeTab === 'security' && (
        <SecuritySettings />
      )}

      {activeTab === 'ai' && (
        <AISettings />
      )}

      {activeTab === 'data' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">
              Maintenance des données
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-6">
              Outils de nettoyage et maintenance de la base de données
            </p>
            <DuplicateCleanup />
          </div>

          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">
              🔗 Multi-Linked Transactions
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-6">
              Trouvez et corrigez les transacties avec des liens dupliqués dans matched_entities
            </p>
            <FindDuplicateLinks />
          </div>
        </div>
      )}

      {activeTab === 'communication' && (
        <CommunicationSettings />
      )}

      {/* Modal de détail du code comptable */}
      <AccountCodeDetailView
        accountCode={detailViewCode}
        isOpen={!!detailViewCode}
        onClose={() => setDetailViewCode(null)}
        onSave={handleUpdateCode}
        onDelete={handleDeleteCode}
      />
      
      {/* Modal de détail de la catégorie */}
      <CategoryDetailView
        category={detailViewCategory}
        isOpen={!!detailViewCategory || isNewCategory}
        isNew={isNewCategory}
        onClose={() => {
          setDetailViewCategory(null);
          setIsNewCategory(false);
        }}
        onSave={handleUpdateCategory}
        onDelete={handleDeleteCategory}
        onNavigate={(direction) => {
          if (!detailViewCategory) return;
          const currentIndex = categories.findIndex(c => c.id === detailViewCategory.id);
          if (direction === 'prev' && currentIndex > 0) {
            setDetailViewCategory(categories[currentIndex - 1]);
          } else if (direction === 'next' && currentIndex < categories.length - 1) {
            setDetailViewCategory(categories[currentIndex + 1]);
          }
        }}
        canNavigatePrev={detailViewCategory ? categories.findIndex(c => c.id === detailViewCategory.id) > 0 : false}
        canNavigateNext={detailViewCategory ? categories.findIndex(c => c.id === detailViewCategory.id) < categories.length - 1 : false}
      />
    </div>
  );
}