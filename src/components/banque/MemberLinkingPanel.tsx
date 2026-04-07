import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, UserCheck, Clock, CreditCard, AlertCircle } from 'lucide-react';
import { Membre } from '@/types';
import { formatDate, cn } from '@/utils/utils';
import { getFirstName, getLastName } from '@/utils/fieldMapper';

interface MemberLinkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  membres: Membre[];
  transactionIban?: string;   // IBAN de la transaction (contrepartie_iban) pour matching
  linkedMemberId?: string;    // ID du membre déjà lié (pour highlight)
  onSelectMember: (membre: Membre) => void;
  position?: 'left' | 'right';
}

// Helper: normaliser IBAN pour comparaison
function normalizeIban(iban: string | undefined | null): string {
  if (!iban) return '';
  return iban.replace(/\s/g, '').toUpperCase();
}

// Helper: trouver membre par IBAN
function findMemberByIban(membres: Membre[], transactionIban: string | undefined): Membre | null {
  if (!transactionIban) return null;
  const normalizedTxIban = normalizeIban(transactionIban);
  if (!normalizedTxIban) return null;

  return membres.find(m => {
    // Check primary IBAN
    if (m.iban && normalizeIban(m.iban) === normalizedTxIban) return true;
    // Check all IBANs
    if (m.ibans?.some(iban => normalizeIban(iban) === normalizedTxIban)) return true;
    return false;
  }) || null;
}

// Helper: formater IBAN pour affichage
function formatIban(iban: string | undefined | null): string {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '');
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

// Helper: vérifier si cotisation est expirée
function isCotisationExpired(cotisationDate: Date | undefined | null): boolean {
  if (!cotisationDate) return true;
  const date = cotisationDate instanceof Date ? cotisationDate : new Date(cotisationDate);
  return date < new Date();
}

export function MemberLinkingPanel({
  isOpen,
  onClose,
  membres,
  transactionIban,
  linkedMemberId,
  onSelectMember,
  position = 'left'
}: MemberLinkingPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Reset search when panel opens
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Trouver le membre suggéré par IBAN
  const suggestedMember = useMemo(() => {
    return findMemberByIban(membres, transactionIban);
  }, [membres, transactionIban]);

  // Filtrer et trier les membres
  const filteredMembres = useMemo(() => {
    let filtered = membres;

    // Filtre de recherche
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => {
        const firstName = (getFirstName(m) || '').toLowerCase();
        const lastName = (getLastName(m) || '').toLowerCase();
        const displayName = (m.displayName || '').toLowerCase();
        const email = (m.email || '').toLowerCase();
        const iban = normalizeIban(m.iban).toLowerCase();
        const ibans = (m.ibans || []).map(i => normalizeIban(i).toLowerCase());

        return firstName.includes(term) ||
               lastName.includes(term) ||
               displayName.includes(term) ||
               email.includes(term) ||
               iban.includes(term) ||
               ibans.some(i => i.includes(term));
      });
    }

    // Trier alphabétiquement par nom
    filtered = [...filtered].sort((a, b) => {
      const nameA = `${getLastName(a) || ''} ${getFirstName(a) || ''}`.toLowerCase();
      const nameB = `${getLastName(b) || ''} ${getFirstName(b) || ''}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [membres, searchTerm]);

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
        "fixed top-0 h-full bg-white dark:bg-dark-bg-primary shadow-2xl z-[70] flex flex-col transition-transform duration-300",
        position === 'left' ? "left-0" : "right-0",
        position === 'left'
          ? (isOpen ? "translate-x-0" : "-translate-x-full")
          : (isOpen ? "translate-x-0" : "translate-x-full"),
        "w-full max-w-lg"
      )}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-green-600 to-green-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white">
                Lier à un membre
              </h2>
              <p className="text-green-100 text-sm mt-1">
                Sélectionnez le membre pour mettre à jour sa cotisation
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

        {/* IBAN Suggestion */}
        {suggestedMember && (
          <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Suggestion basée sur l'IBAN
              </span>
            </div>
            <button
              onClick={() => onSelectMember(suggestedMember)}
              className={cn(
                "w-full p-3 bg-white dark:bg-dark-bg-secondary rounded-lg border-2 border-green-400 hover:border-green-500 transition-colors text-left",
                linkedMemberId === suggestedMember.id && "ring-2 ring-green-500"
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                      {suggestedMember.displayName || `${getFirstName(suggestedMember)} ${getLastName(suggestedMember)}`}
                    </span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      Match IBAN
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    {formatIban(suggestedMember.iban)}
                  </div>
                </div>
                <div className="text-right">
                  {suggestedMember.cotisation_validite ? (
                    <div className={cn(
                      "text-xs flex items-center gap-1",
                      isCotisationExpired(suggestedMember.cotisation_validite as Date)
                        ? "text-red-600"
                        : "text-gray-600 dark:text-dark-text-secondary"
                    )}>
                      <Clock className="h-3 w-3" />
                      {formatDate(suggestedMember.cotisation_validite as Date)}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-dark-text-muted">Pas de cotisation</span>
                  )}
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par nom, email ou IBAN..."
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-dark-bg-secondary"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>
          <div className="mt-2 text-xs text-gray-500 dark:text-dark-text-muted">
            {filteredMembres.length} membre{filteredMembres.length > 1 ? 's' : ''} trouvé{filteredMembres.length > 1 ? 's' : ''}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredMembres.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-dark-text-muted">
              <AlertCircle className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>Aucun membre trouvé</p>
              {searchTerm && (
                <p className="text-sm mt-1">Essayez un autre terme de recherche</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMembres.map(membre => {
                const isLinked = linkedMemberId === membre.id;
                const isSuggested = suggestedMember?.id === membre.id;
                const isExpired = isCotisationExpired(membre.cotisation_validite as Date);

                return (
                  <button
                    key={membre.id}
                    onClick={() => onSelectMember(membre)}
                    className={cn(
                      "w-full p-3 border rounded-lg text-left transition-all hover:shadow-sm",
                      isLinked
                        ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                        : isSuggested
                          ? "bg-green-50/50 border-green-200 hover:border-green-300"
                          : "bg-white dark:bg-dark-bg-secondary border-gray-200 dark:border-dark-border hover:border-green-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-dark-text-primary truncate">
                            {membre.displayName || `${getFirstName(membre)} ${getLastName(membre)}`}
                          </span>
                          {isSuggested && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex-shrink-0">
                              Match IBAN
                            </span>
                          )}
                          {isLinked && (
                            <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full flex-shrink-0">
                              Lié
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-muted mt-1 truncate">
                          {membre.email}
                        </div>
                        {membre.iban && (
                          <div className="text-xs text-gray-400 dark:text-dark-text-muted mt-0.5 font-mono">
                            {formatIban(membre.iban)}
                          </div>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {membre.cotisation_validite ? (
                          <div className={cn(
                            "text-xs flex items-center gap-1",
                            isExpired
                              ? "text-red-600 font-medium"
                              : "text-gray-600 dark:text-dark-text-secondary"
                          )}>
                            <Clock className="h-3 w-3" />
                            {formatDate(membre.cotisation_validite as Date)}
                            {isExpired && (
                              <span className="text-red-500 ml-1">(expiré)</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-dark-text-muted italic">Pas de cotisation</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-bg-tertiary">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors font-medium"
          >
            Annuler
          </button>
        </div>
      </div>
    </>
  );
}
