import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, Calendar, MapPin, Link2, AlertCircle, TrendingUp, TrendingDown, ArrowUpDown, Users, DollarSign, Gift, ShoppingBag, Award, FileText } from 'lucide-react';
import { TransactionBancaire, Operation, TypeOperation } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface OperationLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: TransactionBancaire; // Optional - only needed when linking from a transaction
  operations: Operation[];
  linkedOperationIds: string[];
  onLinkOperations: (operationIds: string[]) => Promise<void>;
}

type SortField = 'date' | 'montant' | 'titre';
type SortDirection = 'asc' | 'desc';
type QuickDateFilter = 'all' | 'cette_semaine' | 'ce_mois' | 'deux_mois';

// Color coding per operation type
const typeColors: Record<TypeOperation, { bg: string; border: string; text: string; icon: typeof Calendar }> = {
  evenement: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: Calendar },
  cotisation: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', icon: Users },
  caution: { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', icon: Gift },
  vente: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', icon: ShoppingBag },
  subvention: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: Award },
  autre: { bg: 'bg-gray-50', border: 'border-gray-300', text: 'text-gray-700', icon: FileText }
};

const typeLabels: Record<TypeOperation, string> = {
  evenement: 'Événements',
  cotisation: 'Cotisations',
  caution: 'Cautions',
  vente: 'Ventes',
  subvention: 'Subventions',
  autre: 'Autres'
};

export function OperationLinkingPanel({
  isOpen,
  onClose,
  transaction,
  operations,
  linkedOperationIds,
  onLinkOperations
}: OperationLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeOperation | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>('all');
  const [saving, setSaving] = useState(false);

  // Reset selection when panel opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSearchTerm('');
      setDateFrom('');
      setDateTo('');
      setTypeFilter('all');
      setSortField('date');
      setSortDirection('desc');
      setQuickDateFilter('all');
    }
  }, [isOpen]);

  // Quick date filter logic
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (quickDateFilter) {
      case 'cette_semaine': {
        const monday = new Date(today);
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days, else go to Monday
        monday.setDate(today.getDate() + diff);
        setDateFrom(monday.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      }
      case 'ce_mois': {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        setDateFrom(firstDay.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      }
      case 'deux_mois': {
        const twoMonthsAgo = new Date(today);
        twoMonthsAgo.setMonth(today.getMonth() - 2);
        setDateFrom(twoMonthsAgo.toISOString().split('T')[0]);
        setDateTo(today.toISOString().split('T')[0]);
        break;
      }
      case 'all':
        setDateFrom('');
        setDateTo('');
        break;
    }
  }, [quickDateFilter]);

  // Count operations by type
  const typeCounts = useMemo(() => {
    const counts: Record<TypeOperation | 'all', number> = {
      all: 0,
      evenement: 0,
      cotisation: 0,
      caution: 0,
      vente: 0,
      subvention: 0,
      autre: 0
    };

    operations.forEach(op => {
      if (!linkedOperationIds.includes(op.id)) {
        counts.all++;
        counts[op.type]++;
      }
    });

    return counts;
  }, [operations, linkedOperationIds]);

  // Smart suggestions: match by amount (±10%) and date (same month)
  const getSuggestionScore = (operation: Operation): number => {
    // If no transaction provided, no smart suggestions
    if (!transaction) return 0;

    let score = 0;
    const transactionAmount = Math.abs(transaction.montant);
    const operationAmount = operation.montant_prevu;

    // Amount match (±10%)
    const amountDiff = Math.abs(transactionAmount - operationAmount) / transactionAmount;
    if (amountDiff <= 0.1) {
      score += 50; // Exact or very close match
    } else if (amountDiff <= 0.2) {
      score += 25; // Close match
    }

    // Date match (same month)
    const transactionDate = new Date(transaction.date_execution);
    const operationDate = operation.date_debut || operation.periode_debut;
    if (operationDate) {
      const opDate = new Date(operationDate);
      if (transactionDate.getMonth() === opDate.getMonth() &&
          transactionDate.getFullYear() === opDate.getFullYear()) {
        score += 30;
      }
    }

    // Keyword match in communication
    if (transaction.communication && operation.titre) {
      const comm = transaction.communication.toLowerCase();
      const titre = operation.titre.toLowerCase();
      if (comm.includes(titre) || titre.includes(comm)) {
        score += 20;
      }
    }

    return score;
  };

  // Filter and sort operations
  const filteredOperations = useMemo(() => {
    let filtered = operations.filter(operation => {
      // Exclude already linked
      if (linkedOperationIds.includes(operation.id)) return false;

      // Type filter
      if (typeFilter !== 'all' && operation.type !== typeFilter) return false;

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchTitle = operation.titre.toLowerCase().includes(term);
        const matchDesc = operation.description?.toLowerCase().includes(term);
        const matchOrg = operation.organisateur_nom?.toLowerCase().includes(term);
        const matchMontant = operation.montant_prevu?.toString().includes(searchTerm) ?? false;
        if (!matchTitle && !matchDesc && !matchOrg && !matchMontant) return false;
      }

      // Date filter
      const opDate = operation.date_debut || operation.periode_debut;
      if (opDate) {
        if (dateFrom) {
          const from = new Date(dateFrom);
          if (new Date(opDate) < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo);
          if (new Date(opDate) > to) return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        const dateA = a.date_debut || a.periode_debut || a.created_at;
        const dateB = b.date_debut || b.periode_debut || b.created_at;
        comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
      } else if (sortField === 'montant') {
        comparison = a.montant_prevu - b.montant_prevu;
      } else if (sortField === 'titre') {
        comparison = a.titre.localeCompare(b.titre);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Add suggestion scores
    return filtered.map(op => ({
      ...op,
      suggestionScore: getSuggestionScore(op)
    })).sort((a, b) => {
      // Sort by suggestion score first, then by selected sort
      if (a.suggestionScore !== b.suggestionScore) {
        return b.suggestionScore - a.suggestionScore;
      }
      return 0;
    });
  }, [operations, linkedOperationIds, typeFilter, searchTerm, dateFrom, dateTo, sortField, sortDirection, transaction]);

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Toggle selection
  const toggleSelection = (operationId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(operationId)) {
      newSelected.delete(operationId);
    } else {
      newSelected.add(operationId);
    }
    setSelectedIds(newSelected);
  };

  // Select all filtered
  const selectAll = () => {
    setSelectedIds(new Set(filteredOperations.map(op => op.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Save
  const handleSave = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    try {
      await onLinkOperations(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Error linking operations:', error);
    } finally {
      setSaving(false);
    }
  };

  // Get type-specific display info
  const getOperationDisplayInfo = (operation: Operation) => {
    switch (operation.type) {
      case 'evenement':
        return {
          dateLabel: operation.date_debut ? formatDate(operation.date_debut) : '',
          extraInfo: operation.lieu || '',
          icon: Calendar
        };
      case 'cotisation':
        return {
          dateLabel: operation.periode_debut ? `Période: ${formatDate(operation.periode_debut)}` : '',
          extraInfo: operation.periode_fin ? `jusqu'au ${formatDate(operation.periode_fin)}` : '',
          icon: Users
        };
      case 'vente':
        return {
          dateLabel: operation.date_debut ? formatDate(operation.date_debut) : '',
          extraInfo: `Statut: ${operation.statut}`,
          icon: ShoppingBag
        };
      case 'caution':
        return {
          dateLabel: operation.date_debut ? formatDate(operation.date_debut) : '',
          extraInfo: operation.organisateur_nom || '',
          icon: Gift
        };
      case 'subvention':
        return {
          dateLabel: operation.date_debut ? formatDate(operation.date_debut) : '',
          extraInfo: operation.organisateur_nom || '',
          icon: Award
        };
      case 'autre':
        return {
          dateLabel: operation.date_debut ? formatDate(operation.date_debut) : '',
          extraInfo: '',
          icon: FileText
        };
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-[60]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className={cn(
        "fixed left-0 top-0 h-full bg-white shadow-2xl z-[70] flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "w-full max-w-2xl"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-purple-600 to-purple-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Lier des activités</h2>
              {transaction && (
                <p className="text-purple-100 text-sm mt-1">
                  à la transaction {transaction.contrepartie_nom} ({formatMontant(transaction.montant)})
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Type Filter */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                typeFilter === 'all'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Tous types ({typeCounts.all})
            </button>
            {(Object.keys(typeLabels) as TypeOperation[]).map(type => {
              const config = typeColors[type];
              const Icon = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                    typeFilter === type
                      ? `${config.bg} ${config.border} ${config.text} border-2`
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {typeLabels[type]} ({typeCounts[type]})
                </button>
              );
            })}
          </div>
        </div>

        {/* Filters & Sorting */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par titre, description, organisateur ou montant..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Date Filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setQuickDateFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                quickDateFilter === 'all'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Toutes périodes
            </button>
            <button
              onClick={() => setQuickDateFilter('cette_semaine')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                quickDateFilter === 'cette_semaine'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Cette semaine
            </button>
            <button
              onClick={() => setQuickDateFilter('ce_mois')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                quickDateFilter === 'ce_mois'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Ce mois
            </button>
            <button
              onClick={() => setQuickDateFilter('deux_mois')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                quickDateFilter === 'deux_mois'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              2 derniers mois
            </button>
          </div>

          {/* Custom Date Range */}
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setQuickDateFilter('all');
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setQuickDateFilter('all');
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
              placeholder="Date fin"
            />
          </div>

          {/* Sort Buttons */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 dark:text-dark-text-secondary py-1.5">Trier par:</span>
            <button
              onClick={() => toggleSort('date')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'date'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Date
              {sortField === 'date' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSort('montant')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'montant'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <DollarSign className="h-3.5 w-3.5" />
              Montant
              {sortField === 'montant' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSort('titre')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'titre'
                  ? "bg-purple-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Titre
              {sortField === 'titre' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={filteredOperations.length === 0}
                className="px-2 py-1 text-purple-600 hover:bg-purple-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tout sélectionner
              </button>
              <button
                onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="px-2 py-1 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tout désélectionner
              </button>
            </div>
            <span className="text-gray-600 dark:text-dark-text-secondary">
              {selectedIds.size} / {filteredOperations.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredOperations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune activité disponible</p>
              {(searchTerm || dateFrom || dateTo || typeFilter !== 'all') && (
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOperations.map(operation => {
                const isSelected = selectedIds.has(operation.id);
                const config = typeColors[operation.type];
                const displayInfo = getOperationDisplayInfo(operation);
                const Icon = displayInfo.icon;
                const isSuggested = (operation as any).suggestionScore > 30;

                return (
                  <div
                    key={operation.id}
                    onClick={() => toggleSelection(operation.id)}
                    className={cn(
                      "border rounded-lg p-3 cursor-pointer transition-all relative",
                      isSelected
                        ? `${config.bg} ${config.border} shadow-sm`
                        : `bg-white border-gray-200 hover:border-purple-200 hover:bg-purple-50/30`,
                      isSuggested && !isSelected && "ring-2 ring-purple-300"
                    )}
                  >
                    {/* Suggested badge */}
                    {isSuggested && !isSelected && (
                      <div className="absolute -top-2 -right-2 bg-purple-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        Suggéré
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-purple-600 border-purple-600"
                            : "border-gray-300 bg-white"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Operation info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">{operation.titre}</h3>
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
                              config.bg,
                              config.text
                            )}>
                              <Icon className="h-3 w-3" />
                              {typeLabels[operation.type]}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                            {formatMontant(operation.montant_prevu)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600 dark:text-dark-text-secondary">
                          {displayInfo.dateLabel && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {displayInfo.dateLabel}
                            </div>
                          )}

                          {displayInfo.extraInfo && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {displayInfo.extraInfo}
                            </div>
                          )}

                          {operation.organisateur_nom && (
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {operation.organisateur_nom}
                            </div>
                          )}
                        </div>

                        {operation.description && (
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 line-clamp-2">
                            {operation.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={selectedIds.size === 0 || saving}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Liaison...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  Lier {selectedIds.size > 0 && `(${selectedIds.size})`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
