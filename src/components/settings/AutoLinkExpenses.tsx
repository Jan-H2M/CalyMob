import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Link2,
  CheckCircle,
  AlertCircle,
  XCircle,
  Eye,
  X,
  TrendingDown,
  Sparkles,
  Zap,
  Filter
} from 'lucide-react';
import { ExpenseMatchingService, BatchMatchResults, MatchResult } from '@/services/expenseMatchingService';
import { AIExpenseMatchingService, AIMatchAnalysis } from '@/services/aiExpenseMatchingService';
import { AIMatchStorageService } from '@/services/aiMatchStorageService';
import { AIExpenseMatch } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { formatMontant, formatDate } from '@/utils/utils';
import toast from 'react-hot-toast';

export function AutoLinkExpenses() {
  const navigate = useNavigate();
  const { clubId, user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0, message: '' });
  const [results, setResults] = useState<BatchMatchResults | null>(null);
  const [aiMatches, setAiMatches] = useState<AIExpenseMatch[]>([]);
  const [matchFilter, setMatchFilter] = useState<'all' | 'pending' | 'validated' | 'rejected'>('all');
  const [stats, setStats] = useState({ pending: 0, validated: 0, rejected: 0, total: 0 });
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());

  const aiService = new AIExpenseMatchingService();

  // Charger les correspondances AI depuis Firebase
  useEffect(() => {
    if (clubId) {
      loadAIMatches();
      loadStats();
    }
  }, [clubId, matchFilter]);

  const loadAIMatches = async () => {
    if (!clubId) return;

    try {
      let matches: AIExpenseMatch[];
      if (matchFilter === 'all') {
        matches = await AIMatchStorageService.getAllMatches(clubId);
      } else {
        matches = await AIMatchStorageService.getMatchesByStatus(clubId, matchFilter);
      }
      console.log(`Loaded ${matches.length} AI matches (filter: ${matchFilter})`, matches);
      setAiMatches(matches);
    } catch (error) {
      console.error('Erreur chargement matches AI:', error);
      toast.error('Erreur lors du chargement des correspondances IA');
    }
  };

  const loadStats = async () => {
    if (!clubId) return;

    try {
      const statistics = await AIMatchStorageService.getMatchesStats(clubId);
      setStats(statistics);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const handleAutoLink = async () => {
    if (!clubId) {
      toast.error('Club ID manquant');
      return;
    }

    setProcessing(true);
    try {
      const matchResults = await ExpenseMatchingService.performBatchMatching(clubId, true);
      setResults(matchResults);

      if (matchResults.autoLinked.length > 0) {
        toast.success(`${matchResults.autoLinked.length} dépense(s) liée(s) automatiquement`);
      }
      if (matchResults.suggested.length > 0) {
        toast(`${matchResults.suggested.length} suggestion(s) à valider`, {
          icon: 'ℹ️',
          style: {
            background: '#EFF6FF',
            color: '#1E40AF',
            border: '1px solid #BFDBFE'
          }
        });
      }
      if (matchResults.errors.length > 0) {
        toast.error(`${matchResults.errors.length} erreur(s) - voir détails`);
      }
    } catch (error) {
      toast.error('Erreur lors de la liaison automatique');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleLinkSuggested = async (match: MatchResult) => {
    if (!clubId) return;

    try {
      await ExpenseMatchingService.linkManually(clubId, match.transaction_id, match.demande_id);
      toast.success('Liaison effectuée');

      // Retirer de la liste des suggestions
      setResults(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          suggested: prev.suggested.filter(m => m.transaction_id !== match.transaction_id),
          autoLinked: [...prev.autoLinked, match]
        };
      });
    } catch (error) {
      toast.error('Erreur lors de la liaison');
      console.error(error);
    }
  };

  const handleIgnoreSuggestion = (transactionId: string) => {
    setResults(prev => {
      if (!prev) return prev;
      const ignoredMatch = prev.suggested.find(m => m.transaction_id === transactionId);
      if (!ignoredMatch) return prev;

      return {
        ...prev,
        suggested: prev.suggested.filter(m => m.transaction_id !== transactionId),
        unmatched: {
          transactions: [...prev.unmatched.transactions, ignoredMatch.transaction],
          demandes: [...prev.unmatched.demandes, ignoredMatch.demande]
        }
      };
    });
  };

  const handleAIMatching = async () => {
    if (!clubId || !user || !results) {
      toast.error('Effectuez d\'abord une liaison classique');
      return;
    }

    if (!aiService.isAvailable()) {
      toast.error('Clé API IA manquante - configurez-la dans les paramètres');
      return;
    }

    setAiProcessing(true);
    try {
      await aiService.hybridMatching(
        clubId,
        user.uid,
        results.unmatched.transactions,
        results.unmatched.demandes,
        5, // Limite à 5 transactions pour tests
        (current, total, message) => {
          setAiProgress({ current, total, message });
        }
      );

      // Recharger les correspondances depuis Firebase
      await loadAIMatches();
      await loadStats();

      toast.success(`Analyse IA terminée - consultez l'onglet "Correspondances IA"`);
    } catch (error) {
      toast.error('Erreur lors de l\'analyse IA');
      console.error(error);
    } finally {
      setAiProcessing(false);
      setAiProgress({ current: 0, total: 0, message: '' });
    }
  };

  const handleLinkAIMatch = async (transactionId: string, demandeId: string) => {
    if (!clubId) return;

    try {
      await ExpenseMatchingService.linkManually(clubId, transactionId, demandeId);
      toast.success('Liaison IA effectuée');

      // Retirer de aiMatches et ajouter aux autoLinked
      const aiMatch = aiMatches.get(transactionId);
      if (aiMatch) {
        setAiMatches(prev => {
          const newMap = new Map(prev);
          newMap.delete(transactionId);
          return newMap;
        });

        // Mettre à jour results
        setResults(prev => {
          if (!prev) return prev;

          const tx = prev.unmatched.transactions.find(t => t.id === transactionId);
          const dem = prev.unmatched.demandes.find(d => d.id === demandeId);

          if (!tx || !dem) return prev;

          return {
            ...prev,
            autoLinked: [
              ...prev.autoLinked,
              {
                transaction_id: transactionId,
                demande_id: demandeId,
                transaction: tx,
                demande: dem,
                confidence: aiMatch.confidence,
                reason: `IA: ${aiMatch.reasoning}`
              }
            ],
            unmatched: {
              transactions: prev.unmatched.transactions.filter(t => t.id !== transactionId),
              demandes: prev.unmatched.demandes.filter(d => d.id !== demandeId)
            }
          };
        });
      }
    } catch (error) {
      toast.error('Erreur lors de la liaison');
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/parametres')}
            className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Retour aux paramètres
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-dark-text-primary">Liaison automatique des dépenses</h1>
          <p className="text-gray-600 dark:text-dark-text-secondary mt-2">
            Associez automatiquement les transactions bancaires aux dépenses approuvées
          </p>
        </div>

        {/* Action Button */}
        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Link2 className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Lancement de la liaison automatique</h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1 mb-4">
                Le système va comparer les transactions de dépense avec les demandes approuvées en utilisant :
                montant, nom du demandeur, date et description.
              </p>
              <button
                onClick={handleAutoLink}
                disabled={processing}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {processing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Link2 className="h-5 w-5" />
                    Lancer la liaison automatique
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Auto-linked */}
            {results.autoLinked.length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="h-6 w-6 text-green-600" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Liées automatiquement ({results.autoLinked.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {results.autoLinked.map(match => (
                    <div key={match.transaction_id} className="border border-green-200 bg-green-50 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {match.transaction.contrepartie_nom}
                            </div>
                            <Link2 className="h-4 w-4 text-green-600" />
                            <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {match.demande.demandeur_nom} {match.demande.demandeur_prenom}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dark-text-secondary">
                            <span className="font-bold text-gray-900 dark:text-dark-text-primary">
                              {formatMontant(Math.abs(match.transaction.montant))}
                            </span>
                            <span>{formatDate(match.transaction.date_execution)}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              {match.confidence}% confiance
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">{match.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested */}
            {results.suggested.length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Suggestions à valider ({results.suggested.length})
                  </h2>
                </div>
                <div className="space-y-3">
                  {results.suggested.map(match => (
                    <div key={match.transaction_id} className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {match.transaction.contrepartie_nom}
                            </div>
                            <span className="text-amber-600">→</span>
                            <div className="font-medium text-gray-900 dark:text-dark-text-primary">
                              {match.demande.demandeur_nom} {match.demande.demandeur_prenom}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-dark-text-secondary mb-2">
                            <span className="font-bold text-gray-900 dark:text-dark-text-primary">
                              {formatMontant(Math.abs(match.transaction.montant))}
                            </span>
                            <span>{formatDate(match.transaction.date_execution)}</span>
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                              {match.confidence}% confiance
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 dark:text-dark-text-secondary mb-2">
                            <span className="font-medium">Demande:</span> {match.demande.description}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-dark-text-muted">{match.reason}</p>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleLinkSuggested(match)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center gap-1"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Lier
                          </button>
                          <button
                            onClick={() => handleIgnoreSuggestion(match.transaction_id)}
                            className="px-3 py-1.5 bg-gray-300 text-gray-700 dark:text-dark-text-primary text-sm rounded hover:bg-gray-400 transition-colors flex items-center gap-1"
                          >
                            <X className="h-4 w-4" />
                            Ignorer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched */}
            {(results.unmatched.transactions.length > 0 || results.unmatched.demandes.length > 0) && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                <div className="flex items-center gap-3 mb-4">
                  <TrendingDown className="h-6 w-6 text-gray-600 dark:text-dark-text-secondary" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Non appariés
                  </h2>
                </div>

                {results.unmatched.transactions.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Transactions sans correspondance ({results.unmatched.transactions.length})
                    </h3>
                    <div className="space-y-2">
                      {results.unmatched.transactions.slice(0, 5).map(tx => (
                        <div key={tx.id} className="text-sm text-gray-600 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded">
                          {tx.contrepartie_nom} - {formatMontant(Math.abs(tx.montant))} - {formatDate(tx.date_execution)}
                        </div>
                      ))}
                      {results.unmatched.transactions.length > 5 && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          ... et {results.unmatched.transactions.length - 5} autre(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {results.unmatched.demandes.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                      Demandes sans correspondance ({results.unmatched.demandes.length})
                    </h3>
                    <div className="space-y-2">
                      {results.unmatched.demandes.slice(0, 5).map(dem => (
                        <div key={dem.id} className="text-sm text-gray-600 dark:text-dark-text-secondary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded">
                          {dem.demandeur_nom} {dem.demandeur_prenom} - {formatMontant(dem.montant)} - {dem.description}
                        </div>
                      ))}
                      {results.unmatched.demandes.length > 5 && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                          ... et {results.unmatched.demandes.length - 5} autre(s)
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Errors */}
            {results.errors.length > 0 && (
              <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-red-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <XCircle className="h-6 w-6 text-red-600" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                    Erreurs ({results.errors.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {results.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Matching Button */}
            {results.unmatched.transactions.length > 0 && results.unmatched.demandes.length > 0 && aiService.isAvailable() && (
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Sparkles className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-2">Analyse IA avancée</h3>
                    <p className="text-sm text-gray-700 dark:text-dark-text-primary mb-4">
                      Utilisez l'intelligence artificielle pour analyser les transactions non appariées.
                      L'IA va examiner en profondeur la communication bancaire, les descriptions et trouver des correspondances subtiles.
                    </p>
                    <p className="text-xs text-purple-700 mb-4">
                      ⚡ Limite: 5 transactions max (test) • Coût API: ~$0.05
                    </p>
                    <button
                      onClick={handleAIMatching}
                      disabled={aiProcessing}
                      className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {aiProcessing ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Analyse IA en cours...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5" />
                          Lancer l'analyse IA
                        </>
                      )}
                    </button>

                    {/* AI Progress */}
                    {aiProcessing && aiProgress.total > 0 && (
                      <div className="mt-4 bg-white dark:bg-dark-bg-secondary rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-purple-900">{aiProgress.message}</span>
                          <span className="text-sm text-purple-700">{aiProgress.current}/{aiProgress.total}</span>
                        </div>
                        <div className="w-full bg-purple-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">Résumé</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Liées automatiquement:</span>
                  <span className="font-bold text-blue-900 ml-2">{results.autoLinked.length}</span>
                </div>
                <div>
                  <span className="text-blue-700">Suggestions:</span>
                  <span className="font-bold text-blue-900 ml-2">{results.suggested.length}</span>
                </div>
                <div>
                  <span className="text-blue-700">Correspondances IA (en attente):</span>
                  <span className="font-bold text-blue-900 ml-2">{stats.pending}</span>
                </div>
                <div>
                  <span className="text-blue-700">Transactions non appariées:</span>
                  <span className="font-bold text-blue-900 ml-2">{results.unmatched.transactions.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Matches Section - Always visible if there are AI matches */}
        {(aiMatches.length > 0 || stats.total > 0) && (
          <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-purple-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-purple-600" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Correspondances IA
                </h2>
              </div>

              {/* Filter buttons */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-500 dark:text-dark-text-muted" />
                <button
                  onClick={() => setMatchFilter('pending')}
                  className={`px-3 py-1 text-sm rounded ${
                    matchFilter === 'pending'
                      ? 'bg-amber-100 text-amber-700 font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  En attente ({stats.pending})
                </button>
                <button
                  onClick={() => setMatchFilter('validated')}
                  className={`px-3 py-1 text-sm rounded ${
                    matchFilter === 'validated'
                      ? 'bg-green-100 text-green-700 font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Validés ({stats.validated})
                </button>
                <button
                  onClick={() => setMatchFilter('rejected')}
                  className={`px-3 py-1 text-sm rounded ${
                    matchFilter === 'rejected'
                      ? 'bg-red-100 text-red-700 font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Rejetés ({stats.rejected})
                </button>
                <button
                  onClick={() => setMatchFilter('all')}
                  className={`px-3 py-1 text-sm rounded ${
                    matchFilter === 'all'
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Tous ({stats.total})
                </button>
              </div>
            </div>

            {/* AI Matches List */}
            {aiMatches.length === 0 ? (
              <p className="text-gray-500 dark:text-dark-text-muted text-center py-8">
                {matchFilter === 'pending' && 'Aucune correspondance en attente'}
                {matchFilter === 'validated' && 'Aucune correspondance validée'}
                {matchFilter === 'rejected' && 'Aucune correspondance rejetée'}
                {matchFilter === 'all' && 'Aucune correspondance IA trouvée'}
              </p>
            ) : (
              <div className="space-y-3">
                {aiMatches.map((match, index) => (
                  <div key={match.id} className={`border rounded-lg p-4 ${
                    match.statut === 'pending' ? 'border-purple-200 bg-purple-50' :
                    match.statut === 'validated' ? 'border-green-200 bg-green-50' :
                    'border-red-200 bg-red-50'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-4 w-4 text-purple-600" />
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            match.statut === 'pending' ? 'bg-purple-100 text-purple-700' :
                            match.statut === 'validated' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {match.confidence}% confiance • {
                              match.statut === 'pending' ? 'En attente' :
                              match.statut === 'validated' ? 'Validé' :
                              'Rejeté'
                            }
                          </span>
                        </div>
                        <div className="bg-white dark:bg-dark-bg-secondary rounded p-2 mt-2">
                          <p className="text-xs text-gray-900 dark:text-dark-text-primary">
                            <span className="font-semibold">Analyse IA:</span> {match.reasoning}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-2">
                          Créé le {formatDate(match.created_at)}
                          {match.validated_at && ` • ${match.statut === 'validated' ? 'Validé' : 'Rejeté'} le ${formatDate(match.validated_at)}`}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => navigate(`/parametres/ai-match-validation?matchId=${match.id}`)}
                          className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          Voir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
