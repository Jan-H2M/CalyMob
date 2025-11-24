import React, { useState } from 'react';
import { Brain, Sparkles, CheckCircle, Loader2 } from 'lucide-react';
import { SettingsHeader } from './SettingsHeader';
import { CategorizationService } from '@/services/categorizationService';
import { TransactionBancaire } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';

export function AutomatisationSettings() {
  const { clubId } = useAuth();
  const [importingPatterns, setImportingPatterns] = useState(false);
  const [patternsImportStats, setPatternsImportStats] = useState<{ imported: number; skipped: number; errors: number } | null>(null);

  // Import patterns from existing transactions
  const handlePatternsImport = async () => {
    if (!clubId) {
      toast.error('Club ID non trouvé');
      return;
    }

    setImportingPatterns(true);
    setPatternsImportStats(null);

    try {
      // Load all transactions
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const snapshot = await getDocs(transactionsRef);
      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TransactionBancaire[];

      toast.loading(`Chargement de ${transactions.length} transactions...`, { id: 'patterns-import' });

      // Import patterns
      const stats = await CategorizationService.importPatternsFromTransactions(clubId, transactions);

      setPatternsImportStats(stats);
      toast.success(
        `✅ ${stats.imported} patterns importés, ${stats.skipped} ignorés, ${stats.errors} erreurs`,
        { id: 'patterns-import', duration: 5000 }
      );
    } catch (error) {
      console.error('[AutomatisationSettings] Error importing patterns:', error);
      toast.error('Erreur lors de l\'import des patterns', { id: 'patterns-import' });
    } finally {
      setImportingPatterns(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Catégorisation Intelligente']}
          title="Catégorisation Intelligente"
          description="Système d'apprentissage automatique pour la catégorisation des transactions"
        />

        {/* Content */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
          <div className="space-y-4">
              {/* Explication */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex gap-3">
                  <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-purple-800 dark:text-purple-300">
                    <p className="font-medium mb-2">✨ Système IA - Basé sur mots-clés + montants</p>
                    <ul className="list-disc list-inside space-y-1 text-purple-700 dark:text-purple-400">
                      <li>Analyse toutes vos transactions avec un code comptable assigné</li>
                      <li>Extrait les <strong>mots-clés</strong> (Inscription, Cotisation, Sortie, etc.) et <strong>montants</strong></li>
                      <li>Crée des patterns intelligents: ex. "inscription" + 199€ → code 730-00-712</li>
                      <li>Suggère automatiquement le code lors de transactions similaires</li>
                      <li>Plus vous avez de transactions catégorisées, plus les suggestions sont précises</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Statistiques si import déjà effectué */}
              {patternsImportStats && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-800 dark:text-green-300">
                      <p className="font-medium mb-2">Dernière importation réussie</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {patternsImportStats.imported}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-500">
                            Patterns importés
                          </p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                            {patternsImportStats.skipped}
                          </p>
                          <p className="text-xs text-gray-700 dark:text-gray-500">
                            Ignorés
                          </p>
                        </div>
                        {patternsImportStats.errors > 0 && (
                          <div>
                            <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                              {patternsImportStats.errors}
                            </p>
                            <p className="text-xs text-red-700 dark:text-red-500">
                              Erreurs
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Button d'import */}
              <button
                onClick={handlePatternsImport}
                disabled={importingPatterns}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-lg font-medium shadow-md hover:shadow-lg"
              >
                {importingPatterns ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    Importation en cours...
                  </>
                ) : (
                  <>
                    <Brain className="h-6 w-6" />
                    Importer les patterns depuis les transactions
                  </>
                )}
              </button>

              {/* Note additionnelle */}
              <p className="text-xs text-gray-500 dark:text-dark-text-muted text-center">
                💡 Cette opération peut prendre quelques secondes selon le nombre de transactions.
                Les patterns seront utilisés pour suggérer des codes comptables lors de la saisie.
              </p>
          </div>
        </div>
      </div>
    </div>
  );
}
