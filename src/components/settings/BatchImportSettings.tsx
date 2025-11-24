import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  X,
  Loader2,
  FileText,
  Calendar,
  Euro,
  Users,
  FolderCheck,
  UserPlus,
  Brain,
  Sparkles
} from 'lucide-react';
import { parseCSVFile } from '@/services/csvParser';
import { parseVPDiveFile } from '@/services/vpDiveParser';
import { MembreImportModal } from '@/components/membres/MembreImportModal';
import { CategorizationService } from '@/services/categorizationService';
import { TransactionBancaire, FiscalYear } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, serverTimestamp, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface ImportResult {
  type: 'transactions' | 'events' | 'demands' | 'membres';
  success: number;
  failed: number;
  duplicates: number;
  errors: string[];
}

export function BatchImportSettings() {
  const navigate = useNavigate();
  const { clubId, appUser } = useAuth();

  // Add error boundary
  if (!clubId) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-900">Erreur de configuration</p>
                <p className="text-sm text-red-700 mt-1">Club ID non trouvé. Veuillez vous reconnecter.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  const [results, setResults] = useState<ImportResult[]>([]);

  // Separate states for each import type
  const [importingTransactions, setImportingTransactions] = useState(false);
  const [importingEvents, setImportingEvents] = useState(false);
  const [showMembreImport, setShowMembreImport] = useState(false);
  const [importingPatterns, setImportingPatterns] = useState(false);
  const [patternsImportStats, setPatternsImportStats] = useState<{ imported: number; skipped: number; errors: number } | null>(null);

  // File input refs
  const transactionsInputRef = useRef<HTMLInputElement>(null);
  const eventsInputRef = useRef<HTMLInputElement>(null);

  // Helper function to find fiscal year for a given date
  const findFiscalYearForDate = (date: Date, fiscalYears: FiscalYear[]): FiscalYear | null => {
    const year = date.getFullYear();
    return fiscalYears.find(fy => fy.year === year) || null;
  };

  // Import transactions
  const handleTransactionsImport = async () => {
    if (!transactionsInputRef.current?.files?.length) {
      toast.error('Veuillez sélectionner des fichiers CSV de transactions');
      return;
    }
    
    setImportingTransactions(true);
    const result: ImportResult = {
      type: 'transactions',
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    try {
      const files = Array.from(transactionsInputRef.current.files);

      // Charger les hash existants UNE SEULE FOIS au début
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
      const existingSnapshot = await getDocs(transactionsRef);
      const existingHashes = new Set(
        existingSnapshot.docs.map(doc => doc.data().hash_dedup).filter(Boolean)
      );

      // Charger tous les fiscal years pour automatiquement déterminer fiscal_year_id
      const fiscalYearsRef = collection(db, 'clubs', clubId, 'fiscal_years');
      const fiscalYearsSnapshot = await getDocs(query(fiscalYearsRef, orderBy('year', 'desc')));
      const fiscalYears = fiscalYearsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as FiscalYear[];

      console.log(`📅 Loaded ${fiscalYears.length} fiscal years for automatic assignment`);
      if (fiscalYears.length === 0) {
        toast.error('Aucune année fiscale trouvée. Créez d\'abord une année fiscale.');
        setImportingTransactions(false);
        return;
      }

      for (const file of files) {
        try {
          const parseResult = await parseCSVFile(file);

          if (parseResult.errors.length > 0) {
            result.errors.push(...parseResult.errors);
          }

          for (const tx of parseResult.transactions) {
            if (tx.hash_dedup && existingHashes.has(tx.hash_dedup)) {
              result.duplicates++;
            } else {
              try {
                // Déterminer automatiquement le fiscal_year_id basé sur la date d'exécution
                const txDate = tx.date_execution instanceof Date ? tx.date_execution : new Date(tx.date_execution);
                const fiscalYear = findFiscalYearForDate(txDate, fiscalYears);

                if (!fiscalYear) {
                  result.failed++;
                  result.errors.push(`Transaction ${tx.numero_sequence || 'sans numéro'}: Aucune année fiscale trouvée pour la date ${txDate.toLocaleDateString()}`);
                  continue;
                }

                await addDoc(transactionsRef, {
                  ...tx,
                  club_id: clubId,
                  fiscal_year_id: fiscalYear.id,
                  statut: 'accepte',
                  created_at: serverTimestamp(),
                  updated_at: serverTimestamp(),
                  created_by: 'batch_import'
                });
                // Ajouter le hash aux hash existants pour éviter les doublons entre fichiers
                if (tx.hash_dedup) {
                  existingHashes.add(tx.hash_dedup);
                }

                result.success++;
              } catch (error) {
                result.failed++;
                result.errors.push(`Transaction: ${error}`);
              }
            }
          }
        } catch (error) {
          result.failed++;
          result.errors.push(`File ${file.name}: ${error}`);
        }
      }

      setResults(prev => [...prev, result]);
      toast.success(`${result.success} transactions importées avec succès`);
      if (result.duplicates > 0) {
        toast.warning(`${result.duplicates} doublons ignorés`);
      }
    } catch (error) {
      toast.error('Erreur lors de l\'import des transactions');
    } finally {
      setImportingTransactions(false);
      if (transactionsInputRef.current) {
        transactionsInputRef.current.value = '';
      }
    }
  };

  // Import events
  const handleEventsImport = async () => {
    if (!eventsInputRef.current?.files?.length) {
      toast.error('Veuillez sélectionner des fichiers VP Dive');
      return;
    }
    
    setImportingEvents(true);
    const result: ImportResult = {
      type: 'events',
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: []
    };

    try {
      for (const file of Array.from(eventsInputRef.current.files)) {
        try {
          const vpData = await parseVPDiveFile(file);

          // 🆕 MIGRATION: Write to 'operations' collection with type='evenement'
          const eventsRef = collection(db, 'clubs', clubId, 'operations');

          // Check for existing event
          const existingEvents = await getDocs(eventsRef);
          const existingEventIds = new Set(existingEvents.docs.map(doc => doc.data().vp_dive_id));
          
          if (vpData.eventId && existingEventIds.has(vpData.eventId)) {
            result.duplicates++;
            continue;
          }

          // Create event
          const eventDocRef = await addDoc(eventsRef, {
            type: 'evenement',
            club_id: clubId,
            fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
            organisateur_id: appUser?.id || '',  // ✅ Required by Firestore rules
            titre: vpData.event.titre,
            description: vpData.event.description,
            date: vpData.event.date,
            lieu: vpData.event.lieu,
            vp_dive_id: vpData.eventId,
            statut: 'termine',
            inscriptions: vpData.participants.length,
            capacite: vpData.event.capacite,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp()
          });

          // Add participants as inscriptions
          // 🆕 MIGRATION: Write to 'operation_participants' collection
          const inscriptionsRef = collection(db, 'clubs', clubId, 'operation_participants');
          for (const participant of vpData.participants) {
            await addDoc(inscriptionsRef, {
              club_id: clubId,
              fiscal_year_id: selectedFiscalYear?.id || null,  // Required by Firestore Rules
              operation_id: eventDocRef.id,
              operation_titre: vpData.event.titre,
              operation_type: 'evenement',
              ...participant,
              created_at: serverTimestamp(),
              updated_at: serverTimestamp()
            });
          }
          
          result.success++;
        } catch (error) {
          result.failed++;
          result.errors.push(`Event file ${file.name}: ${error}`);
        }
      }

      setResults(prev => [...prev, result]);
      toast.success(`${result.success} événements importés avec succès`);
    } catch (error) {
      toast.error('Erreur lors de l\'import des événements');
    } finally {
      setImportingEvents(false);
      if (eventsInputRef.current) {
        eventsInputRef.current.value = '';
      }
    }
  };

  // Import patterns from existing transactions
  const handlePatternsImport = async () => {
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
      console.error('[BatchImportSettings] Error importing patterns:', error);
      toast.error('Erreur lors de l\'import des patterns', { id: 'patterns-import' });
    } finally {
      setImportingPatterns(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/parametres')}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Retour aux paramètres
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Import de données</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">Importez vos données existantes dans CalyCompta</p>
        </div>

        {/* Import Cards */}
        <div className="space-y-6">
          {/* Transactions bancaires */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Euro className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Transactions bancaires</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importez vos fichiers CSV de transactions (BNP, KBC, ING, Belfius)
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  ref={transactionsInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  className="hidden"
                  id="transactions-upload"
                />
                <label
                  htmlFor="transactions-upload"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary cursor-pointer transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Choisir des fichiers CSV
                </label>
                <button
                  onClick={handleTransactionsImport}
                  disabled={importingTransactions}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {importingTransactions ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="h-4 w-4" />
                      Importer les transactions
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Événements VP Dive */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Événements VP Dive</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importez vos fichiers d'événements depuis VP Dive (.xls)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-green-800">
                    <p className="font-medium mb-2">Instructions:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Connectez-vous à VP Dive</li>
                      <li>Allez dans la section "Sorties"</li>
                      <li>Sélectionnez vos opérations</li>
                      <li>Cliquez sur "Exporter" → "Excel"</li>
                      <li>Importez les fichiers .xls ci-dessous</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={eventsInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  className="hidden"
                  id="events-upload"
                />
                <label
                  htmlFor="events-upload"
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary cursor-pointer transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Choisir des fichiers XLS
                </label>
                <button
                  onClick={handleEventsImport}
                  disabled={importingEvents}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {importingEvents ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      Importer les événements
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Import Membres */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-teal-100 rounded-lg">
                <UserPlus className="h-6 w-6 text-teal-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Import Membres</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importez des membres depuis Excel (format iClubSport)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-teal-800">
                    <p className="font-medium mb-2">Format Excel iClubSport requis</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Colonnes obligatoires: LifrasID, Nom, Prénom, Email</li>
                      <li>Nouveaux membres: statut <strong>inactif</strong> par défaut</li>
                      <li>Membres existants: statut conservé</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowMembreImport(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
              >
                <UserPlus className="h-5 w-5" />
                Importer des membres
              </button>
            </div>
          </div>

          {/* Dépenses */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Dépenses</h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Importez et révisez vos justificatifs de dépenses
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => navigate('/parametres/revision-documents')}
                className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                <Upload className="h-4 w-4" />
                Importer les documents
              </button>

              <button
                onClick={() => navigate('/parametres/revision-documents')}
                className="flex items-center gap-2 px-6 py-2.5 border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors"
              >
                <FolderCheck className="h-4 w-4" />
                Révision documents
              </button>
            </div>
          </div>

          {/* Smart Categorization */}
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Brain className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  Catégorisation intelligente
                  <Sparkles className="h-4 w-4 text-blue-500" />
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                  Apprenez des transactions existantes pour suggérer automatiquement les codes comptables
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800 dark:text-blue-400">
                    <p className="font-medium">Comment ça marche ?</p>
                    <p className="mt-1">
                      Cette fonction analyse toutes vos transactions existantes qui ont déjà un code comptable
                      et crée des "patterns" pour suggérer automatiquement les codes à l'avenir.
                      Plus vous avez de transactions catégorisées, plus les suggestions seront précises.
                    </p>
                  </div>
                </div>
              </div>

              {patternsImportStats && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="flex gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-800 dark:text-green-400">
                      <p className="font-medium">Dernière importation réussie</p>
                      <ul className="mt-1 space-y-1">
                        <li>✅ {patternsImportStats.imported} patterns importés</li>
                        <li>⏭️ {patternsImportStats.skipped} transactions ignorées (sans code ou ventilées)</li>
                        {patternsImportStats.errors > 0 && (
                          <li>❌ {patternsImportStats.errors} erreurs</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={handlePatternsImport}
                disabled={importingPatterns}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {importingPatterns ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Importation en cours...
                  </>
                ) : (
                  <>
                    <Brain className="h-5 w-5" />
                    Importer les patterns depuis les transactions
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-8 bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4">Résultats de l'import</h2>
            <div className="space-y-4">
              {results.map((result, index) => (
                <div key={index} className="border border-gray-200 dark:border-dark-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${
                        result.failed === 0 ? 'bg-green-100' : 'bg-amber-100'
                      }`}>
                        {result.failed === 0 ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-amber-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {result.type === 'transactions' ? 'Transactions bancaires' :
                           result.type === 'events' ? 'Événements' :
                           result.type === 'membres' ? 'Membres' : 'Dépenses'}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          {result.success} importés, {result.duplicates} doublons, {result.failed} échecs
                        </p>
                      </div>
                    </div>
                    {result.errors.length > 0 && (
                      <button
                        onClick={() => {
                          console.error(`Errors for ${result.type}:`, result.errors);
                          toast.error(`${result.errors.length} erreur(s) - voir la console`);
                        }}
                        className="text-sm text-red-600 hover:text-red-700"
                      >
                        Voir les erreurs
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Import Membres Modal */}
      {showMembreImport && (
        <MembreImportModal
          isOpen={showMembreImport}
          onClose={() => setShowMembreImport(false)}
          clubId={clubId}
          onImportComplete={(importedCount) => {
            setShowMembreImport(false);
            const result: ImportResult = {
              type: 'membres',
              success: importedCount,
              failed: 0,
              duplicates: 0,
              errors: []
            };
            setResults(prev => [...prev, result]);
            toast.success(`${importedCount} membres importés avec succès`);
          }}
        />
      )}
    </div>
  );
}