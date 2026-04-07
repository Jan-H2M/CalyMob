import { useState, useEffect, useMemo } from 'react';
import { X, Calendar, UserCheck, AlertCircle, Search, Check, Users, AlertTriangle, Info } from 'lucide-react';
import { TransactionBancaire, Membre } from '@/types';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { Tooltip } from '@/components/common/Tooltip';

export interface MemberAssignment {
  transactionId: string;
  memberId: string;
  memberName: string;
  ibanToAdd?: string; // IBAN de la transaction à ajouter au membre (si pas de match IBAN)
}

interface BulkMemberLinkingModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: TransactionBancaire[];  // Transactions sélectionnées (filtrées cotisation)
  membres: Membre[];
  onConfirm: (assignments: MemberAssignment[], cotisationDate: Date) => Promise<void>;
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
    if (m.iban && normalizeIban(m.iban) === normalizedTxIban) return true;
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

/// Helper: calculer la date de cotisation par défaut
// La cotisation est pour une année complète → toujours 31 janvier de l'année suivante
function getDefaultCotisationDate(): Date {
  const now = new Date();
  const currentYear = now.getFullYear();
  return new Date(currentYear + 1, 0, 31); // 31 janvier année+1
}

// Helper: formater date pour input type="date"
function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Interface pour l'état interne des assignations
interface TransactionAssignment {
  transaction: TransactionBancaire;
  membre: Membre | null;
  isAutoMatched: boolean;
}

export function BulkMemberLinkingModal({
  isOpen,
  onClose,
  transactions,
  membres,
  onConfirm
}: BulkMemberLinkingModalProps) {
  const [assignments, setAssignments] = useState<Map<string, TransactionAssignment>>(new Map());
  const [cotisationDate, setCotisationDate] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Initialiser les assignations avec auto-matching IBAN
  useEffect(() => {
    if (isOpen && transactions.length > 0) {
      const newAssignments = new Map<string, TransactionAssignment>();

      transactions.forEach(tx => {
        const matchedMember = findMemberByIban(membres, tx.contrepartie_iban);
        newAssignments.set(tx.id, {
          transaction: tx,
          membre: matchedMember,
          isAutoMatched: !!matchedMember
        });
      });

      setAssignments(newAssignments);
      setCotisationDate(formatDateForInput(getDefaultCotisationDate()));
      setEditingTransactionId(null);
      setSearchTerm('');
    }
  }, [isOpen, transactions, membres]);

  // Statistiques
  const stats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    const memberCounts = new Map<string, number>();

    assignments.forEach(assignment => {
      if (assignment.membre) {
        matched++;
        const count = memberCounts.get(assignment.membre.id) || 0;
        memberCounts.set(assignment.membre.id, count + 1);
      } else {
        unmatched++;
      }
    });

    const duplicates = Array.from(memberCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([memberId, count]) => {
        const membre = membres.find(m => m.id === memberId);
        return {
          memberId,
          memberName: membre?.displayName || `${getFirstName(membre)} ${getLastName(membre)}`,
          count
        };
      });

    return { matched, unmatched, duplicates };
  }, [assignments, membres]);

  // Filtrer les membres pour la recherche
  const filteredMembres = useMemo(() => {
    if (!searchTerm) return membres;

    const term = searchTerm.toLowerCase();
    return membres.filter(m => {
      const firstName = (getFirstName(m) || '').toLowerCase();
      const lastName = (getLastName(m) || '').toLowerCase();
      const displayName = (m.displayName || '').toLowerCase();
      const email = (m.email || '').toLowerCase();

      return firstName.includes(term) ||
             lastName.includes(term) ||
             displayName.includes(term) ||
             email.includes(term);
    });
  }, [membres, searchTerm]);

  // Assigner un membre à une transaction
  const assignMember = (transactionId: string, membre: Membre) => {
    setAssignments(prev => {
      const newAssignments = new Map(prev);
      const existing = newAssignments.get(transactionId);
      if (existing) {
        newAssignments.set(transactionId, {
          ...existing,
          membre,
          isAutoMatched: false
        });
      }
      return newAssignments;
    });
    setEditingTransactionId(null);
    setSearchTerm('');
  };

  // Confirmer
  const handleConfirm = async () => {
    if (stats.matched === 0 || !cotisationDate) return;

    setSaving(true);
    try {
      const memberAssignments: MemberAssignment[] = [];

      assignments.forEach(assignment => {
        if (assignment.membre) {
          // Si pas d'auto-match IBAN et la transaction a un IBAN, on le passe pour l'ajouter au membre
          const ibanToAdd = !assignment.isAutoMatched && assignment.transaction.contrepartie_iban
            ? assignment.transaction.contrepartie_iban
            : undefined;

          memberAssignments.push({
            transactionId: assignment.transaction.id,
            memberId: assignment.membre.id!,
            memberName: assignment.membre.displayName || `${getFirstName(assignment.membre)} ${getLastName(assignment.membre)}`,
            ibanToAdd
          });
        }
      });

      await onConfirm(memberAssignments, new Date(cotisationDate));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-[80]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-gradient-to-r from-green-600 to-green-700 rounded-t-xl flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-white" />
                <div>
                  <h2 className="text-lg font-bold text-white">
                    Lier les cotisations aux membres
                  </h2>
                  <p className="text-green-100 text-sm">
                    {transactions.length} transaction{transactions.length > 1 ? 's' : ''} sélectionnée{transactions.length > 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Tableau des assignations */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50 dark:bg-dark-bg-tertiary">
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Transaction
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      IBAN
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider">
                      Membre
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase tracking-wider w-24">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {Array.from(assignments.values()).map(({ transaction, membre, isAutoMatched }) => (
                    <tr key={transaction.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary">
                      {/* Transaction */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {transaction.numero_sequence}
                          </div>
                          <Tooltip content={
                            <div className="max-w-xs">
                              <div className="font-medium mb-1">{transaction.contrepartie_nom}</div>
                              {transaction.communication && (
                                <div className="text-xs opacity-90">{transaction.communication}</div>
                              )}
                            </div>
                          }>
                            <Info className="h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted hover:text-gray-600 dark:text-dark-text-secondary cursor-help" />
                          </Tooltip>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-dark-text-muted">
                          {formatMontant(transaction.montant)} • {transaction.contrepartie_nom}
                        </div>
                      </td>

                      {/* IBAN */}
                      <td className="px-3 py-3">
                        {transaction.contrepartie_iban ? (
                          <div className="text-xs font-mono text-gray-600 dark:text-dark-text-secondary">
                            {formatIban(transaction.contrepartie_iban)}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-dark-text-muted italic">Pas d'IBAN</span>
                        )}
                      </td>

                      {/* Membre */}
                      <td className="px-3 py-3">
                        {editingTransactionId === transaction.id ? (
                          // Mode édition: recherche de membre
                          <div className="space-y-2">
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-dark-text-muted" />
                              <input
                                type="text"
                                placeholder="Rechercher..."
                                className="w-full pl-8 pr-2 py-1.5 border border-gray-300 dark:border-dark-border rounded text-xs focus:ring-1 focus:ring-green-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                autoFocus
                              />
                            </div>
                            <div className="max-h-32 overflow-y-auto border border-gray-200 dark:border-dark-border rounded">
                              {filteredMembres.slice(0, 10).map(m => (
                                <button
                                  key={m.id}
                                  onClick={() => assignMember(transaction.id, m)}
                                  className="w-full px-2 py-1.5 text-left text-xs hover:bg-green-50 flex items-center justify-between"
                                >
                                  <span className="font-medium">
                                    {m.displayName || `${getFirstName(m)} ${getLastName(m)}`}
                                  </span>
                                  {m.iban && (
                                    <span className="text-gray-400 dark:text-dark-text-muted font-mono text-xs">
                                      {formatIban(m.iban).slice(0, 14)}...
                                    </span>
                                  )}
                                </button>
                              ))}
                              {filteredMembres.length === 0 && (
                                <div className="px-2 py-2 text-xs text-gray-500 dark:text-dark-text-muted text-center">
                                  Aucun membre trouvé
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => { setEditingTransactionId(null); setSearchTerm(''); }}
                              className="text-xs text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary"
                            >
                              Annuler
                            </button>
                          </div>
                        ) : membre ? (
                          // Membre assigné
                          <div className="flex items-center gap-2">
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {membre.displayName || `${getFirstName(membre)} ${getLastName(membre)}`}
                              </div>
                              {isAutoMatched && (
                                <span className="text-xs text-green-600">Match IBAN</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          // Pas de membre
                          <div className="flex items-center gap-2 text-amber-600">
                            <AlertCircle className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm">Non trouvé</span>
                          </div>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 text-center">
                        {editingTransactionId !== transaction.id && (
                          <button
                            onClick={() => setEditingTransactionId(transaction.id)}
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded transition-colors",
                              membre
                                ? "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary"
                                : "text-amber-600 bg-amber-50 hover:bg-amber-100"
                            )}
                          >
                            {membre ? 'Changer' : 'Assigner'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Warnings pour doublons */}
            {stats.duplicates.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Membres en double
                    </div>
                    <ul className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                      {stats.duplicates.map(d => (
                        <li key={d.memberId}>
                          {d.memberName} apparaît {d.count} fois
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      La cotisation sera mise à jour une seule fois par membre.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary rounded-b-xl flex-shrink-0">
            {/* Date de cotisation */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                <Calendar className="h-4 w-4 inline mr-2" />
                Date de cotisation pour tous
              </label>
              <input
                type="date"
                value={cotisationDate}
                onChange={(e) => setCotisationDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-dark-bg-tertiary"
              />
            </div>

            {/* Résumé */}
            <div className="mb-4 flex items-center gap-4 text-sm">
              <span className="text-green-600 font-medium">
                <Check className="h-4 w-4 inline mr-1" />
                {stats.matched} match{stats.matched > 1 ? 's' : ''} IBAN
              </span>
              {stats.unmatched > 0 && (
                <span className="text-amber-600 font-medium">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  {stats.unmatched} à assigner
                </span>
              )}
            </div>

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition-colors font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirm}
                disabled={stats.matched === 0 || !cotisationDate || saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4" />
                    Valider ({stats.matched})
                  </>
                )}
              </button>
            </div>

            {stats.unmatched > 0 && (
              <p className="mt-2 text-xs text-gray-500 dark:text-dark-text-muted text-center">
                {stats.unmatched} transaction{stats.unmatched > 1 ? 's' : ''} sans membre ne sera{stats.unmatched > 1 ? 'ont' : ''} pas traitée{stats.unmatched > 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
