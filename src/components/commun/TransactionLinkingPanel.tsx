import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, Filter, Check, TrendingUp, TrendingDown, Link2, Calendar, FileText, Eye, Sparkles } from 'lucide-react';
import { TransactionBancaire } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { sortTransactionsByRelevance, groupTransactionsByAmount, MatchContext } from '@/services/matchSuggestionService';

/**
 * TRANSACTION LINKING PANEL
 *
 * ⚠️ IMPORTANT: Ce composant est utilisé par:
 * - Événements (mode="event")
 * - Inscriptions (mode="inscription")
 * - Dépenses (mode="expense")
 *
 * Tout changement affecte les 3 contextes. Tester systématiquement:
 * 1. Liaison transaction → événement (multi-select, tous types)
 * 2. Liaison transaction → inscription (single-select, revenus uniquement, highlight montant)
 * 3. Liaison transaction → dépense (multi-select, dépenses uniquement)
 */

interface TransactionLinkingPanelProps {
  // Core
  isOpen: boolean;
  onClose: () => void;
  transactions: TransactionBancaire[];
  linkedTransactionIds: string[];
  onLinkTransactions: (transactionIds: string[]) => Promise<void>;

  // Configuration du contexte
  mode: 'event' | 'inscription' | 'expense';
  entityId: string;
  entityName: string;

  // Date de l'entité (événement, dépense) pour filtres relatifs
  entityDate?: Date;

  // Inscription uniquement
  targetAmount?: number;              // Pour highlight des correspondances de montant
  inscriptionMemberName?: string;     // Nom du membre pour le titre

  // Theming
  theme?: 'blue' | 'orange';
}

type QuickDateFilter = 'all' | 'une_semaine' | 'un_mois' | 'deux_mois';
type SortField = 'date' | 'montant' | 'titre' | 'pertinence';
type SortDirection = 'asc' | 'desc';

export function TransactionLinkingPanel({
  isOpen,
  onClose,
  transactions,
  linkedTransactionIds,
  onLinkTransactions,
  mode,
  entityId,
  entityName,
  entityDate,
  targetAmount,
  inscriptionMemberName,
  theme = 'blue'
}: TransactionLinkingPanelProps) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
  const [filterReconciled, setFilterReconciled] = useState<'all' | 'reconciled' | 'unreconciled'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [montantFrom, setMontantFrom] = useState('');
  const [montantTo, setMontantTo] = useState('');
  const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [saving, setSaving] = useState(false);
  const [groupByAmount, setGroupByAmount] = useState(false);

  // Theme colors
  const themeColors = {
    blue: {
      header: 'from-blue-600 to-blue-700',
      headerText: 'text-blue-100',
      headerTextLight: 'text-blue-200',
      primary: 'blue-600',
      primaryHover: 'blue-700',
      primaryLight: 'blue-50',
      border: 'blue-500',
      text: 'blue-600',
      textHover: 'blue-800',
      ring: 'blue-500'
    },
    orange: {
      header: 'from-orange-600 to-orange-700',
      headerText: 'text-orange-100',
      headerTextLight: 'text-orange-200',
      primary: 'orange-600',
      primaryHover: 'orange-700',
      primaryLight: 'orange-50',
      border: 'orange-500',
      text: 'orange-600',
      textHover: 'orange-800',
      ring: 'orange-500'
    }
  };

  const colors = themeColors[theme];

  // Reset selection when panel opens
  useEffect(() => {
    if (!isOpen) return; // Don't run if panel is closed

    setSelectedIds(new Set());
    setSearchTerm('');
    setFilterType('all');
    setFilterReconciled('all');
    setMontantFrom('');
    setMontantTo('');
    setQuickDateFilter('all');
    setSortField('date');
    setSortDirection('desc');
    // DON'T reset dateFrom/dateTo here - let the entityDate useEffect handle them
  }, [isOpen]);

  // Handle entityDate separately to trigger when it changes
  useEffect(() => {
    if (!isOpen) return; // Don't run if panel is closed

    // Pré-remplir les dates avec la date de l'entité si disponible
    if (entityDate) {
      // Handle both Date objects and Firestore Timestamps
      let dateObj: Date;
      if (entityDate instanceof Date) {
        dateObj = entityDate;
      } else if (typeof entityDate === 'object' && 'toDate' in entityDate) {
        // Firestore Timestamp
        dateObj = (entityDate as any).toDate();
      } else {
        // Try to parse as string or number
        dateObj = new Date(entityDate);
      }

      // Validate date
      if (dateObj instanceof Date && !isNaN(dateObj.getTime())) {
        // Format date in local timezone (avoid UTC conversion issues)
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        console.log('✅ Setting date fields - from:', '', 'to:', dateStr);
        setDateTo(dateStr); // Date de fin = date de l'événement
        setDateFrom(''); // Date de début vide par défaut
        console.log('✅ After setState - dateFrom:', dateFrom, 'dateTo:', dateTo);
      } else {
        console.error('❌ Invalid entityDate:', entityDate);
        setDateFrom('');
        setDateTo('');
      }
    } else {
      console.log('⚠️ No entityDate provided, clearing date fields');
      setDateFrom('');
      setDateTo('');
    }
  }, [isOpen, entityDate]);

  // Quick date filter logic (relative to entityDate)
  useEffect(() => {
    // Don't run if panel is closed or no entity date
    if (!isOpen || !entityDate) return;

    // If "all" is selected, don't clear dates - entityDate useEffect handles them
    if (quickDateFilter === 'all') return;

    // Handle both Date objects and Firestore Timestamps
    let eventDate: Date;
    if (entityDate instanceof Date) {
      eventDate = entityDate;
    } else if (typeof entityDate === 'object' && 'toDate' in entityDate) {
      // Firestore Timestamp
      eventDate = (entityDate as any).toDate();
    } else {
      // Try to parse as string or number
      eventDate = new Date(entityDate);
    }

    eventDate.setHours(0, 0, 0, 0);

    // Helper function to format date in local timezone
    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    switch (quickDateFilter) {
      case 'une_semaine': {
        const oneWeekBefore = new Date(eventDate);
        oneWeekBefore.setDate(eventDate.getDate() - 7);
        setDateFrom(formatLocalDate(oneWeekBefore));
        setDateTo(formatLocalDate(eventDate));
        break;
      }
      case 'un_mois': {
        const oneMonthBefore = new Date(eventDate);
        oneMonthBefore.setMonth(eventDate.getMonth() - 1);
        setDateFrom(formatLocalDate(oneMonthBefore));
        setDateTo(formatLocalDate(eventDate));
        break;
      }
      case 'deux_mois': {
        const twoMonthsBefore = new Date(eventDate);
        twoMonthsBefore.setMonth(eventDate.getMonth() - 2);
        setDateFrom(formatLocalDate(twoMonthsBefore));
        setDateTo(formatLocalDate(eventDate));
        break;
      }
    }
  }, [quickDateFilter, entityDate, isOpen]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    const filtered = transactions.filter(tx => {
      // ALWAYS: Exclude parent transactions (ventilated/split)
      if (tx.is_parent) return false;

      // Exclude transactions already linked to this entity
      if (linkedTransactionIds.includes(tx.id)) return false;

      // MODE-SPECIFIC FILTERING
      if (mode === 'inscription') {
        // INSCRIPTION: Only show POSITIVE transactions (income)
        if (tx.montant <= 0) return false;

        // Exclude transactions already linked to ANY inscription
        const linkedToInscription = tx.matched_entities?.some(
          e => e.entity_type === 'inscription'
        );
        if (linkedToInscription) return false;
      } else if (mode === 'expense') {
        // EXPENSE: Only show NEGATIVE transactions (expenses)
        if (tx.montant >= 0) return false;
      }

      // Filtre par type (only for event mode, others are auto-filtered above)
      if (mode === 'event') {
        if (filterType === 'income' && tx.montant <= 0) return false;
        if (filterType === 'expense' && tx.montant >= 0) return false;
      }

      // Filtre par réconciliation
      if (filterReconciled === 'reconciled' && !tx.reconcilie) return false;
      if (filterReconciled === 'unreconciled' && tx.reconcilie) return false;

      // Filtre par recherche
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = tx.contrepartie_nom.toLowerCase().includes(term);
        const matchComm = tx.communication.toLowerCase().includes(term);
        if (!matchName && !matchComm) return false;
      }

      // Filtre par date
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (tx.date_execution < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (tx.date_execution > to) return false;
      }

      // Filtre par montant (en valeur absolue)
      const montantAbs = Math.abs(tx.montant);
      if (montantFrom) {
        const from = parseFloat(montantFrom);
        if (!isNaN(from) && montantAbs < from) return false;
      }
      if (montantTo) {
        const to = parseFloat(montantTo);
        if (!isNaN(to) && montantAbs > to) return false;
      }

      return true;
    });

    // 🔢 SORT: Apply sorting based on sortField and sortDirection
    let sorted: TransactionBancaire[];

    if (sortField === 'pertinence') {
      // ✨ TRI PAR PERTINENCE: Utiliser le service de suggestion
      const context: MatchContext = {
        type: mode,
        targetAmount: targetAmount,
        targetName: mode === 'inscription' ? inscriptionMemberName : entityName,
        targetDate: entityDate,
        eventDate: mode === 'inscription' ? entityDate : undefined
      };

      const withScores = sortTransactionsByRelevance(filtered, context);
      sorted = withScores.map(item => item.transaction);

      // Note: sortDirection est ignoré pour 'pertinence' car le tri est toujours décroissant (meilleur score d'abord)
    } else {
      // Tri classique
      sorted = [...filtered].sort((a, b) => {
        let comparison = 0;

        switch (sortField) {
          case 'date':
            comparison = a.date_execution.getTime() - b.date_execution.getTime();
            break;
          case 'montant':
            comparison = Math.abs(a.montant) - Math.abs(b.montant);
            break;
          case 'titre':
            comparison = a.contrepartie_nom.localeCompare(b.contrepartie_nom);
            break;
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });

      // 🔢 OVERRIDE: If montantFrom is set, prioritize sorting by amount ascending
      // This shows transactions starting from the filter amount and going up
      if (montantFrom && !isNaN(parseFloat(montantFrom)) && sortField !== 'montant') {
        sorted = sorted.sort((a, b) => Math.abs(a.montant) - Math.abs(b.montant));
      }
    }

    return sorted;
  }, [transactions, linkedTransactionIds, filterType, filterReconciled, searchTerm, dateFrom, dateTo, montantFrom, montantTo, mode, sortField, sortDirection, targetAmount, inscriptionMemberName, entityName, entityDate]);

  // Groupement par montant (optionnel)
  const transactionGroups = useMemo(() => {
    if (!groupByAmount) return null;
    return groupTransactionsByAmount(filteredTransactions, 1); // Tolérance de 1€
  }, [filteredTransactions, groupByAmount]);

  const toggleSelection = (id: string) => {
    // INSCRIPTION MODE: Single-select only
    if (mode === 'inscription') {
      if (selectedIds.has(id)) {
        setSelectedIds(new Set()); // Deselect
      } else {
        setSelectedIds(new Set([id])); // Select only this one
      }
      return;
    }

    // EVENT/EXPENSE MODE: Multi-select
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set(filteredTransactions.map(tx => tx.id));
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to descending
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    try {
      await onLinkTransactions(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Error linking transactions:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleViewDetail = (transactionId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent checkbox toggle

    // Build return context URL params
    const params = new URLSearchParams({
      openTransaction: transactionId,
      returnTo: mode,
      entityId: entityId,
      entityName: entityName
    });

    // Close modal and navigate
    onClose();
    navigate(`/transactions?${params.toString()}`);
  };

  const isLinkedToOther = (tx: TransactionBancaire) => {
    // Determine entity type based on mode
    const entityTypes = mode === 'event' ? ['event']
                      : mode === 'inscription' ? ['inscription']
                      : ['expense', 'demand']; // expense can be stored as 'expense' or 'demand'

    return tx.matched_entities?.some(e =>
      entityTypes.includes(e.entity_type) && e.entity_id !== entityId
    );
  };

  const getBadgeText = () => {
    if (mode === 'event') return 'Lié à un autre événement';
    if (mode === 'inscription') return 'Lié à une autre inscription';
    return 'Lié à une autre dépense';
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Panel (no overlay to allow both windows visible) */}
      <div className={cn(
        "fixed left-0 top-0 h-full bg-white shadow-2xl z-[110] flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "w-full max-w-4xl"
      )}>
        {/* Header */}
        <div className={cn(
          "px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r",
          colors.header
        )}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                {mode === 'inscription' ? 'Lier une transaction' : 'Lier des transactions'}
              </h2>
              <p className={cn("text-sm mt-1", colors.headerText)}>
                {mode === 'inscription'
                  ? `à l'inscription de ${inscriptionMemberName}`
                  : `à ${entityName}`}
              </p>
              {mode === 'inscription' && targetAmount && (
                <p className={cn("text-xs mt-1", colors.headerTextLight)}>
                  💡 Recherche de transactions de {formatMontant(targetAmount)}
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

        {/* Filters */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom, communication ou montant..."
              className={cn(
                "w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:border-transparent text-sm",
                `focus:ring-${colors.ring}`
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick Date Filters - Only show if entityDate is provided */}
          {entityDate && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setQuickDateFilter('all')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  quickDateFilter === 'all'
                    ? `bg-${colors.primary} text-white`
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                )}
              >
                Toutes périodes
              </button>
              <button
                onClick={() => setQuickDateFilter('une_semaine')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  quickDateFilter === 'une_semaine'
                    ? `bg-${colors.primary} text-white`
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                )}
              >
                - 1 semaine
              </button>
              <button
                onClick={() => setQuickDateFilter('un_mois')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  quickDateFilter === 'un_mois'
                    ? `bg-${colors.primary} text-white`
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                )}
              >
                - 1 mois
              </button>
              <button
                onClick={() => setQuickDateFilter('deux_mois')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  quickDateFilter === 'deux_mois'
                    ? `bg-${colors.primary} text-white`
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                )}
              >
                - 2 mois
              </button>
            </div>
          )}

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Type filter - only show for event mode */}
            {mode === 'event' && (
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className={cn(
                  "px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                  `focus:ring-${colors.ring}`
                )}
              >
                <option value="all">Tous types</option>
                <option value="income">Revenus</option>
                <option value="expense">Dépenses</option>
              </select>
            )}

            <select
              value={filterReconciled}
              onChange={(e) => setFilterReconciled(e.target.value as any)}
              className={cn(
                "px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                `focus:ring-${colors.ring}`
              )}
            >
              <option value="all">Tous statuts</option>
              <option value="reconciled">Réconciliés</option>
              <option value="unreconciled">Non réconciliés</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setQuickDateFilter('all'); // Reset quick filter when manually changing dates
              }}
              placeholder="Du"
              className={cn(
                "px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                `focus:ring-${colors.ring}`
              )}
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setQuickDateFilter('all'); // Reset quick filter when manually changing dates
              }}
              placeholder="Au"
              className={cn(
                "px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                `focus:ring-${colors.ring}`
              )}
            />
          </div>

          {/* Montant filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Montant:</span>
            <input
              type="number"
              value={montantFrom}
              onChange={(e) => setMontantFrom(e.target.value)}
              placeholder="De"
              step="0.01"
              min="0"
              className={cn(
                "w-28 px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                `focus:ring-${colors.ring}`
              )}
            />
            <span className="text-sm text-gray-500 dark:text-dark-text-muted">à</span>
            <input
              type="number"
              value={montantTo}
              onChange={(e) => setMontantTo(e.target.value)}
              placeholder="À"
              step="0.01"
              min="0"
              className={cn(
                "w-28 px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2",
                `focus:ring-${colors.ring}`
              )}
            />
            <span className="text-sm text-gray-500 dark:text-dark-text-muted">€</span>
          </div>

          {/* Sort Buttons */}
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-gray-600 dark:text-dark-text-secondary py-1.5">Trier par:</span>
            <button
              onClick={() => toggleSort('date')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'date'
                  ? `bg-${colors.primary} text-white`
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
                  ? `bg-${colors.primary} text-white`
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              💶 Montant
              {sortField === 'montant' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSort('titre')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'titre'
                  ? `bg-${colors.primary} text-white`
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <FileText className="h-3.5 w-3.5" />
              Titre
              {sortField === 'titre' && (
                sortDirection === 'asc' ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSort('pertinence')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                sortField === 'pertinence'
                  ? `bg-${colors.primary} text-white`
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
              title="Trie les transactions par pertinence (nom, montant, date)"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Pertinence
            </button>
          </div>

          {/* Groupement par montant */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={groupByAmount}
                onChange={(e) => setGroupByAmount(e.target.checked)}
                className={cn(
                  "w-4 h-4 rounded border-gray-300 focus:ring-2",
                  `text-${colors.primary}`,
                  `focus:ring-${colors.ring}`
                )}
              />
              <span className="text-sm text-gray-700 dark:text-dark-text-secondary">
                Grouper par montants similaires
              </span>
            </label>
            {groupByAmount && (
              <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                (tolérance: ±1€)
              </span>
            )}
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedIds.size > 0 ? (
                <span className={cn("font-medium", `text-${colors.text}`)}>
                  {selectedIds.size} transaction{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
                </span>
              ) : (
                <span>{filteredTransactions.length} transaction{filteredTransactions.length > 1 ? 's' : ''} disponible{filteredTransactions.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-600 dark:text-dark-text-secondary hover:text-gray-800 dark:hover:text-dark-text-primary underline"
                >
                  {mode === 'inscription' ? 'Désélectionner' : 'Tout désélectionner'}
                </button>
              )}
              {/* Hide "Select All" in inscription mode (single-select) */}
              {mode !== 'inscription' && (
                <button
                  onClick={selectAll}
                  className={cn("text-xs underline", `text-${colors.text}`, `hover:text-${colors.textHover}`)}
                  disabled={filteredTransactions.length === 0}
                >
                  Tout sélectionner
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Transaction list */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <Filter className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune transaction trouvée</p>
              <p className="text-sm mt-1">Essayez d'ajuster les filtres</p>
            </div>
          ) : groupByAmount && transactionGroups ? (
            // AFFICHAGE GROUPÉ PAR MONTANT
            <div className="space-y-4">
              {Array.from(transactionGroups.entries())
                .sort(([amountA], [amountB]) => amountB - amountA) // Tri décroissant par montant
                .map(([groupAmount, groupTransactions]) => (
                  <div key={groupAmount} className="space-y-2">
                    {/* En-tête du groupe */}
                    <div className="sticky top-0 bg-gray-100 dark:bg-dark-bg-tertiary px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border z-10">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                          Montant: {formatMontant(groupAmount)} <span className="text-gray-500">± 1€</span>
                        </span>
                        <span className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {groupTransactions.length} transaction{groupTransactions.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Transactions du groupe */}
                    <div className="pl-3 space-y-2">
                      {groupTransactions.map((tx) => {
                const isSelected = selectedIds.has(tx.id);
                const otherEntity = isLinkedToOther(tx);
                const isChild = !!tx.parent_transaction_id;
                const parentTransaction = isChild ? transactions.find(t => t.id === tx.parent_transaction_id) : null;

                // Check if amount matches target (for inscription mode)
                const isAmountMatch = mode === 'inscription' && targetAmount &&
                  Math.abs(tx.montant - targetAmount) <= 0.50;
                const isExactMatch = mode === 'inscription' && targetAmount &&
                  Math.abs(tx.montant - targetAmount) < 0.01;

                return (
                  <div
                    key={tx.id}
                    onClick={() => toggleSelection(tx.id)}
                    className={cn(
                      "border rounded-lg p-4 cursor-pointer transition-all",
                      isSelected
                        ? `border-${colors.border} bg-${colors.primaryLight} shadow-sm`
                        : isExactMatch
                        ? "border-green-400 bg-green-50 hover:border-green-500 hover:shadow-sm"
                        : isAmountMatch
                        ? "border-yellow-400 bg-yellow-50 hover:border-yellow-500 hover:shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? `border-${colors.border} bg-${colors.primary}`
                            : "border-gray-300"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Transaction details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                              {isChild && parentTransaction
                                ? `${parentTransaction.contrepartie_nom} - ${tx.contrepartie_nom} /${tx.communication}`
                                : tx.contrepartie_nom
                              }
                            </p>
                            {!isChild && (
                              <p className="text-sm text-gray-600 dark:text-dark-text-secondary truncate mt-0.5">
                                {tx.communication}
                              </p>
                            )}
                            <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
                              {tx.numero_sequence && (
                                <span className="font-medium text-gray-700 dark:text-dark-text-primary">
                                  {tx.numero_sequence}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(tx.date_execution)}
                              </span>
                              {tx.categorie && (
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary rounded-full">
                                  {tx.categorie}
                                </span>
                              )}
                              {isChild && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1 font-medium">
                                  ├─ Ligne {tx.child_index}/{parentTransaction?.child_count || '?'}
                                </span>
                              )}
                              {otherEntity && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {getBadgeText()}
                                </span>
                              )}
                              {/* Amount match indicator (inscription mode only) */}
                              {isExactMatch && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-1 font-medium">
                                  ✓ Exact
                                </span>
                              )}
                              {isAmountMatch && !isExactMatch && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                                  ~ Proche
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-start gap-2">
                              <div>
                                <p className={cn(
                                  "font-bold text-lg",
                                  tx.montant > 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {formatMontant(tx.montant)}
                                </p>
                                <div className="mt-1">
                                  {tx.montant > 0 ? (
                                    <TrendingUp className="h-4 w-4 text-green-600 inline" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-600 inline" />
                                  )}
                                </div>
                              </div>
                              {/* View Detail Button */}
                              <button
                                onClick={(e) => handleViewDetail(tx.id, e)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                                title="Voir le détail de la transaction"
                              >
                                <Eye className="h-4 w-4 text-gray-500 hover:text-gray-700 dark:text-dark-text-muted dark:hover:text-dark-text-primary" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    ) : (
            // AFFICHAGE NORMAL (SANS GROUPEMENT)
            <div className="space-y-2">
              {filteredTransactions.map((tx) => {
                const isSelected = selectedIds.has(tx.id);
                const otherEntity = isLinkedToOther(tx);
                const isChild = !!tx.parent_transaction_id;
                const parentTransaction = isChild ? transactions.find(t => t.id === tx.parent_transaction_id) : null;

                // Check if amount matches target (for inscription mode)
                const isAmountMatch = mode === 'inscription' && targetAmount &&
                  Math.abs(tx.montant - targetAmount) <= 0.50;
                const isExactMatch = mode === 'inscription' && targetAmount &&
                  Math.abs(tx.montant - targetAmount) < 0.01;

                return (
                  <div
                    key={tx.id}
                    onClick={() => toggleSelection(tx.id)}
                    className={cn(
                      "border rounded-lg p-4 cursor-pointer transition-all",
                      isSelected
                        ? `border-${colors.border} bg-${colors.primaryLight} shadow-sm`
                        : isExactMatch
                        ? "border-green-400 bg-green-50 hover:border-green-500 hover:shadow-sm"
                        : isAmountMatch
                        ? "border-yellow-400 bg-yellow-50 hover:border-yellow-500 hover:shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? `border-${colors.border} bg-${colors.primary}`
                            : "border-gray-300"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Transaction details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                              {isChild && parentTransaction
                                ? `${parentTransaction.contrepartie_nom} - ${tx.contrepartie_nom} /${tx.communication}`
                                : tx.contrepartie_nom
                              }
                            </p>
                            {!isChild && (
                              <p className="text-sm text-gray-600 dark:text-dark-text-secondary truncate mt-0.5">
                                {tx.communication}
                              </p>
                            )}
                            <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
                              {tx.numero_sequence && (
                                <span className="font-medium text-gray-700 dark:text-dark-text-primary">
                                  {tx.numero_sequence}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(tx.date_execution)}
                              </span>
                              {tx.categorie && (
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary rounded-full">
                                  {tx.categorie}
                                </span>
                              )}
                              {isChild && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full flex items-center gap-1 font-medium">
                                  ├─ Ligne {tx.child_index}/{parentTransaction?.child_count || '?'}
                                </span>
                              )}
                              {otherEntity && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  {getBadgeText()}
                                </span>
                              )}
                              {/* Amount match indicator (inscription mode only) */}
                              {isExactMatch && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-1 font-medium">
                                  ✓ Exact
                                </span>
                              )}
                              {isAmountMatch && !isExactMatch && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                                  ~ Proche
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="flex items-start gap-2">
                              <div>
                                <p className={cn(
                                  "font-bold text-lg",
                                  tx.montant > 0 ? "text-green-600" : "text-red-600"
                                )}>
                                  {formatMontant(tx.montant)}
                                </p>
                                <div className="mt-1">
                                  {tx.montant > 0 ? (
                                    <TrendingUp className="h-4 w-4 text-green-600 inline" />
                                  ) : (
                                    <TrendingDown className="h-4 w-4 text-red-600 inline" />
                                  )}
                                </div>
                              </div>
                              {/* View Detail Button */}
                              <button
                                onClick={(e) => handleViewDetail(tx.id, e)}
                                className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                                title="Voir le détail de la transaction"
                              >
                                <Eye className="h-4 w-4 text-gray-500 hover:text-gray-700 dark:text-dark-text-muted dark:hover:text-dark-text-primary" />
                              </button>
                            </div>
                          </div>
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
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:hover:bg-dark-bg-secondary transition-colors"
            disabled={saving}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selectedIds.size === 0}
            className={cn(
              "px-6 py-2 text-white rounded-lg transition-colors font-medium",
              `bg-${colors.primary}`,
              `hover:bg-${colors.primaryHover}`,
              (saving || selectedIds.size === 0) && "opacity-50 cursor-not-allowed"
            )}
          >
            {saving ? 'Enregistrement...' : `Ajouter ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
          </button>
        </div>
      </div>
    </>
  );
}
