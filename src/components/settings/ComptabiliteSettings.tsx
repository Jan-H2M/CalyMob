import React, { useState, useEffect, useMemo } from 'react';
import {
  BookOpen,
  Tag,
  Calendar,
  Search,
  Filter,
  Check,
  X,
  Star,
  Save,
  Plus,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { AccountCode, Categorie } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { getCalypsoAccountCodes } from '@/config/calypso-accounts';
import { AccountCodeDetailView } from './AccountCodeDetailView';
import { CategoryDetailView } from './CategoryDetailView';
import { FiscalYearsManagement } from './FiscalYearsManagement';
import { cn, getCategoryColorClasses } from '@/utils/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'plan_comptable' | 'categories' | 'annees';

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
  const [frequentCodes, setFrequentCodes] = useState<Set<string>>(new Set());

  // États pour le tri (account codes)
  type SortColumn = 'selected' | 'frequent' | 'code' | 'label' | 'type' | 'category';
  type SortDirection = 'asc' | 'desc' | null;
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [sortPattern, setSortPattern] = useState<string>('');

  // États pour Catégories
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [detailViewCategory, setDetailViewCategory] = useState<Categorie | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);

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

        // Charger le cache
        const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
        loadAccountCodesCache(accountCodesSettings.customCodes, accountCodesSettings.selectedCodes);
      } catch (error) {
        console.error('Erreur lors du chargement des données:', error);
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
          case 'frequent':
            comparison = (a.isFrequent ? 1 : 0) - (b.isFrequent ? 1 : 0);
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
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

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
        const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
        settings.customCodes[codeStr] = updatedCode;
        await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, settings.selectedCodes);

        setAccountCodes(prev => prev.map(c => c.code === codeStr ? updatedCode : c));
        setFilteredCodes(prev => prev.map(c => c.code === codeStr ? updatedCode : c));

        const newFrequents = new Set(frequentCodes);
        if (updatedCode.isFrequent) {
          newFrequents.add(codeStr);
        } else {
          newFrequents.delete(codeStr);
        }
        setFrequentCodes(newFrequents);

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
      const settings = await FirebaseSettingsService.loadAccountCodesSettings(clubId);
      settings.customCodes[updatedCode.code] = updatedCode;
      await FirebaseSettingsService.saveAccountCodesSettings(clubId, settings.customCodes, settings.selectedCodes);

      setAccountCodes(prev => prev.map(code =>
        code.code === updatedCode.code ? updatedCode : code
      ));
      setFilteredCodes(prev => prev.map(code =>
        code.code === updatedCode.code ? updatedCode : code
      ));

      const { loadAccountCodesCache } = await import('@/config/calypso-accounts');
      loadAccountCodesCache(settings.customCodes, settings.selectedCodes);
    } catch (error) {
      console.error('Erreur lors de la sauvegarde:', error);
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
      return <ArrowUpDown className="h-3 w-3 text-gray-400" />;
    }
    if (categorySortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 text-calypso-blue" />;
    }
    return <ArrowDown className="h-3 w-3 text-calypso-blue" />;
  };

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
      sorted.sort((a, b) => {
        if (a.isFrequent && !b.isFrequent) return -1;
        if (!a.isFrequent && b.isFrequent) return 1;
        return a.nom.localeCompare(b.nom);
      });
    }

    return sorted;
  }, [categories, categorySortColumn, categorySortDirection]);

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
      console.error('Erreur lors de la sauvegarde de la catégorie:', error);
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
      console.error('Erreur lors de la suppression de la catégorie:', error);
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
        console.error('Erreur lors de la mise à jour de la catégorie:', error);
        toast.error('Erreur lors de la mise à jour');
      }
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
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
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
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
            )}
          >
            <div className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Catégories
            </div>
          </button>
          <button
            onClick={() => setActiveTab('annees')}
            className={cn(
              'px-6 py-3 font-medium text-sm border-b-2 transition-colors',
              activeTab === 'annees'
                ? 'border-calypso-blue text-calypso-blue dark:text-calypso-aqua'
                : 'border-transparent text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary'
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
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                    onClick={saveSelectedCodes}
                    className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    Sauvegarder
                  </button>
                </div>
              </div>

              {/* Sort Pattern Input */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
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
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        ✓
                        <SortIcon column="selected" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('frequent')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        ★
                        <SortIcon column="frequent" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('code')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Code
                        <SortIcon column="code" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('label')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Libellé
                        <SortIcon column="label" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('type')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Type
                        <SortIcon column="type" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleSort('category')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
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
                      className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer"
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
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFrequent(code.code);
                          }}
                          className={cn(
                            "transition-colors",
                            code.isFrequent ? "text-yellow-500" : "text-gray-300 dark:text-gray-600 hover:text-yellow-500"
                          )}
                        >
                          <Star className={cn("h-5 w-5", code.isFrequent && "fill-current")} />
                        </button>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-gray-900 dark:text-dark-text-primary">
                        {code.code}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-dark-text-secondary">
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
                          {code.type === 'revenue' && 'Produit'}
                          {code.type === 'expense' && 'Charge'}
                          {code.type === 'asset' && 'Actif'}
                          {code.type === 'liability' && 'Passif'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {code.category ? (() => {
                          const categoryNames: Record<string, string> = {
                            'sorties': 'Sorties plongées',
                            'cotisations': 'Cotisations',
                            'evenements': 'Événements',
                            'assurances': 'Assurances',
                            'reunions': 'Réunions',
                            'subsides': 'Subsides',
                            'frais_bancaires': 'Frais bancaires',
                            'formation': 'Formation',
                            'administration': 'Administration',
                            'piscine': 'Piscine',
                            'materiel': 'Matériel',
                            'boutique': 'Boutique',
                            'activites': 'Activités',
                            'divers': 'Divers',
                            'reports': 'Reports',
                            'bilan': 'Bilan'
                          };
                          return (
                            <span className="text-sm text-gray-700 dark:text-dark-text-secondary">
                              {categoryNames[code.category] || code.category}
                            </span>
                          );
                        })() : <span className="text-sm text-gray-500 dark:text-dark-text-muted">-</span>}
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
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                Catégories ({sortedCategories.length})
              </h3>
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('frequent')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        ★
                        <CategorySortIcon column="frequent" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('nom')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Nom
                        <CategorySortIcon column="nom" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('label_court')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Label court
                        <CategorySortIcon column="label_court" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('type')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Type
                        <CategorySortIcon column="type" />
                      </button>
                    </th>
                    <th className="px-6 py-3 text-left">
                      <button
                        onClick={() => handleCategorySort('compte_comptable')}
                        className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-dark-text-secondary uppercase tracking-wider hover:text-calypso-blue"
                      >
                        Code comptable
                        <CategorySortIcon column="compte_comptable" />
                      </button>
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
                      className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary cursor-pointer"
                    >
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCategoryFrequent(cat.id);
                          }}
                          className={cn(
                            "transition-colors",
                            cat.isFrequent ? "text-yellow-500" : "text-gray-300 dark:text-gray-600 hover:text-yellow-500"
                          )}
                        >
                          <Star className={cn("h-5 w-5", cat.isFrequent && "fill-current")} />
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-dark-text-primary font-medium">
                        {cat.nom}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 dark:text-dark-text-secondary">
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
                      <td className="px-6 py-4 text-sm font-mono text-gray-700 dark:text-dark-text-secondary">
                        {cat.compte_comptable || '-'}
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

        {activeTab === 'annees' && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <FiscalYearsManagement />
          </div>
        )}

        {/* Detail Views */}
        {detailViewCode && (
          <AccountCodeDetailView
            code={detailViewCode}
            onClose={() => setDetailViewCode(null)}
            onUpdate={handleUpdateCode}
          />
        )}

        {detailViewCategory && (
          <CategoryDetailView
            category={detailViewCategory}
            onClose={() => {
              setDetailViewCategory(null);
              setIsNewCategory(false);
            }}
            onUpdate={handleUpdateCategory}
            onDelete={handleDeleteCategory}
            isNew={isNewCategory}
          />
        )}
      </div>
    </div>
  );
}
