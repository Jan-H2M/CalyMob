import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Filter, Check, Euro, Calendar, User, FileText, CreditCard, Link2 } from 'lucide-react';
import { DemandeRemboursement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface ExpenseLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: DemandeRemboursement[];
  linkedExpenseIds: string[];
  eventId: string;
  eventName: string;
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

export function ExpenseLinkingPanel({
  isOpen,
  onClose,
  expenses,
  linkedExpenseIds,
  eventId,
  eventName,
  onLinkExpenses
}: ExpenseLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [montantFrom, setMontantFrom] = useState('');
  const [montantTo, setMontantTo] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Get unique categories
  const categories = useMemo(() => {
    const cats = new Set(expenses.map(e => e.categorie).filter(Boolean));
    return Array.from(cats);
  }, [expenses]);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(expense => {
      // Exclure les demandes déjà liées à cet événement
      if (linkedExpenseIds.includes(expense.id)) return false;

      // Filtre par statut
      if (filterStatut !== 'all' && expense.statut !== filterStatut) return false;

      // Filtre par catégorie
      if (filterCategory !== 'all' && expense.categorie !== filterCategory) return false;

      // Filtre par recherche
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchTitle = expense.titre?.toLowerCase().includes(term);
        const matchDesc = expense.description.toLowerCase().includes(term);
        const matchDemandeur = expense.demandeur_nom?.toLowerCase().includes(term);
        if (!matchTitle && !matchDesc && !matchDemandeur) return false;
      }

      // Filtre par date
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (expense.date_demande < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (expense.date_demande > to) return false;
      }

      // Filtre par montant (en valeur absolue pour les dépenses)
      const montantAbs = Math.abs(expense.montant);
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
  }, [expenses, linkedExpenseIds, filterStatut, filterCategory, searchTerm, dateFrom, dateTo, montantFrom, montantTo]);

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    const allIds = new Set(filteredExpenses.map(e => e.id));
    setSelectedIds(allIds);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

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

  const isLinkedToOtherEvent = (expense: DemandeRemboursement) => {
    return expense.evenement_id && expense.evenement_id !== eventId;
  };

  const hasTransaction = (expense: DemandeRemboursement) => {
    return !!expense.transaction_id;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Panel (no overlay to allow both windows visible) */}
      <div className={cn(
        "fixed left-0 top-0 h-full bg-white shadow-2xl z-[110] flex flex-col transition-transform duration-300",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "w-full max-w-2xl"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-orange-600 to-orange-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Lier des dépenses</h2>
              <p className="text-orange-100 text-sm mt-1">à {eventName}</p>
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
              placeholder="Rechercher par titre, demandeur ou description..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
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
              placeholder="Du"
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Au"
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
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
              className="w-28 px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-500 dark:text-dark-text-muted">à</span>
            <input
              type="number"
              value={montantTo}
              onChange={(e) => setMontantTo(e.target.value)}
              placeholder="À"
              step="0.01"
              min="0"
              className="w-28 px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
            />
            <span className="text-sm text-gray-500 dark:text-dark-text-muted">€</span>
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedIds.size > 0 ? (
                <span className="font-medium text-orange-600">
                  {selectedIds.size} demande{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
                </span>
              ) : (
                <span>{filteredExpenses.length} demande{filteredExpenses.length > 1 ? 's' : ''} disponible{filteredExpenses.length > 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex gap-2">
              {selectedIds.size > 0 && (
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-600 dark:text-dark-text-secondary hover:text-gray-800 dark:text-dark-text-primary underline"
                >
                  Tout désélectionner
                </button>
              )}
              <button
                onClick={selectAll}
                className="text-xs text-orange-600 hover:text-orange-800 underline"
                disabled={filteredExpenses.length === 0}
              >
                Tout sélectionner
              </button>
            </div>
          </div>
        </div>

        {/* Expense list */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <Filter className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucune demande trouvée</p>
              <p className="text-sm mt-1">Essayez d'ajuster les filtres</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredExpenses.map((expense) => {
                const isSelected = selectedIds.has(expense.id);
                const otherEvent = isLinkedToOtherEvent(expense);
                const hasTx = hasTransaction(expense);

                return (
                  <div
                    key={expense.id}
                    onClick={() => toggleSelection(expense.id)}
                    className={cn(
                      "border rounded-lg p-4 cursor-pointer transition-all",
                      isSelected
                        ? "border-orange-500 bg-orange-50 shadow-sm"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="pt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "border-orange-500 bg-orange-500"
                            : "border-gray-300"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Expense details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                              {expense.titre || expense.description}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-gray-600 dark:text-dark-text-secondary flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {expense.demandeur_prenom} {expense.demandeur_nom}
                              </span>
                            </div>
                            {!expense.titre && expense.description && (
                              <p className="text-sm text-gray-600 dark:text-dark-text-secondary truncate mt-1">
                                {expense.description.substring(0, 80)}{expense.description.length > 80 ? '...' : ''}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(expense.date_demande)}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-full",
                                STATUT_COLORS[expense.statut]
                              )}>
                                {STATUT_LABELS[expense.statut]}
                              </span>
                              {expense.categorie && (
                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-dark-bg-tertiary rounded-full">
                                  {expense.categorie}
                                </span>
                              )}
                              {hasTx && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                                  <CreditCard className="h-3 w-3" />
                                  Transaction liée
                                </span>
                              )}
                              {otherEvent && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                                  <Link2 className="h-3 w-3" />
                                  Autre événement
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-lg text-red-600">
                              {formatMontant(expense.montant)}
                            </p>
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
            className="px-4 py-2 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary transition-colors"
            disabled={saving}
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || selectedIds.size === 0}
            className={cn(
              "px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium",
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
