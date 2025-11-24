import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Filter, Check, Calendar, Users, MapPin, Link2, AlertCircle } from 'lucide-react';
import { TransactionBancaire, Evenement } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';

interface EventLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionBancaire;
  events: Evenement[];
  linkedEventIds: string[];
  onLinkEvents: (eventIds: string[]) => Promise<void>;
}

export function EventLinkingPanel({
  isOpen,
  onClose,
  transaction,
  events,
  linkedEventIds,
  onLinkEvents
}: EventLinkingPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset selection when panel opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSearchTerm('');
      setDateFrom('');
      setDateTo('');
    }
  }, [isOpen]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Exclure les événements déjà liés à cette transaction
      if (linkedEventIds.includes(event.id)) return false;

      // Filtre par recherche
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchTitle = event.titre.toLowerCase().includes(term);
        const matchDesc = event.description?.toLowerCase().includes(term);
        const matchLocation = event.lieu?.toLowerCase().includes(term);
        if (!matchTitle && !matchDesc && !matchLocation) return false;
      }

      // Filtre par date
      if (dateFrom) {
        const from = new Date(dateFrom);
        if (event.date_debut < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        if (event.date_debut > to) return false;
      }

      return true;
    });
  }, [events, linkedEventIds, searchTerm, dateFrom, dateTo]);

  // Toggle selection
  const toggleSelection = (eventId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId);
    } else {
      newSelected.add(eventId);
    }
    setSelectedIds(newSelected);
  };

  // Select all filtered
  const selectAll = () => {
    setSelectedIds(new Set(filteredEvents.map(e => e.id)));
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
      await onLinkEvents(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error('Error linking events:', error);
    } finally {
      setSaving(false);
    }
  };

  const isLinkedToOtherTransaction = (event: Evenement) => {
    // Vérifier si l'événement est déjà lié à une autre transaction
    // Note: Cette logique dépend de votre structure de données
    return false; // TODO: Implémenter si nécessaire
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
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">Lier des événements</h2>
              <p className="text-blue-100 text-sm mt-1">
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
              placeholder="Rechercher par titre, description ou lieu..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Filter buttons */}
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Date début"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="Date fin"
            />
          </div>

          {/* Selection controls */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                disabled={filteredEvents.length === 0}
                className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed"
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
              {selectedIds.size} / {filteredEvents.length} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucun événement disponible</p>
              {(searchTerm || dateFrom || dateTo) && (
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEvents.map(event => {
                const isSelected = selectedIds.has(event.id);
                const linkedToOther = isLinkedToOtherTransaction(event);

                return (
                  <div
                    key={event.id}
                    onClick={() => !linkedToOther && toggleSelection(event.id)}
                    className={cn(
                      "border rounded-lg p-3 cursor-pointer transition-all",
                      isSelected
                        ? "bg-blue-50 border-blue-300 shadow-sm"
                        : "bg-white border-gray-200 hover:border-blue-200 hover:bg-blue-50/30",
                      linkedToOther && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {/* Checkbox */}
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-blue-600 border-blue-600"
                            : "border-gray-300 bg-white"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white" />}
                        </div>
                      </div>

                      {/* Event info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-medium text-gray-900 dark:text-dark-text-primary truncate">{event.titre}</h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-600 dark:text-dark-text-secondary">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {formatDate(event.date_debut)}
                            {event.date_fin && event.date_fin !== event.date_debut && (
                              <> - {formatDate(event.date_fin)}</>
                            )}
                          </div>

                          {event.lieu && (
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.lieu}
                            </div>
                          )}
                        </div>

                        {event.description && (
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 line-clamp-2">
                            {event.description}
                          </p>
                        )}

                        {linkedToOther && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Déjà lié à une autre transaction
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
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
