import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  BookOpen,
  Tag,
  Calendar,
  Search,
  Star,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  FolderOpen,
  FolderTree,
  RefreshCw,
} from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { AccountCode, Categorie } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { AccountCodeDetailView } from './AccountCodeDetailView';
import { CategoryDetailView } from './CategoryDetailView';
import { FiscalYearsManagement } from './FiscalYearsManagement';
import { ReportGroupsConfig } from './ReportGroupsConfig';
import { BilanCodesConfig } from './BilanCodesConfig';
import { cn, getCategoryColorClasses } from '@/utils/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'plan_comptable' | 'categories' | 'groupes_rapport' | 'codes_bilan' | 'annees';

export function ComptabiliteSettings() {
  const { clubId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('plan_comptable');

  // États pour Plan Comptable
  const [accountCodes, setAccountCodes] = useState<AccountCode[]>([]);
  const [filteredCodes, setFilteredCodes] = useState<AccountCode[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'revenue' | 'expense' | 'asset' | 'liability'>('all');
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [detailViewCode, setDetailViewCode] = useState<AccountCode | null>(null);
  const [isNewCode, setIsNewCode] = useState(false);

  // États pour le tri (account codes)
  type SortColumn = 'selected' | 'code' | 'label' | 'type' | 'category';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [sortPattern, setSortPattern] = useState<string>('');

  // États pour Catégories
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [detailViewCategory, setDetailViewCategory] = useState<Categorie | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');

  // États pour le tri (categories)
  type CategorySortColumn = 'frequent' | 'nom' | 'label_court' | 'type' | 'compte_comptable';
  const [categorySortColumn, setCategorySortColumn] = useState<CategorySortColumn | null>(null);
  const [categorySortDirection, setCategorySortDirection] = useState<SortDirection>(null);

  // Charger les données au montage
  useEffect(() => {
    const loadData = async () => {
      if (!clubId) return;

      try {
        // Charger les catégories
        const firebaseCategories = await FirebaseSettingsService.loadCategories(clubId);
        setCategories(firebaseCategories);
        CategorizationService.updateCategoriesCache(firebaseCategories);

        // Charger les codes comptables
        const accountCodesSettings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);

        // Codes Calypso de base, enrichis avec les personnalisations
        const calypsoCodes = AccountCodeService.isReady()
          ? AccountCodeService.getAllCodes()
          : calypsoAccountCodes;
        const calypsoCodesSet = new Set(calypsoCodes.map(c => c.code));

        let codes = calypsoCodes.map(code => {
          if (accountCodesSettings.customCodes[code.code]) {
            const customCode = accountCodesSettings.customCodes[code.code];

            // Smart merge: pour les categories, préférer customCode si défini, sinon base
            // Ceci évite les doublons causés par l'ancien système
            const mergedCategories = customCode.categories && customCode.categories.length > 0
              ? customCode.categories
              : code.categories;

            const merged = {
              ...code,
              ...customCode,
              categories: mergedCategories ? [...new Set(mergedCategories)] : undefined
            };

            // Supprimer l'ancien champ category s'il existe encore
            delete (merged as any).category;

            return merged;
          }
          return code;
        });

        // Ajouter les codes personnalisés qui ne sont pas dans la liste Calypso
        for (const [codeKey, codeValue] of Object.entries(accountCodesSettings.customCodes)) {
          const customCode = codeValue as AccountCode;
          if (!calypsoCodesSet.has(codeKey) && customCode.code && customCode.label) {
            codes.push(customCode);
          }
        }

        setAccountCodes(codes);
        setFilteredCodes(codes);

        // Codes sélectionnés
        if (accountCodesSettings.selectedCodes.length > 0) {
          setSelectedCodes(new Set(accountCodesSettings.selectedCodes));
        } else {
          setSelectedCodes(new Set(codes.map(c => c.code)));
        }

        // Rafraîchir le cache AccountCodeService
        await AccountCodeService.refresh(clubId);
      } catch (error) {
        logger.error('Erreur lors du chargement des données:', error);
        toast.error('Erreur lors du chargement des données');
      }
    };

    loadData();
  }, [clubId]);

  // Fonction pour extraire les parties d'un code selon un pattern
  const matchesPattern = (code: string, pattern: string): string[] => {
    const parts: string[] = [];
    for (let i = 0; i < pattern.length && i < code.length; i++) {
      const patternChar = pattern[i];
      const codeChar = code[i];
      if (patternChar === 'X') {
        parts.push(codeChar);
      }
    }
    return parts;
  };

  // Filtrer ET trier les codes
  useEffect(() => {
    let filtered = accountCodes;

    if (filterType !== 'all') {
      filtered = filtered.filter(code => code.type === filterType);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(code =>
        code.code.toLowerCase().includes(term) ||
        code.label.toLowerCase().includes(term)
      );
    }

    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;

        switch (sortColumn) {
          case 'selected':
            comparison = (selectedCodes.has(a.code) ? 1 : 0) - (selectedCodes.has(b.code) ? 1 : 0);
            break;
          case 'code':
            if (sortPattern && sortPattern.trim()) {
              const partsA = matchesPattern(a.code, sortPattern);
              const partsB = matchesPattern(b.code, sortPattern);
              for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const partA = partsA[i] || '';
                const partB = partsB[i] || '';
                if (partA !== partB) {
                  comparison = partA.localeCompare(partB);
                  break;
                }
              }
              if (comparison === 0) {
                comparison = a.code.localeCompare(b.code);
              }
            } else {
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

  // Gérer le tri
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

  // Basculer la sélection d'un code (avec auto-save)
  const toggleCodeSelection = async (code: string) => {
    if (!clubId) return;

    const newSelected = new Set(selectedCodes);
    if (newSelected.has(code)) {
      newSelected.delete(code);
    } else {
      newSelected.add(code);
    }
    setSelectedCodes(newSelected);

    // Auto-save
    try {
      const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
      await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, Array.from(newSelected));

      await AccountCodeService.refresh(clubId);
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Créer ou mettre à jour un code après édition
  const handleCreateOrUpdateCode = async (updatedCode: AccountCode) => {
    if (!clubId) return;

    try {
      const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
      settings.customCodes[updatedCode.code] = updatedCode;

      // Si c'est un nouveau code, l'ajouter aux codes sélectionnés
      const newSelectedCodes = isNewCode
        ? [...settings.selectedCodes, updatedCode.code]
        : settings.selectedCodes;

      await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, newSelectedCodes);

      if (isNewCode) {
        // Ajouter le nouveau code à la liste
        setAccountCodes(prev => [...prev, updatedCode]);
        setFilteredCodes(prev => [...prev, updatedCode]);
        setSelectedCodes(prev => new Set([...prev, updatedCode.code]));
      } else {
        // Mettre à jour le code existant
        setAccountCodes(prev => prev.map(code =>
          code.code === updatedCode.code ? updatedCode : code
        ));
        setFilteredCodes(prev => prev.map(code =>
          code.code === updatedCode.code ? updatedCode : code
        ));
      }

      await AccountCodeService.refresh(clubId);

      setIsNewCode(false);
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  // Gestion des catégories
  const handleCategorySort = (column: CategorySortColumn) => {
    if (categorySortColumn === column) {
      if (categorySortDirection === 'asc') {
        setCategorySortDirection('desc');
      } else if (categorySortDirection === 'desc') {
        setCategorySortDirection(null);
        setCategorySortColumn(null);
      }
    } else {
      setCategorySortColumn(column);
      setCategorySortDirection('asc');
    }
  };

  const CategorySortIcon = ({ column }: { column: CategorySortColumn }) => {
    if (categorySortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 text-gray-400 dark:text-dark-text-muted" />;
    }
    if (categorySortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

  const sortedCategories = useMemo(() => {
    let filtered = [...categories];

    // Filtrer par recherche
    if (categorySearchTerm) {
      const term = categorySearchTerm.toLowerCase();
      filtered = filtered.filter(cat =>
        cat.nom.toLowerCase().includes(term) ||
        (cat.label_court && cat.label_court.toLowerCase().includes(term)) ||
        (cat.compte_comptable && cat.compte_comptable.toLowerCase().includes(term))
      );
    }

    if (categorySortColumn && categorySortDirection) {
      filtered.sort((a, b) => {
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
      filtered.sort((a, b) => {
        if (a.isFrequent && !b.isFrequent) return -1;
        if (!a.isFrequent && b.isFrequent) return 1;
        return a.nom.localeCompare(b.nom);
      });
    }

    return filtered;
  }, [categories, categorySortColumn, categorySortDirection, categorySearchTerm]);

  const handleUpdateCategory = async (updatedCategory: Categorie) => {
    if (!clubId) return;

    try {
      await FirebaseSettingsService.saveCategory(clubId, updatedCategory);

      if (isNewCategory) {
        setCategories(prev => [...prev, updatedCategory]);
      } else {
        setCategories(prev => prev.map(cat =>
          cat.id === updatedCategory.id ? updatedCategory : cat
        ));
      }

      const updatedCategories = isNewCategory
        ? [...categories, updatedCategory]
        : categories.map(cat => cat.id === updatedCategory.id ? updatedCategory : cat);
      CategorizationService.updateCategoriesCache(updatedCategories);

      setIsNewCategory(false);
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde de la catégorie:', error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!clubId) return;

    try {
      await FirebaseSettingsService.deleteCategory(clubId, categoryId);
      const updatedCategories = categories.filter(cat => cat.id !== categoryId);
      setCategories(updatedCategories);
      CategorizationService.updateCategoriesCache(updatedCategories);
    } catch (error) {
      logger.error('Erreur lors de la suppression de la catégorie:', error);
      toast.error('Erreur lors de la suppression');
    }
  };

  const toggleCategoryFrequent = async (categoryId: string) => {
    if (!clubId) return;

    const category = categories.find(c => c.id === categoryId);
    if (category) {
      const updatedCategory = { ...category, isFrequent: !category.isFrequent };

      try {
        await FirebaseSettingsService.saveCategory(clubId, updatedCategory);
        setCategories(prev => prev.map(cat =>
          cat.id === categoryId ? updatedCategory : cat
        ));

        const updatedCategories = categories.map(cat =>
          cat.id === categoryId ? updatedCategory : cat
        );
        CategorizationService.updateCategoriesCache(updatedCategories);

        toast.success(updatedCategory.isFrequent ? 'Catégorie ajoutée aux favoris' : 'Catégorie retirée des favoris');
      } catch (error) {
        logger.error('Erreur lors de la mise à jour de la catégorie:', error);
        toast.error('Erreur lors de la mise à jour');
      }
    }
  };

  const handleResetCategories = async () => {
    if (!clubId) return;

    const confirmed = window.confirm(
      '🔄 Réinitialiser les catégories aux valeurs par défaut\n\n' +
      'Ceci va remplacer toutes les catégories existantes par les catégories par défaut avec les codes comptables correctement configurés.\n\n' +
      'Êtes-vous sûr de vouloir continuer?'
    );

    if (!confirmed) return;

    try {
      await FirebaseSettingsService.resetCategoriesToDefault(clubId);
      const newCategories = await FirebaseSettingsService.loadCategories(clubId);
      setCategories(newCategories);
      CategorizationService.updateCategoriesCache(newCategories);
      toast.success('Catégories réinitialisées avec succès');
    } catch (error) {
      logger.error('Erreur lors de la réinitialisation des catégories:', error);
      toast.error('Erreur lors de la réinitialisation');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Comptabilité']}
          title="Comptabilité"
          description="Plan comptable, catégories et années fiscales"
        />

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-dark-border mb-6">
          <button
            onClick={() => setActiveTab('plan_comptable')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'plan_comptable'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Plan Comptable
            </div>
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'categories'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Catégories
            </div>
          </button>
          <button
            onClick={() => setActiveTab('groupes_rapport')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'groupes_rapport'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Groupes de Rapport
            </div>
          </button>
          <button
            onClick={() => setActiveTab('codes_bilan')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'codes_bilan'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4" />
              Codes de Bilan
            </div>
          </button>
          <button
            onClick={() => setActiveTab('annees')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'annees'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Années Fiscales
            </div>
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'plan_comptable' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
            {/* Header avec filtres */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-border">
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="text"
                      placeholder="Rechercher un code ou libellé..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                    className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                  >
                    <option value="all">Tous les types</option>
                    <option value="revenue">💰 Rentrées</option>
                    <option value="expense">💸 Sorties</option>
                  </select>
                  <button
                    onClick={() => {
                      setDetailViewCode({
                        code: '',
                        label: '',
                        type: 'expense'
                      });
                      setIsNewCode(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Nouveau code
                  </button>
                </div>
              </div>

              {/* Sort Pattern Input */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Pattern de tri (optionnel) - Ex: ".XX-..-..""
                </label>
                <input
                  type="text"
                  placeholder="Ex: .XX-..-.."
                  value={sortPattern}
                  onChange={(e) => setSortPattern(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('selected')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                        title="Codes actifs sont visibles dans le sélecteur de compte"
                      >
                        Actif
                        <SortIcon column="selected" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Code
                        <SortIcon column="code" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('label')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Libellé
                        <SortIcon column="label" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('type')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Type
                        <SortIcon column="type" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Catégorie
                        <SortIcon column="category" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {filteredCodes.map((code) => (
                    <tr
                      key={code.code}
                      onClick={() => setDetailViewCode(code)}
                      className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedCodes.has(code.code)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleCodeSelection(code.code);
                          }}
                          className="h-4 w-4 text-calypso-blue rounded focus:ring-calypso-blue"
                        />
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-gray-900 dark:text-dark-text-primary">
                        {code.code}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-dark-text-primary">
                        {code.label}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          code.type === 'revenue' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                          code.type === 'expense' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                          code.type === 'asset' && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
                          code.type === 'liability' && "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                        )}>
                          {code.type === 'revenue' && 'Revenu'}
                          {code.type === 'expense' && 'Dépense'}
                          {code.type === 'asset' && 'Actif'}
                          {code.type === 'liability' && 'Passif'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {code.categories && code.categories.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {code.categories.map(catId => {
                              const cat = categories.find(c => c.id === catId);
                              return (
                                <span
                                  key={catId}
                                  className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary"
                                >
                                  {cat?.nom || catId}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-dark-text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCodes.length === 0 && (
              <div className="p-12 text-center text-gray-500 dark:text-dark-text-muted">
                Aucun code comptable trouvé
              </div>
            )}
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-dark-border">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Catégories
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Catégories simplifiées pour la saisie rapide des transactions (raccourcis vers les codes comptables)
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                    <input
                      type="text"
                      placeholder="Rechercher une catégorie..."
                      value={categorySearchTerm}
                      onChange={(e) => setCategorySearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
                    {sortedCategories.length} catégorie{sortedCategories.length > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={handleResetCategories}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors border border-orange-300"
                    title="Réinitialiser aux valeurs par défaut"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Réinitialiser
                  </button>
                  <button
                    onClick={() => {
                      setDetailViewCategory({
                        id: `cat-${Date.now()}`,
                        nom: '',
                        label_court: '',
                        type: 'depense',
                        compte_comptable: '',
                        isFrequent: false
                      });
                      setIsNewCategory(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Nouvelle catégorie
                  </button>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('frequent')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        ★
                        <CategorySortIcon column="frequent" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('nom')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Nom
                        <CategorySortIcon column="nom" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('label_court')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Label court
                        <CategorySortIcon column="label_court" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('type')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Type
                        <CategorySortIcon column="type" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <span className="text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider">
                        Codes
                      </span>
                    </th>
                    <th className="px-6 py-3 text-right">
                      <span className="text-xs font-medium text-gray-700 dark:text-dark-text-primary uppercase tracking-wider">
                        Actions
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {sortedCategories.map((cat) => (
                    <tr
                      key={cat.id}
                      onClick={() => {
                        setDetailViewCategory(cat);
                        setIsNewCategory(false);
                      }}
                      className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategoryFrequent(cat.id);
                          }}
                          className={cn(
                            "transition-colors",
                            cat.isFrequent ? "text-yellow-500" : "text-gray-300 dark:text-dark-text-secondary hover:text-yellow-500"
                          )}
                        >
                          <Star className={cn("h-5 w-5", cat.isFrequent && "fill-current")} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-dark-text-primary font-medium">
                        {cat.nom}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-dark-text-primary">
                        {cat.label_court || cat.nom.split(' ')[0]}
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2 py-1 text-xs rounded-full",
                          cat.type === 'revenu' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                          cat.type === 'depense' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        )}>
                          {cat.type === 'revenu' ? 'Revenu' : 'Dépense'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-dark-text-primary">
                        {cat.selectedCodes && cat.selectedCodes.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full text-xs">
                            {cat.selectedCodes.length} code{cat.selectedCodes.length > 1 ? 's' : ''}
                          </span>
                        ) : cat.compte_comptable ? (
                          <span className="font-mono text-gray-500 dark:text-dark-text-muted" title="Ancien système (préfixe)">
                            {cat.compte_comptable}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-dark-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailViewCategory(cat);
                            setIsNewCategory(false);
                          }}
                          className="p-1 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary dark:hover:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded transition-colors"
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

            {sortedCategories.length === 0 && (
              <div className="p-12 text-center text-gray-500 dark:text-dark-text-muted">
                Aucune catégorie trouvée
              </div>
            )}
          </div>
        )}

        {activeTab === 'groupes_rapport' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <ReportGroupsConfig />
          </div>
        )}

        {activeTab === 'codes_bilan' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <BilanCodesConfig />
          </div>
        )}

        {activeTab === 'annees' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <FiscalYearsManagement />
          </div>
        )}

        {/* Detail Views */}
        {detailViewCode && (
          <AccountCodeDetailView
            accountCode={detailViewCode}
            isOpen={!!detailViewCode}
            onClose={() => {
              setDetailViewCode(null);
              setIsNewCode(false);
            }}
            onSave={handleCreateOrUpdateCode}
            isNew={isNewCode}
            categories={categories}
          />
        )}

        {detailViewCategory && (
          <CategoryDetailView
            category={detailViewCategory}
            isOpen={!!detailViewCategory}
            onClose={() => {
              setDetailViewCategory(null);
              setIsNewCategory(false);
            }}
            onSave={handleUpdateCategory}
            onDelete={handleDeleteCategory}
            isNew={isNewCategory}
          />
        )}
      </div>
    </div>
  );
}
