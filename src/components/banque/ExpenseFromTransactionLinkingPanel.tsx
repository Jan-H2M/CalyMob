import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Filter, Check, Euro, Calendar, User, FileText, CreditCard, Link2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { TransactionBancaire, DemandeRemboursement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

type SortField = 'date' | 'montant';
type SortDirection = 'asc' | 'desc';

interface ExpenseFromTransactionLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionBancaire;
  expenses: DemandeRemboursement[];
  linkedExpenseIds: string[];
  onLinkExpenses: (expenseIds: string[]) => Promise<void>;
}

const STATUT_COLORS = {
  'brouillon': 'bg-gray-100 text-gray-700',
  'soumis': 'bg-blue-100 text-blue-700',
  'en_attente_validation': 'bg-yellow-100 text-yellow-700',
  'approuve': 'bg-green-100 text-green-700',
  'rembourse': 'bg-purple-100 text-purple-700',
  'refuse': 'bg-red-100 text-red-700'
};

const STATUT_LABELS = {
  'brouillon': 'Brouillon',
  'soumis': 'Soumis',
  'en_attente_validation': 'En attente',
  'approuve': 'Approuvé',
  'rembourse': 'Remboursé',
  'refuse': 'Refusé'
};

export function ExpenseFromTransactionLinkingPanel({
  isOpen,
  onClose,
  transaction,
  expenses,
  linkedExpenseIds,
  onLinkExpenses
}: ExpenseFromTransactionLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [montantFrom, setMontantFrom] = useState('');
  const [montantTo, setMontantTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc'); // Default: recentste eerst
  const [dateQuickFilter, setDateQuickFilter] = useState<string>('all');

  // Reset selection when panel opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSearchTerm('');
      setFilterStatut('all');
      setFilterCategory('all');
      setDateFrom('');
      setDateTo('');
      setMontantFrom('');
      setMontantTo('');
    }
  }, [isOpen]);

  // Apply date quick filter
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (dateQuickFilter) {
      case 'cette_semaine': {
        const monday = new Date(today);
        monday.setDate(today.getDate() - today.getDay() + 1);
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
      case '2_mois': {
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
  }, [dateQuickFilter]);

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(expenses.map(e => e.categorie).filter(Boolean));
    return Array.from(cats);
  }, [expenses]);

  // Filter and sort expenses
  const filteredExpenses = useMemo(() => {
    let filtered = expenses.filter(expense => {
      // Exclure les demandes déjà liées à cette transaction
      if (linkedExpenseIds.includes(expense.id)) return false;

      // Filtre par statut
      if (filterStatut !== 'all' && expense.statut !== filterStatut) return false;

      // Filtre par catégorie
      if (filterCategory !== 'all' && expense.categorie !== filterCategory) return false;

      // Filtre par recherche (titre, description, demandeur, montant, date)
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchTitle = expense.titre?.toLowerCase().includes(term);
        const matchDesc = expense.description.toLowerCase().includes(term);
        const matchDemandeur = expense.demandeur_nom?.toLowerCase().includes(term);
        const matchMontant = expense.montant.toString().includes(term);
        const matchDate = formatDate(expense.date_depense || expense.date_demande).includes(term);
        if (!matchTitle && !matchDesc && !matchDemandeur && !matchMontant && !matchDate) return false;
      }

      // Filtre par date (utilise date_depense si disponible, sinon date_demande)
      const dateToFilter = expense.date_depense || expense.date_demande;
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (dateToFilter < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (dateToFilter > to) return false;
      }

      // Filtre par montant
      if (montantFrom) {
        const from = parseFloat(montantFrom);
        if (!isNaN(from) && expense.montant < from) return false;
      }
      if (montantTo) {
        const to = parseFloat(montantTo);
        if (!isNaN(to) && expense.montant > to) return false;
      }

      return true;
    });

    // Tri
    filtered.sort((a, b) => {
      let comparison = 0;

      if (sortField === 'date') {
        // Utilise date_depense si disponible, sinon date_demande
        const dateA = a.date_depense || a.date_demande;
        const dateB = b.date_depense || b.date_demande;
        comparison = new Date(dateA).getTime() - new Date(dateB).getTime();
      } else if (sortField === 'montant') {
        comparison = a.montant - b.montant;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [expenses, linkedExpenseIds, filterStatut, filterCategory, searchTerm, dateFrom, dateTo, montantFrom, montantTo, sortField, sortDirection]);

  // Toggle selection
  const toggleSelection = (expenseId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(expenseId)) {
      newSelected.delete(expenseId);
    } else {
      newSelected.add(expenseId);
    }
    setSelectedIds(newSelected);
  };

  // Select all filtered
  const selectAll = () => {
    setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Toggle sort
  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to desc
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Save
  const handleSave = async () => {
    if (selectedIds.size === 0) return;

    setSaving(true);
    try {
      await onLinkExpenses(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Error linking expenses:', error);
    } finally {
      setSaving(false);
    }
  };

  const hasTransaction = (expense: DemandeRemboursement) => {
    return !!expense.transaction_id;
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
                à la transaction {transaction.contrepartie_nom} ({formatMontant(transaction.montant)})
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white dark:bg-dark-bg-secondary/10 rounded-lg transition-colors"
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
              placeholder="Rechercher par titre, description, demandeur, montant, date..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Quick date filters */}
          <div className="flex gap-2">
            <button
              onClick={() => setDateQuickFilter('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                dateQuickFilter === 'all'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Toutes périodes
            </button>
            <button
              onClick={() => setDateQuickFilter('cette_semaine')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                dateQuickFilter === 'cette_semaine'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Cette semaine
            </button>
            <button
              onClick={() => setDateQuickFilter('ce_mois')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                dateQuickFilter === 'ce_mois'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              Ce mois
            </button>
            <button
              onClick={() => setDateQuickFilter('2_mois')}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                dateQuickFilter === '2_mois'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              2 derniers mois
            </button>
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">Tous statuts</option>
              <option value="brouillon">Brouillon</option>
              <option value="soumis">Soumis</option>
              <option value="en_attente_validation">En attente</option>
              <option value="approuve">Approuvé</option>
              <option value="rembourse">Remboursé</option>
              <option value="refuse">Refusé</option>
            </select>

            {categories.length > 0 && (
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              >
                <option value="all">Toutes catégories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
              placeholder="Date fin"
            />

            <input
              type="number"
              step="0.01"
              value={montantFrom}
              onChange={(e) => setMontantFrom(e.target.value)}
              placeholder="Montant min"
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 w-32"
            />
            <input
              type="number"
              step="0.01"
              value={montantTo}
              onChange={(e) => setMontantTo(e.target.value)}
              placeholder="Montant max"
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500 w-32"
            />
          </div>

          {/* Sort buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => toggleSort('date')}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                sortField === 'date'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <Calendar className="h-3.5 w-3.5" />
              Date
              {sortField === 'date' && (
                sortDirection === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={() => toggleSort('montant')}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                sortField === 'montant'
                  ? "bg-orange-600 text-white"
                  : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              )}
            >
              <Euro className="h-3.5 w-3.5" />
              Montant
              {sortField === 'montant' && (
                sortDirection === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={filteredExpenses.length === 0}
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
              {selectedIds.size} / {filteredExpenses.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune dépense disponible</p>
              {(searchTerm || filterStatut !== 'all' || filterCategory !== 'all' || dateFrom || dateTo || montantFrom || montantTo) && (
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExpenses.map(expense => {
                const isSelected = selectedIds.has(expense.id);
                const linkedToTransaction = hasTransaction(expense);

                return (
                  <div
                    key={expense.id}
                    onClick={() => !linkedToTransaction && toggleSelection(expense.id)}
                    className={cn(
                      "border rounded-lg p-3 cursor-pointer transition-all",
                      isSelected
                        ? "bg-orange-50 border-orange-300 shadow-sm"
                        : "bg-white border-gray-200 hover:border-orange-200 hover:bg-orange-50/30",
                      linkedToTransaction && "opacity-50 cursor-not-allowed"
                    )}
                  >
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

                      {/* Expense info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Afficher la description comme titre principal (court et descriptif) */}
                            <h3 className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                              {expense.description || expense.titre}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-medium",
                                STATUT_COLORS[expense.statut as keyof typeof STATUT_COLORS]
                              )}>
                                {STATUT_LABELS[expense.statut as keyof typeof STATUT_LABELS]}
                              </span>
                              {expense.reconcilie && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                  Réconcilié
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-bold text-orange-600 whitespace-nowrap flex-shrink-0">
                            {formatMontant(expense.montant)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600 dark:text-dark-text-secondary">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {expense.demandeur_nom}
                          </div>

                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(expense.date_depense || expense.date_demande)}
                          </div>

                          {expense.categorie && (
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded text-xs">
                              {expense.categorie}
                            </span>
                          )}
                        </div>

                        {/* Afficher le titre comme notes additionnelles (long texte explicatif) */}
                        {expense.titre && expense.titre.trim() !== '' && (
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2 line-clamp-2">
                            {expense.titre}
                          </p>
                        )}

                        {linkedToTransaction && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Déjà lié à une transaction
                          </div>
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
