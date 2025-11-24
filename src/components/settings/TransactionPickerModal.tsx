import React, { useState, useEffect } from 'react';
import { X, Search, Loader2, ChevronRight } from 'lucide-react';
import { TransactionBancaire } from '@/types';
import { formatMontant, formatDate } from '@/utils/utils';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

interface TransactionPickerModalProps {
  clubId: string;
  currentTransactionId: string;
  demandeAmount: number;
  onSelect: (transactionId: string) => void;
  onClose: () => void;
}

export function TransactionPickerModal({
  clubId,
  currentTransactionId,
  demandeAmount,
  onSelect,
  onClose
}: TransactionPickerModalProps) {
  const [transactions, setTransactions] = useState<TransactionBancaire[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionBancaire[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadTransactions();
  }, [clubId]);

  useEffect(() => {
    filterTransactions();
  }, [searchTerm, transactions]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      // Requête ULTRA simple : juste les transactions avec montant < 0, on trie côté client
      const q = query(
        txRef,
        where('montant', '<', 0)
      );

      const snapshot = await getDocs(q);
      const txList = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            date_execution: data.date_execution?.toDate?.() || new Date(data.date_execution),
            date_valeur: data.date_valeur?.toDate?.() || new Date(data.date_valeur),
            created_at: data.created_at?.toDate?.() || new Date(),
            updated_at: data.updated_at?.toDate?.() || new Date()
          } as TransactionBancaire;
        })
        // Filtrer côté client : exclure la transaction actuelle
        .filter(tx => tx.id !== currentTransactionId)
        // Tri côté client : non-liées d'abord, puis par date décroissante
        .sort((a, b) => {
          // Mettre les non-liées en premier
          const aLinked = a.expense_claim_id ? 1 : 0;
          const bLinked = b.expense_claim_id ? 1 : 0;
          if (aLinked !== bLinked) return aLinked - bLinked;
          // Puis trier par date décroissante
          return b.date_execution.getTime() - a.date_execution.getTime();
        });

      console.log(`[TransactionPicker] Loaded ${txList.length} transactions`);
      setTransactions(txList);
      setFilteredTransactions(txList);
    } catch (error: any) {
      console.error('Erreur chargement transactions:', error);
      console.error('Message:', error?.message);
      console.error('Code:', error?.code);
    } finally {
      setLoading(false);
    }
  };

  const filterTransactions = () => {
    if (!searchTerm.trim()) {
      setFilteredTransactions(transactions);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = transactions.filter(tx =>
      tx.contrepartie_nom?.toLowerCase().includes(term) ||
      tx.communication?.toLowerCase().includes(term) ||
      tx.contrepartie_iban?.toLowerCase().includes(term) ||
      formatMontant(tx.montant).includes(term)
    );

    setFilteredTransactions(filtered);
  };

  const getAmountDifference = (txAmount: number): number => {
    // Les deux sont négatifs pour les dépenses, on compare les valeurs absolues
    return Math.abs(Math.abs(txAmount) - demandeAmount);
  };

  const getMatchQuality = (tx: TransactionBancaire): 'excellent' | 'good' | 'poor' => {
    const diff = getAmountDifference(tx.montant);
    if (diff <= 0.01) return 'excellent';
    if (diff <= 5) return 'good';
    return 'poor';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Choisir une transaction</h2>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
              Montant recherché : <span className="font-bold text-orange-600">{formatMontant(-demandeAmount)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg transition-colors"
          >
            <X className="h-6 w-6 text-gray-500 dark:text-dark-text-muted" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400 dark:text-dark-text-muted" />
            <input
              type="text"
              placeholder="Rechercher par bénéficiaire, montant, IBAN ou communication..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-dark-text-muted">
                {searchTerm ? 'Aucune transaction trouvée pour cette recherche' : 'Aucune transaction disponible'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTransactions.map(tx => {
                const matchQuality = getMatchQuality(tx);
                const diff = getAmountDifference(tx.montant);

                return (
                  <button
                    key={tx.id}
                    onClick={() => onSelect(tx.id)}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all hover:shadow-md ${
                      matchQuality === 'excellent'
                        ? 'border-green-200 bg-green-50 hover:border-green-400'
                        : matchQuality === 'good'
                        ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                        : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="font-bold text-gray-900 dark:text-dark-text-primary">{tx.contrepartie_nom}</span>
                          {matchQuality === 'excellent' && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                              Montant exact
                            </span>
                          )}
                          {matchQuality === 'good' && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                              Montant proche (±{formatMontant(diff)})
                            </span>
                          )}
                          {tx.expense_claim_id && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                              ⚠️ Déjà liée
                            </span>
                          )}
                        </div>

                        {/* Amount and Date */}
                        <div className="flex items-center gap-4 text-sm mb-2">
                          <span className="font-bold text-red-600">{formatMontant(tx.montant)}</span>
                          <span className="text-gray-600 dark:text-dark-text-secondary">{formatDate(tx.date_execution)}</span>
                        </div>

                        {/* IBAN */}
                        {tx.contrepartie_iban && (
                          <div className="text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                            <span className="font-medium">IBAN:</span> {tx.contrepartie_iban}
                          </div>
                        )}

                        {/* Communication */}
                        {tx.communication && (
                          <div className="text-xs text-gray-700 dark:text-dark-text-primary bg-gray-100 dark:bg-dark-bg-tertiary p-2 rounded mt-2">
                            <span className="font-medium">Communication:</span> {tx.communication}
                          </div>
                        )}
                      </div>

                      {/* Select Icon */}
                      <ChevronRight className="h-5 w-5 text-gray-400 dark:text-dark-text-muted ml-4 flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {filteredTransactions.length} transaction{filteredTransactions.length > 1 ? 's' : ''} disponible{filteredTransactions.length > 1 ? 's' : ''}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
