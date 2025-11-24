import React, { useState } from 'react';
import { AlertCircle, Trash2, Eye, Search, Loader2, CheckCircle } from 'lucide-react';
import { TransactionBancaire } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface DuplicateGroup {
  numero_sequence: string;
  transactions: TransactionBancaire[];
  toKeep: TransactionBancaire;
  toDelete: TransactionBancaire[];
}

export function DuplicateCleanup() {
  const { clubId, appUser } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [cleanProgress, setCleanProgress] = useState({ current: 0, total: 0 });

  // Only superadmin can use this feature
  if (appUser?.role !== 'superadmin') {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900 dark:text-red-200">Accès refusé</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">
              Seul le superadmin peut accéder à cette fonctionnalité.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Scan for duplicate transactions
   */
  const scanForDuplicates = async () => {
    if (!clubId) return;

    setScanning(true);
    setDuplicateGroups([]);
    setShowResults(false);

    try {
      console.log('🔍 Scanning for duplicate transactions...');

      // Load all transactions
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const snapshot = await getDocs(transactionsRef);

      console.log(`📥 Loaded ${snapshot.size} transactions`);

      // Group by numero_sequence
      const groups = new Map<string, TransactionBancaire[]>();

      snapshot.docs.forEach(docSnap => {
        const tx = { id: docSnap.id, ...docSnap.data() } as TransactionBancaire;
        const key = tx.numero_sequence;

        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(tx);
      });

      // Find groups with 2+ transactions
      const duplicates: DuplicateGroup[] = [];

      groups.forEach((txList, numeroSequence) => {
        if (txList.length >= 2) {
          // Sort by priority:
          // 1. Reconciled transactions first
          // 2. Most recent created_at
          const sorted = [...txList].sort((a, b) => {
            // Priority 1: Reconciled
            if (a.reconcilie && !b.reconcilie) return -1;
            if (!a.reconcilie && b.reconcilie) return 1;

            // Priority 2: Most recent
            const dateA = a.created_at?.toDate?.() || new Date(a.created_at || 0);
            const dateB = b.created_at?.toDate?.() || new Date(b.created_at || 0);
            return dateB.getTime() - dateA.getTime();
          });

          const toKeep = sorted[0];
          const toDelete = sorted.slice(1);

          duplicates.push({
            numero_sequence: numeroSequence,
            transactions: txList,
            toKeep,
            toDelete
          });
        }
      });

      console.log(`✅ Found ${duplicates.length} duplicate groups`);

      setDuplicateGroups(duplicates);
      setShowResults(true);

      if (duplicates.length === 0) {
        toast.success('Aucun doublon trouvé ! 🎉', { duration: 3000 });
      } else {
        const totalToDelete = duplicates.reduce((sum, group) => sum + group.toDelete.length, 0);
        toast.success(`${duplicates.length} groupes de doublons trouvés (${totalToDelete} transactions à supprimer)`, {
          duration: 5000
        });
      }

    } catch (error) {
      console.error('Error scanning for duplicates:', error);
      toast.error('Erreur lors de la recherche de doublons');
    } finally {
      setScanning(false);
    }
  };

  /**
   * Clean all duplicates
   */
  const cleanDuplicates = async () => {
    if (!clubId || duplicateGroups.length === 0) return;

    const totalToDelete = duplicateGroups.reduce((sum, group) => sum + group.toDelete.length, 0);

    // Double confirmation
    const confirmMessage = `⚠️ ATTENTION: Vous allez supprimer ${totalToDelete} transactions en double.\n\nCette action est IRRÉVERSIBLE !\n\nVoulez-vous continuer ?`;

    if (!window.confirm(confirmMessage)) return;

    // Second confirmation
    if (!window.confirm('Êtes-vous VRAIMENT sûr ? Les doublons seront définitivement supprimés.')) return;

    setCleaning(true);
    setCleanProgress({ current: 0, total: totalToDelete });

    try {
      console.log(`🗑️  Starting cleanup of ${totalToDelete} duplicate transactions...`);

      let deleted = 0;

      for (const group of duplicateGroups) {
        for (const tx of group.toDelete) {
          await deleteDoc(doc(db, 'clubs', clubId, 'transactions_bancaires', tx.id!));
          deleted++;

          setCleanProgress({ current: deleted, total: totalToDelete });

          // Log progress every 50 deletions
          if (deleted % 50 === 0) {
            console.log(`   ${deleted}/${totalToDelete} suppressions effectuées...`);
          }
        }
      }

      console.log(`✅ ${deleted} transactions supprimées avec succès !`);

      toast.success(`${deleted} transactions supprimées avec succès ! 🎉`, {
        duration: 5000
      });

      // Clear results
      setDuplicateGroups([]);
      setShowResults(false);

    } catch (error) {
      console.error('Error cleaning duplicates:', error);
      toast.error('Erreur lors du nettoyage des doublons');
    } finally {
      setCleaning(false);
      setCleanProgress({ current: 0, total: 0 });
    }
  };

  const totalToDelete = duplicateGroups.reduce((sum, group) => sum + group.toDelete.length, 0);
  const reconciledToDelete = duplicateGroups.reduce(
    (sum, group) => sum + group.toDelete.filter(tx => tx.reconcilie).length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-900 dark:text-orange-200">Nettoyage des transactions en double</p>
            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
              Cette fonctionnalité détecte et supprime les transactions avec le même numéro de séquence.
              La transaction <strong>réconciliée</strong> ou la plus <strong>récente</strong> sera conservée.
            </p>
          </div>
        </div>
      </div>

      {/* Scan Button */}
      <div className="flex gap-3">
        <button
          onClick={scanForDuplicates}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Recherche en cours...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Rechercher les doublons
            </>
          )}
        </button>

        {showResults && duplicateGroups.length > 0 && (
          <button
            onClick={cleanDuplicates}
            disabled={cleaning}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cleaning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Suppression {cleanProgress.current}/{cleanProgress.total}...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                Supprimer tous les doublons
              </>
            )}
          </button>
        )}
      </div>

      {/* Results */}
      {showResults && (
        <>
          {duplicateGroups.length === 0 ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-900 dark:text-green-200">Aucun doublon trouvé</p>
                  <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                    Toutes les transactions ont des numéros de séquence uniques.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Groupes de doublons</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{duplicateGroups.length}</p>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">À supprimer</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{totalToDelete}</p>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Réconciliées (à supprimer)</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{reconciledToDelete}</p>
                </div>
                <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">À conserver</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{duplicateGroups.length}</p>
                </div>
              </div>

              {/* Duplicate Groups List */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Groupes de doublons ({duplicateGroups.length})
                </h3>

                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {duplicateGroups.slice(0, 20).map((group, idx) => (
                    <div
                      key={group.numero_sequence}
                      className="border-l-4 border-orange-500 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4"
                    >
                      {/* Group Header */}
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-gray-900 dark:text-dark-text-primary">
                          N° {group.numero_sequence}
                        </h4>
                        <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                          {group.transactions.length} transactions
                        </span>
                      </div>

                      {/* Transactions */}
                      <div className="space-y-2">
                        {/* Transaction to keep */}
                        <div className="flex items-center justify-between p-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-800">
                          <div className="flex-1 grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Date</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                {formatDate(group.toKeep.date_execution)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Contrepartie</p>
                              <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                                {group.toKeep.contrepartie_nom || '-'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Montant</p>
                              <p className={cn(
                                "text-sm font-bold",
                                group.toKeep.montant >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              )}>
                                {formatMontant(group.toKeep.montant)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {group.toKeep.reconcilie && (
                              <span className="px-2 py-1 bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300 text-xs font-medium rounded">
                                Réconcilié
                              </span>
                            )}
                            <span className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded">
                              À GARDER
                            </span>
                          </div>
                        </div>

                        {/* Transactions to delete */}
                        {group.toDelete.map((tx, txIdx) => (
                          <div
                            key={tx.id}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-lg",
                              txIdx % 2 === 0
                                ? "bg-white dark:bg-dark-bg-secondary"
                                : "bg-gray-100 dark:bg-dark-bg-primary"
                            )}
                          >
                            <div className="flex-1 grid grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Date</p>
                                <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                  {formatDate(tx.date_execution)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Contrepartie</p>
                                <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                                  {tx.contrepartie_nom || '-'}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-600 dark:text-dark-text-secondary">Montant</p>
                                <p className={cn(
                                  "text-sm font-bold",
                                  tx.montant >= 0
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-red-600 dark:text-red-400"
                                )}>
                                  {formatMontant(tx.montant)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                              {tx.reconcilie && (
                                <span className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs font-medium rounded">
                                  Réconcilié
                                </span>
                              )}
                              <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded">
                                À supprimer
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {duplicateGroups.length > 20 && (
                    <div className="text-center text-sm text-gray-600 dark:text-dark-text-secondary py-4">
                      ... et {duplicateGroups.length - 20} autres groupes de doublons
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
