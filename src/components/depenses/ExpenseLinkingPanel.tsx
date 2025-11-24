import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Check, Calendar, User, Link2, AlertCircle, TrendingUp, TrendingDown, ArrowUpDown, DollarSign, FileText, CheckCircle, Clock, XCircle } from 'lucide-react';
import { DemandeRemboursement } from '@/types';
import { formatMontant, formatDate, cn, STATUS_COLORS } from '@/utils/utils';

interface ExpenseLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  contextEntity: { type: 'transaction' | 'operation'; name: string; amount?: number };
  demands: DemandeRemboursement[];
  linkedDemandIds: string[];
  onLinkDemands: (demandIds: string[]) => Promise<void>;
}

type SortField = 'date' | 'montant' | 'description';
type SortDirection = 'asc' | 'desc';
type QuickDateFilter = 'all' | 'cette_semaine' | 'ce_mois' | 'deux_mois';
type StatusFilter = 'all' | 'en_attente' | 'attente_2e_validation' | 'approuve' | 'rembourse' | 'refuse';

// Color coding per status
const statusColors: Record<string, { bg: string; border: string; text: string; icon: typeof Clock }> = {
  'en_attente': { bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', icon: Clock },
  'attente_2e_validation': { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: AlertCircle },
  'approuve': { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', icon: CheckCircle },
  'rembourse': { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', icon: CheckCircle },
  'refuse': { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-700', icon: XCircle }
};

const statusLabels: Record<string, string> = {
  'en_attente': 'En attente',
  'attente_2e_validation': 'Attente 2e validation',
  'approuve': 'Approuvé',
  'rembourse': 'Remboursé',
  'refuse': 'Refusé'
};

export function ExpenseLinkingPanel({
  isOpen,
  onClose,
  contextEntity,
  demands,
  linkedDemandIds,
  onLinkDemands
}: ExpenseLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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
      setStatusFilter('all');
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
        const diff = day === 0 ? -6 : 1 - day;
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

  // Count demands by status
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: 0,
      en_attente: 0,
      attente_2e_validation: 0,
      approuve: 0,
      rembourse: 0,
      refuse: 0
    };

    demands.forEach(demand => {
      if (!linkedDemandIds.includes(demand.id)) {
        counts.all++;
        if (demand.statut && counts[demand.statut as StatusFilter] !== undefined) {
          counts[demand.statut as StatusFilter]++;
        }
      }
    });

    return counts;
  }, [demands, linkedDemandIds]);

  // Smart suggestions: match by amount (±10%) and date (same month)
  const getSuggestionScore = (demand: DemandeRemboursement): number => {
    let score = 0;

    if (contextEntity.amount) {
      const contextAmount = Math.abs(contextEntity.amount);
      const demandAmount = demand.montant;

      // Amount match (±10%)
      const amountDiff = Math.abs(contextAmount - demandAmount) / contextAmount;
      if (amountDiff <= 0.1) {
        score += 50;
      } else if (amountDiff <= 0.2) {
        score += 25;
      }
    }

    // Keyword match in description
    if (contextEntity.name && demand.description) {
      const name = contextEntity.name.toLowerCase();
      const desc = demand.description.toLowerCase();
      if (name.includes(desc) || desc.includes(name)) {
        score += 20;
      }
    }

    return score;
  };

  // Filter and sort demands
  const filteredDemands = useMemo(() => {
    let filtered = demands.filter(demand => {
      // Exclude already linked
      if (linkedDemandIds.includes(demand.id)) return false;

      // Status filter
      if (statusFilter !== 'all' && demand.statut !== statusFilter) return false;

      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchDesc = demand.description?.toLowerCase().includes(term);
        const matchDemandeur = demand.demandeur_nom?.toLowerCase().includes(term);
        const matchMontant = demand.montant?.toString().includes(searchTerm) ?? false;
        if (!matchDesc && !matchDemandeur && !matchMontant) return false;
      }

      // Date filter
      if (demand.date_depense) {
        if (dateFrom) {
          const from = new Date(dateFrom);
          if (new Date(demand.date_depense) < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo);
          if (new Date(demand.date_depense) > to) return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        const dateA = a.date_depense || a.created_at;
        const dateB = b.date_depense || b.created_at;
        comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
      } else if (sortField === 'montant') {
        comparison = a.montant - b.montant;
      } else if (sortField === 'description') {
        comparison = a.description.localeCompare(b.description);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    // Add suggestion scores
    return filtered.map(demand => ({
      ...demand,
      suggestionScore: getSuggestionScore(demand)
    })).sort((a, b) => {
      if (a.suggestionScore !== b.suggestionScore) {
        return b.suggestionScore - a.suggestionScore;
      }
      return 0;
    });
  }, [demands, linkedDemandIds, statusFilter, searchTerm, dateFrom, dateTo, sortField, sortDirection, contextEntity]);

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
  const toggleSelection = (demandId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(demandId)) {
      newSelected.delete(demandId);
    } else {
      newSelected.add(demandId);
    }
    setSelectedIds(newSelected);
  };

  // Select all filtered
  const selectAll = () => {
    setSelectedIds(new Set(filteredDemands.map(d => d.id)));
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
      await onLinkDemands(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Error linking demands:', error);
    } finally {
      setSaving(false);
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
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-orange-600 to-orange-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Lier des dépenses</h2>
              <p className="text-orange-100 text-sm mt-1">
                à {contextEntity.type === 'transaction' ? 'la transaction' : "l'activité"} {contextEntity.name}
                {contextEntity.amount && ` (${formatMontant(contextEntity.amount)})`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                statusFilter === 'all'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Tous statuts ({statusCounts.all})
            </button>
            {(Object.keys(statusLabels) as StatusFilter[]).filter(s => s !== 'all').map(status => {
              const config = statusColors[status];
              const Icon = config?.icon || Clock;
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                    statusFilter === status
                      ? `${config?.bg} ${config?.border} ${config?.text} border-2`
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {statusLabels[status]} ({statusCounts[status as StatusFilter]})
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
              placeholder="Rechercher par description, demandeur ou montant..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
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
                  ? "bg-orange-600 text-white"
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
                  ? "bg-orange-600 text-white"
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
                  ? "bg-orange-600 text-white"
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
                  ? "bg-orange-600 text-white"
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
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setQuickDateFilter('all');
              }}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
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
                  ? "bg-orange-600 text-white"
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
                  ? "bg-orange-600 text-white"
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
              onClick={() => toggleSort('description')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'description'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Description
              {sortField === 'description' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={filteredDemands.length === 0}
                className="px-2 py-1 text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
              {selectedIds.size} / {filteredDemands.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredDemands.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune dépense disponible</p>
              {(searchTerm || dateFrom || dateTo || statusFilter !== 'all') && (
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDemands.map(demand => {
                const isSelected = selectedIds.has(demand.id);
                const config = statusColors[demand.statut || 'en_attente'];
                const Icon = config?.icon || Clock;
                const isSuggested = (demand as any).suggestionScore > 30;

                return (
                  <div
                    key={demand.id}
                    onClick={() => toggleSelection(demand.id)}
                    className={cn(
                      "border rounded-lg p-3 cursor-pointer transition-all relative",
                      isSelected
                        ? `${config?.bg} ${config?.border} shadow-sm`
                        : `bg-white border-gray-200 hover:border-orange-200 hover:bg-orange-50/30`,
                      isSuggested && !isSelected && "ring-2 ring-orange-300"
                    )}
                  >
                    {/* Suggested badge */}
                    {isSuggested && !isSelected && (
                      <div className="absolute -top-2 -right-2 bg-orange-600 text-white text-xs px-2 py-0.5 rounded-full font-medium">
                        Suggéré
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-orange-600 border-orange-600"
                            : "border-gray-300 bg-white"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Demand info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">{demand.description}</h3>
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1",
                              config?.bg,
                              config?.text
                            )}>
                              <Icon className="h-3 w-3" />
                              {statusLabels[demand.statut || 'en_attente']}
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 dark:text-dark-text-primary whitespace-nowrap">
                            {formatMontant(demand.montant)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600 dark:text-dark-text-secondary">
                          {demand.date_depense && (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(demand.date_depense)}
                            </div>
                          )}

                          {demand.demandeur_nom && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {demand.demandeur_nom}
                            </div>
                          )}

                          {demand.categorie && (
                            <div className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {demand.categorie}
                            </div>
                          )}
                        </div>
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
              className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
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
