import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Check,
  FileText
} from 'lucide-react';
import { AccountCode, Categorie, TransactionBancaire } from '@/types';
import { CategorizationService } from '@/services/categorizationService';
import { cn } from '@/utils/utils';

interface AccountCodeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (code: string) => void;
  initialCode?: string;
  isExpense?: boolean;
  counterpartyName?: string; // Deprecated - use transaction instead
  clubId?: string; // Voor suggesties
  transaction?: TransactionBancaire; // NEW: Full transaction for keyword-based suggestions
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
  initialCode,
  isExpense = false,
  counterpartyName,
  clubId,
  transaction
}: AccountCodeSelectorModalProps) {
  // State
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null); // null = "Tous"
  const [activeTab, setActiveTab] = useState<'revenue' | 'expense'>(isExpense ? 'expense' : 'revenue'); // Tab state

  // Data
  const [allCodes, setAllCodes] = useState<AccountCode[]>([]);
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [suggestions, setSuggestions] = useState<{ category: string; accountCode: string; count: number; categoryLabel?: string; codeLabel?: string; matchReason?: string }[]>([]);

  // Charger alle codes en categorieën au mount
  useEffect(() => {
    const codes = CategorizationService.getAllAccountCodes();
    const cats = CategorizationService.getAllCategories();
    setAllCodes(codes);
    setCategories(cats);
  }, []);

  // CRITICAL: Synchroniseer initialCode wanneer modal opent OF initialCode verandert
  useEffect(() => {
    if (isOpen) {
      // Reset alles naar initiële state
      setSelectedCode(initialCode || '');
      setSearchQuery('');
      setCategoryFilter(null);

      // Set activeTab based on initialCode type
      if (initialCode && allCodes.length > 0) {
        const codeObj = allCodes.find(c => c.code === initialCode);
        if (codeObj) {
          setActiveTab(codeObj.type === 'revenue' ? 'revenue' : 'expense');
        }
      }
    }
  }, [isOpen, initialCode, allCodes]);

  // Load suggestions when modal opens with transaction (keyword-based)
  useEffect(() => {
    if (isOpen && clubId && transaction) {
      console.log('[AccountCodeSelectorModal] 🔍 Loading keyword-based suggestions for:', {
        communication: transaction.communication,
        montant: transaction.montant
      });

      CategorizationService.getSuggestionsFromHistory(clubId, transaction)
        .then(results => {
          console.log('[AccountCodeSelectorModal] ✨ Loaded suggestions:', results);
          setSuggestions(results);
        })
        .catch(error => {
          console.error('[AccountCodeSelectorModal] Error loading suggestions:', error);
          setSuggestions([]);
        });
    } else {
      setSuggestions([]);
    }
  }, [isOpen, clubId, transaction?.id]);

  // Grouped codes avec memoization - SPLIT BY TYPE (revenue vs expense)
  const groupedCodesByType = useMemo<{ revenue: GroupedCodes[], expense: GroupedCodes[] }>(() => {
    // Category filter (filter op prefix)
    let filtered = allCodes;
    if (categoryFilter) {
      filtered = filtered.filter(c => c.code.startsWith(categoryFilter));
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.code.toLowerCase().includes(query) ||
        c.label.toLowerCase().includes(query)
      );
    }

    // Split by type
    const revenueCodes = filtered.filter(c => c.type === 'revenue');
    const expenseCodes = filtered.filter(c => c.type === 'expense');

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
        '618': { name: 'ACTIVITÉS PLONGÉE', icon: '🏊' },
        '701': { name: 'COTISATIONS', icon: '📦' },
        '707': { name: 'VENTES', icon: '🏪' },
        '708': { name: 'FORMATIONS', icon: '📚' },
        '730': { name: 'PISCINE', icon: '🏊' },
        '740': { name: 'SUBSIDES', icon: '💰' },
        '750': { name: 'DIVERS', icon: '📊' },
        '610': { name: 'ACHATS', icon: '📦' },
        '611': { name: 'MATÉRIEL', icon: '🤿' },
        '612': { name: 'SERVICES', icon: '🔧' },
        '613': { name: 'LOCATIONS', icon: '🏢' },
        '614': { name: 'FRAIS DIVERS', icon: '💼' },
        '640': { name: 'RÉMUNÉRATIONS', icon: '💵' },
        '641': { name: 'CHARGES SOC.', icon: '📋' }
      };

      return Object.keys(groups)
        .sort()
        .map(prefix => ({
          groupName: groupMapping[prefix]?.name || `${prefix}`,
          groupIcon: groupMapping[prefix]?.icon || '📁',
          codes: groups[prefix].sort((a, b) => {
            if (a.isFrequent && !b.isFrequent) return -1;
            if (!a.isFrequent && b.isFrequent) return 1;
            return a.code.localeCompare(b.code);
          })
        }));
    };

    return {
      revenue: groupCodes(revenueCodes),
      expense: groupCodes(expenseCodes)
    };
  }, [allCodes, categoryFilter, searchQuery]);

  // Available categories (dynamisch - check welke categorieën codes hebben)
  const availableCategories = useMemo(() => {
    if (categories.length === 0) return [];

    // Check welke categorieën daadwerkelijk codes hebben
    const categoriesWithCodes = categories.filter(cat => {
      if (!cat.compte_comptable) return false;
      // Check of er codes zijn die met deze prefix beginnen
      return allCodes.some(code => code.code.startsWith(cat.compte_comptable!));
    });

    // Sort: revenus eerst (groen boven), dan frequent, dan alfabetisch
    return categoriesWithCodes.sort((a, b) => {
      // 1. Revenus voor dépenses (groen boven rood)
      if (a.type === 'revenu' && b.type === 'depense') return -1;
      if (a.type === 'depense' && b.type === 'revenu') return 1;

      // 2. Binnen zelfde type: frequent eerst
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
    // Find category en gebruik compte_comptable als filter
    if (categoryId) {
      const cat = categories.find(c => c.id === categoryId);
      setCategoryFilter(cat?.compte_comptable || null);
    } else {
      setCategoryFilter(null);  // "Tous"
    }
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
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg w-full max-w-md h-[60vh] overflow-hidden flex flex-col shadow-2xl">

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
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded focus:ring-1 focus:ring-calypso-blue focus:border-transparent"
            />
          </div>

          {/* Suggestions Section - IA-Based */}
          {suggestions.length > 0 && (
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2">
              <div className="text-xs font-semibold text-purple-700 dark:text-purple-400 mb-1 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                ✨ Suggestions (basées sur mots-clés + montant)
              </div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((suggestion, index) => {
                  const codeObj = allCodes.find(c => c.code === suggestion.accountCode);
                  const isRevenue = codeObj?.type === 'revenue';

                  return (
                    <button
                      key={index}
                      onClick={() => {
                        handleCodeClick(suggestion.accountCode);
                        // Auto-switch to correct tab
                        setActiveTab(isRevenue ? 'revenue' : 'expense');
                      }}
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium transition-all hover:scale-105 flex items-center gap-1.5 max-w-full",
                        isRevenue
                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50"
                          : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50"
                      )}
                      title={`Raison: ${suggestion.matchReason || 'Match historique'}\n(utilisé ${suggestion.count}x)`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono font-bold whitespace-nowrap">{suggestion.accountCode}</span>
                        {codeObj && (
                          <span className="text-[11px] truncate opacity-90">
                            {codeObj.label}
                          </span>
                        )}
                      </div>
                      {suggestion.count > 1 && (
                        <span className="text-[10px] opacity-75 ml-auto">×{suggestion.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tabs: Revenue / Expense */}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                setActiveTab('revenue');
                setCategoryFilter(null);
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                activeTab === 'revenue'
                  ? "bg-green-600 text-white"
                  : "border border-green-500 text-green-700 dark:text-green-400 bg-white dark:bg-dark-bg-secondary"
              )}
            >
              💰 Rentrées
            </button>
            <button
              onClick={() => {
                setActiveTab('expense');
                setCategoryFilter(null);
              }}
              className={cn(
                "flex-1 px-3 py-1.5 text-sm font-medium rounded transition-colors",
                activeTab === 'expense'
                  ? "bg-red-600 text-white"
                  : "border border-red-500 text-red-700 dark:text-red-400 bg-white dark:bg-dark-bg-secondary"
              )}
            >
              💸 Sorties
            </button>
          </div>

          {/* Category Quick Filters for Active Tab */}
          <div className="flex flex-wrap gap-1 content-start">
            <button
              onClick={() => handleCategoryBadgeClick(null)}
              className={cn(
                "px-2 py-0.5 rounded text-xs font-medium transition-colors",
                categoryFilter === null
                  ? activeTab === 'revenue' ? "bg-green-600 text-white" : "bg-red-600 text-white"
                  : activeTab === 'revenue'
                    ? "bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                    : "bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400"
              )}
            >
              Tous
            </button>
            {availableCategories
              .filter(cat => activeTab === 'revenue' ? cat.type === 'revenu' : cat.type === 'depense')
              .map(cat => {
                const isActive = categoryFilter === cat.compte_comptable;
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
        </div>

        {/* Single Column: Active Tab Content - Readable */}
        <div className="flex-1 overflow-y-auto">
          <div className={cn(
            "p-2",
            activeTab === 'revenue' ? "bg-green-50/30 dark:bg-green-900/10" : "bg-red-50/30 dark:bg-red-900/10"
          )}>
            {(() => {
              const currentGroups = activeTab === 'revenue' ? groupedCodesByType.revenue : groupedCodesByType.expense;
              const isRevenue = activeTab === 'revenue';

              return currentGroups.length > 0 ? (
                <div className="space-y-0">
                  {currentGroups.map((group, groupIndex) => (
                    <div key={group.groupName}>
                      {/* Divider between groups */}
                      {groupIndex > 0 && (
                        <div className={cn(
                          "h-px my-2",
                          isRevenue ? "bg-green-200 dark:bg-green-800" : "bg-red-200 dark:bg-red-800"
                        )} />
                      )}

                      {/* Group Header - No Icon */}
                      <div className="mb-1 px-1">
                        <h3 className={cn(
                          "text-xs font-bold uppercase tracking-wide",
                          isRevenue ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                        )}>
                          {group.codes[0]?.code.substring(0, 3)} {group.groupName}
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
                                ? isRevenue ? "bg-green-600 text-white" : "bg-red-600 text-white"
                                : isRevenue
                                  ? "hover:bg-green-100 dark:hover:bg-green-900/20"
                                  : "hover:bg-red-100 dark:hover:bg-red-900/20"
                            )}
                          >
                            {/* Code Number - Readable */}
                            <span className={cn(
                              "text-xs font-mono font-medium min-w-[55px]",
                              selectedCode === code.code
                                ? "text-white"
                                : isRevenue
                                  ? "text-green-700 dark:text-green-400"
                                  : "text-red-700 dark:text-red-400"
                            )}>
                              {code.isFrequent && '★ '}
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
                  {isRevenue ? 'Aucun revenu trouvé' : 'Aucune dépense trouvée'}
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
              className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
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
