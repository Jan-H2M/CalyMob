import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Check, Calendar, MapPin, Link2, AlertCircle, TrendingUp, TrendingDown, ArrowUpDown, Users, DollarSign, Gift, ShoppingBag, Award, FileText, Waves, Droplets, PartyPopper, Sparkles } from 'lucide-react';
import { TransactionBancaire, Operation, TypeOperation, EventCategory, EVENT_CATEGORY_LABELS, DemandeRemboursement, InscriptionEvenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { ExpenseOperationMatchingService, ExpenseOperationMatch } from '@/services/expenseOperationMatchingService';
import { logger } from '@/utils/logger';

interface OperationLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: TransactionBancaire | null; // Optional - only needed when linking from a transaction
  demande?: DemandeRemboursement | null; // Optional - for linking expense to operation
  inscriptions?: Map<string, InscriptionEvenement[]>; // Optional - for smart matching when demande is provided
  operations: Operation[];
  linkedOperationIds: string[];
  onLinkOperations: (operationIds: string[]) => Promise<void>;
  bulkMode?: boolean; // Mode liaison en masse
  bulkCount?: number; // Nombre de transactions sélectionnées en mode bulk
  position?: 'left' | 'right'; // Position du panel (left quand detail view est ouverte à droite)
  singleSelect?: boolean; // Mode sélection unique (pour ventilation)
  title?: string; // Titre personnalisé
  subtitle?: string; // Sous-titre personnalisé
}

type SortField = 'date' | 'montant' | 'titre';
type SortDirection = 'asc' | 'desc';
type QuickDateFilter = 'all' | 'cette_semaine' | 'ce_mois' | 'deux_mois';

// Helper: convertir Firestore Timestamp, Date, ou string en JS Date
const toJSDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Fuzzy matching: vérifie si deux mots sont similaires (tolérant aux fautes de frappe)
// Utilise la distance de Levenshtein normalisée + substring matching
const fuzzyMatch = (word1: string, word2: string): boolean => {
  if (word1 === word2) return true;
  // Substring match: "roche" matches "rochefontaine", "roce" in "rochefontaine"
  if (word1.length >= 3 && word2.includes(word1)) return true;
  if (word2.length >= 3 && word1.includes(word2)) return true;
  // Levenshtein distance for words of similar length (tolérance aux typos)
  if (Math.abs(word1.length - word2.length) > 3) return false;
  const maxLen = Math.max(word1.length, word2.length);
  if (maxLen < 4) return false; // Trop court pour fuzzy
  const distance = levenshtein(word1, word2);
  const similarity = 1 - distance / maxLen;
  return similarity >= 0.65; // 65% similarity = tolérant aux typos
};

const levenshtein = (a: string, b: string): number => {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
};

// Color coding per event category
const categoryColors: Record<EventCategory, { bg: string; border: string; text: string; icon: typeof Calendar }> = {
  plongee: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: Waves },
  piscine: { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-700', icon: Droplets },
  sortie: { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700', icon: PartyPopper }
};

// Color coding per operation type (kept for display badges)
const typeColors: Record<TypeOperation, { bg: string; border: string; text: string; icon: typeof Calendar }> = {
  evenement: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', icon: Calendar },
  cotisation: { bg: 'bg-green-50', border: 'border-green-300', text: 'text-green-700', icon: Users },
  caution: { bg: 'bg-pink-50', border: 'border-pink-300', text: 'text-pink-700', icon: Gift },
  vente: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', icon: ShoppingBag },
  subvention: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', icon: Award },
  autre: { bg: 'bg-gray-50 dark:bg-dark-bg-tertiary', border: 'border-gray-300 dark:border-dark-border', text: 'text-gray-700 dark:text-dark-text-primary', icon: FileText }
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
  demande,
  inscriptions,
  operations,
  linkedOperationIds,
  onLinkOperations,
  bulkMode = false,
  bulkCount = 0,
  position = 'right',
  singleSelect = false,
  title,
  subtitle
}: OperationLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [quickDateFilter, setQuickDateFilter] = useState<QuickDateFilter>('all');
  const [saving, setSaving] = useState(false);

  // Reset selection when panel opens - initialiser avec les IDs déjà liés
  // Auto-préfiltrer par date (±1 mois autour de la transaction) pour trouver plus vite
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(linkedOperationIds));
      setSearchTerm('');
      setCategoryFilter('all');
      setSortField('date');
      setSortDirection('desc');

      // Smart date pre-filter: si on a une transaction, filtrer ±1 mois autour de sa date
      const txDate = transaction?.date_execution ? toJSDate(transaction.date_execution) : null;
      if (txDate) {
        const from = new Date(txDate);
        from.setMonth(from.getMonth() - 1);
        const to = new Date(txDate);
        to.setMonth(to.getMonth() + 1);
        setDateFrom(from.toISOString().split('T')[0]);
        setDateTo(to.toISOString().split('T')[0]);
        setQuickDateFilter('all'); // custom range, pas un quick filter
      } else {
        setDateFrom('');
        setDateTo('');
        setQuickDateFilter('all');
      }

      // Auto-focus search input avec délai pour l'animation
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, linkedOperationIds, transaction]);

  // Quick date filter logic
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (quickDateFilter) {
      case 'cette_semaine': {
        // Show current week (Monday to Sunday)
        const monday = new Date(today);
        const day = today.getDay();
        const diff = day === 0 ? -6 : 1 - day; // If Sunday, go back 6 days, else go to Monday
        monday.setDate(today.getDate() + diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        setDateFrom(monday.toISOString().split('T')[0]);
        setDateTo(sunday.toISOString().split('T')[0]);
        break;
      }
      case 'ce_mois': {
        // Show current month + previous 2 months (3 months total)
        const threeMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        setDateFrom(threeMonthsAgo.toISOString().split('T')[0]);
        setDateTo(lastDayOfCurrentMonth.toISOString().split('T')[0]);
        break;
      }
      case 'deux_mois': {
        // Show current month + previous 4 months (5 months total)
        const fiveMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 4, 1);
        const lastDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        setDateFrom(fiveMonthsAgo.toISOString().split('T')[0]);
        setDateTo(lastDayOfCurrentMonth.toISOString().split('T')[0]);
        break;
      }
      case 'all':
        setDateFrom('');
        setDateTo('');
        break;
    }
  }, [quickDateFilter]);

  // Count operations by event category
  const categoryCounts = useMemo(() => {
    const counts: Record<EventCategory | 'all', number> = {
      all: 0,
      plongee: 0,
      piscine: 0,
      sortie: 0
    };

    operations.forEach(op => {
      // En mode singleSelect, on compte aussi l'opération déjà liée
      if (singleSelect || !linkedOperationIds.includes(op.id)) {
        counts.all++;
        if (op.event_category) {
          counts[op.event_category]++;
        }
      }
    });

    return counts;
  }, [operations, linkedOperationIds, singleSelect]);

  // Compute demande-based suggestions using the matching service
  const demandeMatches = useMemo(() => {
    if (!demande || operations.length === 0) return new Map<string, ExpenseOperationMatch>();

    const matches = ExpenseOperationMatchingService.findMatchesForDemande(
      demande,
      operations,
      inscriptions || new Map()
    );

    // Convert to map for quick lookup
    const matchMap = new Map<string, ExpenseOperationMatch>();
    for (const match of matches) {
      matchMap.set(match.operation_id, match);
    }
    return matchMap;
  }, [demande, operations, inscriptions]);

  // Smart suggestions: match by amount (±10%) and date (same month)
  const getSuggestionScore = (operation: Operation): number => {
    // If demande provided, use the matching service score
    if (demande) {
      const match = demandeMatches.get(operation.id);
      return match ? match.score : 0;
    }

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

    // Date match (same month ±1)
    const transactionDate = toJSDate(transaction.date_execution);
    const operationDate = toJSDate(operation.date_debut || operation.periode_debut);
    if (transactionDate && operationDate) {
      const monthDiff = Math.abs(
        (transactionDate.getFullYear() - operationDate.getFullYear()) * 12 +
        (transactionDate.getMonth() - operationDate.getMonth())
      );
      if (monthDiff === 0) {
        score += 30; // Same month
      } else if (monthDiff === 1) {
        score += 15; // Adjacent month (event often billed in next month)
      }
    }

    // Keyword match: compare words bidirectionally between communication/contrepartie and event title
    if (transaction.communication || transaction.contrepartie_nom) {
      const searchText = `${transaction.communication || ''} ${transaction.contrepartie_nom || ''}`.toLowerCase();
      const titre = (operation.titre || '').toLowerCase();
      const stopWords = new Set(['de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'en', 'à', 'au', 'aux', 'pour', 'par', 'sur', 'avec', 'dans', 'the', 'of', 'and', 'for', 'asbl', 'virement']);

      if (titre) {
        // Full match: entire title found in communication or vice versa
        if (searchText.includes(titre) || titre.includes(searchText.trim())) {
          score += 30;
        } else {
          // Bidirectional fuzzy word matching:
          // Tolerant aux fautes: "Roche" ≈ "Rochefontaine", "Roce" ≈ "Roche", etc.
          const titleWords = titre.split(/[\s\-_/]+/).filter(w => w.length > 2 && !stopWords.has(w));
          const commWords = searchText.split(/[\s\-_/]+/).filter(w => w.length > 2 && !stopWords.has(w));

          // 1. Check title words fuzzy-matched in communication words
          const titleMatchCount = titleWords.filter(tw =>
            commWords.some(cw => fuzzyMatch(tw, cw))
          ).length;

          // 2. Check communication words fuzzy-matched in title words
          const commMatchCount = commWords.filter(cw =>
            titleWords.some(tw => fuzzyMatch(cw, tw))
          ).length;

          // Use the best match direction
          const bestMatchCount = Math.max(titleMatchCount, commMatchCount);
          const bestTotal = titleMatchCount >= commMatchCount ? titleWords.length : commWords.length;

          if (bestTotal > 0 && bestMatchCount > 0) {
            const matchRatio = bestMatchCount / bestTotal;
            if (matchRatio >= 0.5) {
              score += Math.round(30 * matchRatio); // Up to +30 for strong word match
            } else {
              score += 15; // At least one significant word matches
            }
          }
        }
      }
    }

    return score;
  };

  // Filter and sort operations
  const filteredOperations = useMemo(() => {
    let filtered = operations.filter(operation => {
      // En mode singleSelect, on garde l'opération déjà liée pour permettre de la voir/changer
      // En mode multi-select, on exclut les opérations déjà liées
      if (!singleSelect && linkedOperationIds.includes(operation.id)) return false;

      // Category filter
      if (categoryFilter !== 'all' && operation.event_category !== categoryFilter) return false;

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
      if (dateFrom || dateTo) {
        // If date filter is active, exclude operations without a date
        if (!opDate) return false;

        // Convert opDate to timestamp (handles Firestore Timestamp, Date objects, and strings)
        let opTimestamp: number;
        if (opDate && typeof opDate === 'object' && 'seconds' in opDate) {
          // Firestore Timestamp
          opTimestamp = (opDate as { seconds: number }).seconds * 1000;
        } else if (opDate instanceof Date) {
          opTimestamp = opDate.getTime();
        } else {
          opTimestamp = new Date(opDate).getTime();
        }

        if (dateFrom) {
          const fromTimestamp = new Date(dateFrom).getTime();
          if (opTimestamp < fromTimestamp) return false;
        }
        if (dateTo) {
          // Set to end of day for inclusive comparison
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (opTimestamp > toDate.getTime()) return false;
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
  }, [operations, linkedOperationIds, categoryFilter, searchTerm, dateFrom, dateTo, sortField, sortDirection, transaction, singleSelect]);

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
    if (singleSelect) {
      // En mode singleSelect, on remplace la sélection
      if (selectedIds.has(operationId)) {
        setSelectedIds(new Set());
      } else {
        setSelectedIds(new Set([operationId]));
      }
    } else {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(operationId)) {
        newSelected.delete(operationId);
      } else {
        newSelected.add(operationId);
      }
      setSelectedIds(newSelected);
    }
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
      logger.error('Error linking operations:', error);
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

      {/* Panel - position dynamique selon le contexte */}
      <div className={cn(
        "fixed top-0 h-full bg-white dark:bg-dark-bg-primary shadow-2xl z-[70] flex flex-col transition-transform duration-300",
        position === 'left' ? "left-0" : "right-0",
        position === 'left'
          ? (isOpen ? "translate-x-0" : "-translate-x-full")
          : (isOpen ? "translate-x-0" : "translate-x-full"),
        "w-full max-w-2xl"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-purple-600 to-purple-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                {title || (singleSelect ? 'Choisir une activité' : 'Lier des activités')}
              </h2>
              {subtitle ? (
                <p className="text-purple-100 text-sm mt-1">{subtitle}</p>
              ) : bulkMode ? (
                <p className="text-purple-100 text-sm mt-1">
                  à {bulkCount} transaction{bulkCount > 1 ? 's' : ''} sélectionnée{bulkCount > 1 ? 's' : ''}
                </p>
              ) : transaction && (
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

        {/* Compact Filters */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary space-y-2">
          {/* Row 1: Category filter + Search */}
          <div className="flex items-center gap-2">
            {/* Category buttons */}
            <div className="flex gap-1 flex-shrink-0">
              <button
                onClick={() => setCategoryFilter('all')}
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium transition-colors",
                  categoryFilter === 'all'
                    ? "bg-purple-600 text-white"
                    : "bg-white border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary"
                )}
              >
                Tous ({categoryCounts.all})
              </button>
              {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map(category => {
                const config = categoryColors[category];
                const Icon = config.icon;
                return (
                  <button
                    key={category}
                    onClick={() => setCategoryFilter(category)}
                    className={cn(
                      "px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1",
                      categoryFilter === category
                        ? `${config.bg} ${config.border} ${config.text} border`
                        : "bg-white border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {EVENT_CATEGORY_LABELS[category]} ({categoryCounts[category]})
                  </button>
                );
              })}
            </div>
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Rechercher..."
                className="w-full pl-7 pr-2 py-1 border border-gray-300 dark:border-dark-border rounded text-xs focus:ring-1 focus:ring-purple-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Row 2: Date filters + Sort + Selection */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick date filters */}
            <div className="flex gap-1">
              {[
                { key: 'all' as QuickDateFilter, label: 'Tout' },
                { key: 'cette_semaine' as QuickDateFilter, label: 'Semaine' },
                { key: 'ce_mois' as QuickDateFilter, label: 'Mois' },
                { key: 'deux_mois' as QuickDateFilter, label: '2 mois' }
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setQuickDateFilter(key)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium transition-colors",
                    quickDateFilter === key
                      ? "bg-purple-600 text-white"
                      : "bg-white border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Date inputs */}
            <div className="flex gap-1">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setQuickDateFilter('all'); }}
                className="px-1.5 py-1 border border-gray-300 dark:border-dark-border rounded text-xs focus:ring-1 focus:ring-purple-500 w-28"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setQuickDateFilter('all'); }}
                className="px-1.5 py-1 border border-gray-300 dark:border-dark-border rounded text-xs focus:ring-1 focus:ring-purple-500 w-28"
              />
            </div>

            {/* Divider */}
            <div className="h-4 w-px bg-gray-300" />

            {/* Sort */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 dark:text-dark-text-muted">Tri:</span>
              {[
                { field: 'date' as SortField, icon: Calendar },
                { field: 'montant' as SortField, icon: DollarSign },
                { field: 'titre' as SortField, icon: ArrowUpDown }
              ].map(({ field, icon: Icon }) => (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={cn(
                    "p-1 rounded transition-colors flex items-center gap-0.5",
                    sortField === field
                      ? "bg-purple-600 text-white"
                      : "bg-white border border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary"
                  )}
                  title={field.charAt(0).toUpperCase() + field.slice(1)}
                >
                  <Icon className="h-3 w-3" />
                  {sortField === field && (
                    sortDirection === 'asc' ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />
                  )}
                </button>
              ))}
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Selection controls - masqués en mode singleSelect */}
            {!singleSelect && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={selectAll}
                  disabled={filteredOperations.length === 0}
                  className="text-purple-600 hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Tout
                </button>
                <span className="text-gray-400 dark:text-dark-text-muted">|</span>
                <button
                  onClick={clearSelection}
                  disabled={selectedIds.size === 0}
                  className="text-gray-500 dark:text-dark-text-muted hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Aucun
                </button>
                <span className="text-gray-500 dark:text-dark-text-muted ml-1">
                  {selectedIds.size}/{filteredOperations.length}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredOperations.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune activité disponible</p>
              {(searchTerm || dateFrom || dateTo || categoryFilter !== 'all') && (
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
                        : `bg-white border-gray-200 dark:border-dark-border hover:border-purple-200 hover:bg-purple-50/30`,
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
                      {/* Checkbox ou Radio selon le mode */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          "w-5 h-5 flex items-center justify-center transition-colors border-2",
                          singleSelect ? "rounded-full" : "rounded",
                          isSelected
                            ? "bg-purple-600 border-purple-600"
                            : "border-gray-300 dark:border-dark-border bg-white"
                        )}>
                          {isSelected && (singleSelect
                            ? <div className="w-2 h-2 bg-white rounded-full" />
                            : <Check className="h-3 w-3 text-white" />
                          )}
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
                  {singleSelect ? 'Sélection...' : 'Liaison...'}
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  {singleSelect ? 'Sélectionner' : `Lier ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
