import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/utils/logger';
import {
  X,
  Search,
  Check,
  FileText,
  Trash2,
  HelpCircle
} from 'lucide-react';
import { AccountCode, Categorie, TransactionBancaire } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { AccountCodeService } from '@/services/accountCodeService';
import { cn } from '@/utils/utils';

interface AccountCodeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  onNotFound?: () => void; // NEW: Called when user indicates no appropriate code found
  initialCode?: string;
  isExpense?: boolean;
  counterpartyName?: string; // Deprecated - use transaction instead
  clubId?: string; // Voor suggesties
  transaction?: TransactionBancaire; // NEW: Full transaction for keyword-based suggestions
  allowClear?: boolean; // Allow clearing the code (for batch operations)
}

interface GroupedCodes {
  groupName: string;
  groupIcon: string;
  codes: AccountCode[];
}

export function AccountCodeSelectorModal({
  isOpen,
  onClose,
  onSelect,
  onNotFound,
  initialCode,
  isExpense = false,
  counterpartyName,
  clubId,
  transaction,
  allowClear = false
}: AccountCodeSelectorModalProps) {
  // State
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null); // null = "Tous"

  // Direction state: 'sortie' (geld UIT) of 'entree' (geld IN)
  // Bepaalt welke tabs zichtbaar zijn:
  // - sortie: Dépenses (expense) + Actifs (asset)
  // - entree: Revenus (revenue) + Passifs (liability)
  const [direction, setDirection] = useState<'sortie' | 'entree'>(isExpense ? 'sortie' : 'entree');

  // Tab state: 'primary' (expense/revenue) of 'secondary' (asset/liability)
  const [activeTab, setActiveTab] = useState<'primary' | 'secondary'>('primary');

  // Data
  const [allCodes, setAllCodes] = useState<AccountCode[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [suggestions, setSuggestions] = useState<{ category: string; accountCode: string; count: number; score?: number; categoryLabel?: string; codeLabel?: string; matchReason?: string }[]>([]);

  // Charger codes et catégories à chaque ouverture du modal
  useEffect(() => {
    if (isOpen) {
      // Si clubId est fourni, charger les codes ET catégories depuis Firebase
      if (clubId) {
        // Charger les codes comptables (base + custom)
        // Load codes from AccountCodeService (already includes custom codes)
        if (AccountCodeService.isReady()) {
          setAllCodes(AccountCodeService.getActiveCodes());
        } else {
          // If not ready yet, load from Firebase settings as fallback
          FirebaseSettingsService.loadAccountCodesSettings(clubId).then(accountCodesSettings => {
            const { calypsoAccountCodes } = require('@/config/calypso-accounts');
            const calypsoCodesSet = new Set(calypsoAccountCodes.map((c: AccountCode) => c.code));

            // Merge: codes de base enrichis avec personnalisations
            let codes = calypsoAccountCodes.map((code: AccountCode) => {
              if (accountCodesSettings.customCodes[code.code]) {
                return { ...code, ...accountCodesSettings.customCodes[code.code] };
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

            setAllCodes(codes);
          }).catch(() => {
            // Fallback sur les codes de base
            const { calypsoAccountCodes } = require('@/config/calypso-accounts');
            setAllCodes(calypsoAccountCodes);
          });
        }

        // Charger les catégories depuis Firebase
        FirebaseSettingsService.loadCategories(clubId).then(firebaseCategories => {
          setCategories(firebaseCategories);
          CategorizationService.updateCategoriesCache(firebaseCategories);
        }).catch(() => {
          const cats = CategorizationService.getAllCategories();
          setCategories(cats);
        });
      } else {
        // Pas de clubId, utiliser le cache local
        setAllCodes(CategorizationService.getAllAccountCodes());
        setCategories(CategorizationService.getAllCategories());
      }
    }
  }, [isOpen, clubId]);

  // CRITICAL: Synchroniseer initialCode wanneer modal opent OF initialCode verandert
  useEffect(() => {
    if (isOpen) {
      // Reset alles naar initiële state
      setSelectedCode(initialCode || '');
      setSearchQuery('');
      setSelectedCategoryId(null);

      // Set direction based on isExpense prop (default)
      const defaultDirection = isExpense ? 'sortie' : 'entree';
      setDirection(defaultDirection);
      setActiveTab('primary');

      // Override direction/tab based on initialCode type if provided
      if (initialCode && allCodes.length > 0) {
        const codeObj = allCodes.find(c => c.code === initialCode);
        if (codeObj) {
          if (codeObj.type === 'revenue') {
            setDirection('entree');
            setActiveTab('primary');
          } else if (codeObj.type === 'expense') {
            setDirection('sortie');
            setActiveTab('primary');
          } else if (codeObj.type === 'asset') {
            setDirection('sortie');
            setActiveTab('secondary');
          } else if (codeObj.type === 'liability') {
            setDirection('entree');
            setActiveTab('secondary');
          }
        }
      }
    }
  }, [isOpen, initialCode, allCodes, isExpense]);

  // Load suggestions when modal opens with transaction (keyword-based)
  useEffect(() => {
    if (isOpen && clubId && transaction) {
      CategorizationService.getSuggestionsFromHistory(clubId, transaction)
        .then(results => {
          // Filter op basis van transactierichting:
          // - isExpense (montant < 0): alleen expense/asset codes
          // - !isExpense (montant > 0): alleen revenue/liability codes
          const filteredResults = results.filter(suggestion => {
            const codeObj = allCodes.find(c => c.code === suggestion.accountCode);
            if (!codeObj) return true; // Behoud als code niet gevonden (safety)

            if (isExpense) {
              // Uitgave: alleen expense of asset codes
              return codeObj.type === 'expense' || codeObj.type === 'asset';
            } else {
              // Inkomst: alleen revenue of liability codes
              return codeObj.type === 'revenue' || codeObj.type === 'liability';
            }
          });

          // Dédupliquer par accountCode, garder celui avec le score le plus élevé
          const uniqueMap = new Map<string, typeof results[0]>();
          for (const suggestion of filteredResults) {
            const existing = uniqueMap.get(suggestion.accountCode);
            if (!existing || (suggestion.score || 0) > (existing.score || 0)) {
              uniqueMap.set(suggestion.accountCode, suggestion);
            }
          }
          // Trier par score décroissant
          const sorted = Array.from(uniqueMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
          setSuggestions(sorted);
        })
        .catch(error => {
          logger.error('[AccountCodeSelectorModal] Error loading suggestions:', error);
          setSuggestions([]);
        });
    } else {
      setSuggestions([]);
    }
  }, [isOpen, clubId, transaction?.id, allCodes, isExpense]);

  // Grouped codes avec memoization - SPLIT BY DIRECTION (sortie/entree) and TAB (primary/secondary)
  // Direction determines which types are available:
  // - sortie (geld UIT): primary=expense, secondary=asset
  // - entree (geld IN): primary=revenue, secondary=liability
  const groupedCodesByDirection = useMemo<{ primary: GroupedCodes[], secondary: GroupedCodes[] }>(() => {
    // Category filter - only apply for primary tab (expense/revenue have categories)
    let filtered = allCodes;
    if (selectedCategoryId && activeTab === 'primary') {
      filtered = filtered.filter(c => c.categories?.includes(selectedCategoryId));
    }

    // Search filter (accent-insensitive)
    if (searchQuery.trim()) {
      const normalizeAccents = (str: string) =>
        str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const query = normalizeAccents(searchQuery);
      filtered = filtered.filter(c =>
        normalizeAccents(c.code).includes(query) ||
        normalizeAccents(c.label).includes(query)
      );
    }

    // Split by direction and tab
    const primaryType = direction === 'sortie' ? 'expense' : 'revenue';
    const secondaryType = direction === 'sortie' ? 'asset' : 'liability';

    const primaryCodes = filtered.filter(c => c.type === primaryType);
    const secondaryCodes = filtered.filter(c => c.type === secondaryType);

    // Group helper function
    const groupCodes = (codes: AccountCode[]): GroupedCodes[] => {
      const groups: { [key: string]: AccountCode[] } = {};
      codes.forEach(code => {
        const prefix = code.code.substring(0, 3);
        if (!groups[prefix]) {
          groups[prefix] = [];
        }
        groups[prefix].push(code);
      });

      // Map naar GroupedCodes met namen en iconen
      const groupMapping: { [key: string]: { name: string; icon: string } } = {
        // Revenus
        '15-': { name: 'SUBSIDES', icon: '💰' },
        '618': { name: 'SORTIES', icon: '🏊' },
        '617': { name: 'SORTIES MER', icon: '🌊' },
        '619': { name: 'ACTIVITÉS', icon: '🎯' },
        '664': { name: 'ÉVÉNEMENTS', icon: '🎉' },
        '700': { name: 'PISCINE', icon: '🏊' },
        '730': { name: 'COTISATIONS', icon: '👥' },
        '750': { name: 'INTÉRÊTS', icon: '💰' },
        '764': { name: 'ÉVÉNEMENTS', icon: '🎉' },
        // Dépenses
        '600': { name: 'STOCK', icon: '📦' },
        '604': { name: 'BOUTIQUE', icon: '🏪' },
        '610': { name: 'LOCATIONS', icon: '🏢' },
        '611': { name: 'ASSURANCES', icon: '🛡️' },
        '612': { name: 'MATÉRIEL', icon: '🤿' },
        '613': { name: 'RÉUNIONS', icon: '👥' },
        '614': { name: 'ADMINISTRATION', icon: '💼' },
        '615': { name: 'ACTIVITÉS', icon: '🎯' },
        '616': { name: 'FORMATION', icon: '📚' },
        '620': { name: 'DIVERS', icon: '📊' },
        '630': { name: 'AMORTISSEMENTS', icon: '📉' },
        '657': { name: 'FRAIS BANCAIRES', icon: '🏦' },
        '713': { name: 'STOCK', icon: '📦' },
        // Bilan
        '240': { name: 'IMMOBILISATIONS', icon: '🏗️' },
        '260': { name: 'AMORT. ACTÉS', icon: '📉' },
        '340': { name: 'STOCKS', icon: '📦' },
        '439': { name: 'CAUTIONS', icon: '🔐' },
        '490': { name: 'CHARGES À REPORTER', icon: '📅' },
        '493': { name: 'PRODUITS CONSTATÉS', icon: '📅' },
        '550': { name: 'BANQUE', icon: '🏦' },
        '551': { name: 'ÉPARGNE', icon: '💰' },
        '570': { name: 'CAISSE', icon: '💵' },
        '571': { name: 'CAISSE', icon: '💵' }
      };

      return Object.keys(groups)
        .sort()
        .map(prefix => ({
          groupName: groupMapping[prefix] ? `${prefix} ${groupMapping[prefix].name}` : prefix,
          groupIcon: groupMapping[prefix]?.icon || '📁',
          codes: groups[prefix].sort((a, b) => a.code.localeCompare(b.code))
        }));
    };

    return {
      primary: groupCodes(primaryCodes),
      secondary: groupCodes(secondaryCodes)
    };
  }, [allCodes, selectedCategoryId, searchQuery, direction, activeTab]);

  // Available categories (dynamisch - check welke categorieën codes hebben)
  const availableCategories = useMemo(() => {
    if (categories.length === 0) return [];

    // Check welke categorieën daadwerkelijk codes hebben
    const categoriesWithCodes = categories.filter(cat =>
      allCodes.some(code => code.categories?.includes(cat.id))
    );

    // Sort: revenus eerst (groen boven), dan frequent, dan alfabetisch
    return categoriesWithCodes.sort((a, b) => {
      // 1. Revenus voor dépenses (groen boven rood)
      if (a.type === 'revenu' && b.type === 'depense') return -1;
      if (a.type === 'depense' && b.type === 'revenu') return 1;

      // 2. Binnen zelfde type: frequent eerst (Categorie.isFrequent)
      if (a.isFrequent && !b.isFrequent) return -1;
      if (!a.isFrequent && b.isFrequent) return 1;

      // 3. Alfabetisch
      return a.nom.localeCompare(b.nom);
    });
  }, [categories, allCodes]);

  // Handlers
  const handleCodeClick = (code: string) => {
    setSelectedCode(code);
  };

  const handleCategoryBadgeClick = (categoryId: string | null) => {
    setSelectedCategoryId(categoryId);
  };

  const handleValidate = () => {
    if (selectedCode) {
      onSelect(selectedCode);
      onClose();
    }
  };

  const handleCancel = () => {
    onClose();
  };

  // Helper
  const getCode = (code: string) => allCodes.find(c => c.code === code);
  const selectedCodeObj = getCode(selectedCode);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg w-full max-w-md h-[85vh] max-h-[750px] min-h-[400px] overflow-hidden flex flex-col shadow-2xl resize-y">

        {/* Header - Ultra Compact */}
        <div className="px-3 py-1.5 border-b border-gray-200 dark:border-dark-border bg-calypso-blue text-white flex justify-between items-center">
          <h2 className="text-sm font-bold">Code comptable</h2>
          <button
            onClick={handleCancel}
            className="p-1 hover:bg-white/20 rounded transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        {/* Search & Filters - Compact but Readable */}
        <div className="px-3 py-2 border-b border-gray-200 dark:border-dark-border space-y-2">
          {/* Search + Mini Direction Toggle */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>
            {/* Mini Direction Toggle */}
            <button
              onClick={() => {
                const newDirection = direction === 'sortie' ? 'entree' : 'sortie';
                setDirection(newDirection);
                setActiveTab('primary');
                setSelectedCategoryId(null);
              }}
              className={cn(
                "px-2 py-1 text-sm border rounded flex items-center gap-1 transition-colors",
                direction === 'sortie'
                  ? "border-red-400 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"
                  : "border-green-400 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
              )}
              title={direction === 'sortie' ? 'Sortie (argent sort) - cliquez pour changer' : 'Entrée (argent entre) - cliquez pour changer'}
            >
              {direction === 'sortie' ? '➖' : '➕'}
              {direction !== (isExpense ? 'sortie' : 'entree') && (
                <span className="text-orange-500">⚠️</span>
              )}
            </button>
          </div>

          {/* Suggestions Section - IA-Based avec scoring */}
          {suggestions.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2">
              <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Suggestions
              </div>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {suggestions.slice(0, 3).map((suggestion, index) => {
                  const codeObj = allCodes.find(c => c.code === suggestion.accountCode);
                  const codeType = codeObj?.type;
                  const colorScheme = codeType === 'revenue' ? 'green' : codeType === 'expense' ? 'red' : 'blue';
                  const score = suggestion.score || 0;
                  // Confiance: 70+ = haute, 50-69 = moyenne, <50 = basse
                  const confidenceLevel = score >= 70 ? 'high' : score >= 50 ? 'medium' : 'low';

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        handleCodeClick(suggestion.accountCode);
                        // Auto-switch to correct direction and tab
                        if (codeType === 'revenue') {
                          setDirection('entree');
                          setActiveTab('primary');
                        } else if (codeType === 'expense') {
                          setDirection('sortie');
                          setActiveTab('primary');
                        } else if (codeType === 'asset') {
                          setDirection('sortie');
                          setActiveTab('secondary');
                        } else if (codeType === 'liability') {
                          setDirection('entree');
                          setActiveTab('secondary');
                        }
                      }}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 max-w-full",
                        // Bordure plus épaisse pour les suggestions à haute confiance
                        confidenceLevel === 'high' && "ring-2 ring-purple-400 dark:ring-purple-500",
                        colorScheme === 'green' && "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50",
                        colorScheme === 'red' && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50",
                        colorScheme === 'blue' && "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50"
                      )}
                      title={`${suggestion.matchReason || 'Match historique'}\nScore: ${score} pts (utilisé ${suggestion.count}x)`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {/* Indicateur de confiance */}
                        <span className={cn(
                          "text-[10px]",
                          confidenceLevel === 'high' && "text-purple-600 dark:text-purple-400",
                          confidenceLevel === 'medium' && "text-yellow-600 dark:text-yellow-400",
                          confidenceLevel === 'low' && "text-gray-500 dark:text-dark-text-muted"
                        )}>
                          {confidenceLevel === 'high' ? '🎯' : confidenceLevel === 'medium' ? '🔍' : '💡'}
                        </span>
                        <span className="font-mono font-bold whitespace-nowrap">{suggestion.accountCode}</span>
                        {codeObj && (
                          <span className="text-[11px] truncate opacity-90">
                            {codeObj.label}
                          </span>
                        )}
                      </div>
                      {/* Score au lieu du count */}
                      <span className="text-[10px] opacity-75 ml-auto">{score}pts</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs: Based on direction */}
          <div className="flex gap-1.5">
            {direction === 'sortie' ? (
              <>
                <button
                  onClick={() => {
                    setActiveTab('primary');
                    setSelectedCategoryId(null);
                  }}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors",
                    activeTab === 'primary'
                      ? "bg-red-600 text-white"
                      : "border border-red-500 text-red-700 dark:text-red-400 bg-white dark:bg-dark-bg-secondary"
                  )}
                >
                  💸 Dépenses
                </button>
                <button
                  onClick={() => {
                    setActiveTab('secondary');
                    setSelectedCategoryId(null);
                  }}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors",
                    activeTab === 'secondary'
                      ? "bg-blue-600 text-white"
                      : "border border-blue-500 text-blue-700 dark:text-blue-400 bg-white dark:bg-dark-bg-secondary"
                  )}
                >
                  🏦 Actifs
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setActiveTab('primary');
                    setSelectedCategoryId(null);
                  }}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors",
                    activeTab === 'primary'
                      ? "bg-green-600 text-white"
                      : "border border-green-500 text-green-700 dark:text-green-400 bg-white dark:bg-dark-bg-secondary"
                  )}
                >
                  💰 Revenus
                </button>
                <button
                  onClick={() => {
                    setActiveTab('secondary');
                    setSelectedCategoryId(null);
                  }}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-sm font-medium rounded transition-colors",
                    activeTab === 'secondary'
                      ? "bg-purple-600 text-white"
                      : "border border-purple-500 text-purple-700 dark:text-purple-400 bg-white dark:bg-dark-bg-secondary"
                  )}
                >
                  📋 Passifs
                </button>
              </>
            )}
          </div>

          {/* Category Quick Filters - Only for primary tab (expense/revenue have categories) */}
          {activeTab === 'primary' && (
            <div className="flex flex-wrap gap-1 content-start">
              <button
                onClick={() => handleCategoryBadgeClick(null)}
                className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                  selectedCategoryId === null
                    ? direction === 'entree' ? "bg-green-600 text-white" : "bg-red-600 text-white"
                    : direction === 'entree'
                      ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                      : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                )}
              >
                Tous
              </button>
              {availableCategories
                .filter(cat => direction === 'entree' ? cat.type === 'revenu' : cat.type === 'depense')
                .map(cat => {
                  const isActive = selectedCategoryId === cat.id;
                  const shortName = cat.label_court || cat.nom.split(' ')[0];
                  const isRevenue = cat.type === 'revenu';

                  return (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryBadgeClick(cat.id)}
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium transition-colors flex items-center gap-0.5",
                        isActive
                          ? isRevenue ? "bg-green-600 text-white" : "bg-red-600 text-white"
                          : isRevenue
                            ? "border border-green-500 text-green-700 dark:text-green-400 bg-white dark:bg-dark-bg-secondary"
                            : "border border-red-500 text-red-700 dark:text-red-400 bg-white dark:bg-dark-bg-secondary"
                      )}
                    >
                      {cat.isFrequent && <span className="text-yellow-500">★</span>}
                      {shortName}
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* Single Column: Active Tab Content - Readable */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn(
            "p-2",
            // Sortie: primary=red (expense), secondary=blue (asset)
            // Entrée: primary=green (revenue), secondary=purple (liability)
            direction === 'sortie' && activeTab === 'primary' && "bg-red-50/30 dark:bg-red-900/10",
            direction === 'sortie' && activeTab === 'secondary' && "bg-blue-50/30 dark:bg-blue-900/10",
            direction === 'entree' && activeTab === 'primary' && "bg-green-50/30 dark:bg-green-900/10",
            direction === 'entree' && activeTab === 'secondary' && "bg-purple-50/30 dark:bg-purple-900/10"
          )}>
            {(() => {
              const currentGroups = groupedCodesByDirection[activeTab];
              // Color scheme based on direction and tab
              let colorScheme: 'green' | 'red' | 'blue' | 'purple';
              if (direction === 'sortie') {
                colorScheme = activeTab === 'primary' ? 'red' : 'blue';
              } else {
                colorScheme = activeTab === 'primary' ? 'green' : 'purple';
              }

              return currentGroups.length > 0 ? (
                <div className="space-y-0">
                  {currentGroups.map((group, groupIndex) => (
                    <div key={group.groupName}>
                      {/* Divider between groups */}
                      {groupIndex > 0 && (
                        <div className={cn(
                          "h-px my-2",
                          colorScheme === 'green' && "bg-green-200 dark:bg-green-800",
                          colorScheme === 'red' && "bg-red-200 dark:bg-red-800",
                          colorScheme === 'blue' && "bg-blue-200 dark:bg-blue-800",
                          colorScheme === 'purple' && "bg-purple-200 dark:bg-purple-800"
                        )} />
                      )}

                      {/* Group Header - No Icon */}
                      <div className="mb-1 px-1">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-wide",
                          colorScheme === 'green' && "text-green-700 dark:text-green-400",
                          colorScheme === 'red' && "text-red-700 dark:text-red-400",
                          colorScheme === 'blue' && "text-blue-700 dark:text-blue-400",
                          colorScheme === 'purple' && "text-purple-700 dark:text-purple-400"
                        )}>
                          {group.groupName}
                        </h3>
                      </div>

                      {/* Codes - Single Line with Readable Font */}
                      <div className="space-y-0.5">
                        {group.codes.map((code) => (
                          <button
                            key={code.code}
                            onClick={() => handleCodeClick(code.code)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-1 rounded transition-colors text-left",
                              selectedCode === code.code
                                ? colorScheme === 'green' ? "bg-green-600 text-white"
                                  : colorScheme === 'red' ? "bg-red-600 text-white"
                                  : colorScheme === 'purple' ? "bg-purple-600 text-white"
                                  : "bg-blue-600 text-white"
                                : colorScheme === 'green'
                                  ? "hover:bg-green-100 dark:hover:bg-green-900/20"
                                  : colorScheme === 'red'
                                    ? "hover:bg-red-100 dark:hover:bg-red-900/20"
                                    : colorScheme === 'purple'
                                      ? "hover:bg-purple-100 dark:hover:bg-purple-900/20"
                                      : "hover:bg-blue-100 dark:hover:bg-blue-900/20"
                            )}
                          >
                            {/* Code Number - Readable */}
                            <span className={cn(
                              "text-xs font-mono font-medium min-w-[55px]",
                              selectedCode === code.code
                                ? "text-white"
                                : colorScheme === 'green'
                                  ? "text-green-700 dark:text-green-400"
                                  : colorScheme === 'red'
                                    ? "text-red-700 dark:text-red-400"
                                    : colorScheme === 'purple'
                                      ? "text-purple-700 dark:text-purple-400"
                                      : "text-blue-700 dark:text-blue-400"
                            )}>
                              {code.code}
                            </span>

                            {/* Label - Readable */}
                            <span className={cn(
                              "text-xs flex-1 truncate",
                              selectedCode === code.code
                                ? "text-white/90"
                                : "text-gray-600 dark:text-dark-text-secondary"
                            )}>
                              {code.label}
                            </span>

                            {/* Check Icon */}
                            {selectedCode === code.code && (
                              <Check className="h-4 w-4 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-dark-text-muted text-center py-6">
                  {direction === 'sortie'
                    ? activeTab === 'primary' ? 'Aucune dépense trouvée' : 'Aucun actif trouvé'
                    : activeTab === 'primary' ? 'Aucun revenu trouvé' : 'Aucun passif trouvé'
                  }
                </p>
              );
            })()}
          </div>
        </div>

        {/* Footer: Full Width Selection + Buttons Below */}
        <div className="px-3 py-2 border-t-2 border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary space-y-2">
          {/* Selection Preview - Full Width */}
          {selectedCode && selectedCodeObj ? (
            <div className="w-full flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-dark-bg-tertiary rounded border border-gray-300 dark:border-dark-border">
              <span className={cn(
                "text-sm font-mono font-bold shrink-0",
                selectedCodeObj.type === 'revenue'
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              )}>
                {selectedCode}
              </span>
              <span className="text-sm text-gray-700 dark:text-dark-text-primary truncate font-medium">
                {selectedCodeObj.label}
              </span>
            </div>
          ) : (
            <div className="w-full text-sm text-gray-400 dark:text-dark-text-muted px-3 py-2 text-center">
              Aucune sélection
            </div>
          )}

          {/* Actions - Full Width Below */}
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
            {allowClear && (
              <button
                onClick={() => {
                  onSelect('');
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium rounded transition-colors bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 flex items-center gap-1.5"
                title="Supprimer le code comptable"
              >
                <Trash2 className="h-4 w-4" />
                Vider
              </button>
            )}
            {onNotFound && (
              <button
                onClick={() => {
                  onNotFound();
                  onClose();
                }}
                className="px-4 py-2 text-sm font-medium rounded transition-colors bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 flex items-center gap-1.5"
                title="Aucun code comptable approprié trouvé"
              >
                <HelpCircle className="h-4 w-4" />
                Non trouvé
              </button>
            )}
            <button
              onClick={handleValidate}
              disabled={!selectedCode}
              className={cn(
                "flex-1 px-4 py-2 text-sm font-medium rounded transition-colors",
                selectedCode
                  ? "bg-calypso-blue text-white hover:bg-calypso-blue-dark"
                  : "bg-gray-300 dark:bg-dark-bg-tertiary text-gray-500 dark:text-dark-text-muted cursor-not-allowed"
              )}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
