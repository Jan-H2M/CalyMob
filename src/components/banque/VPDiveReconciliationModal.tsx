import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  Check, 
  X, 
  AlertCircle,
  Link2,
  Users,
  Euro,
  Loader,
  ChevronRight
} from 'lucide-react';
import { 
  TransactionBancaire, 
  DemandeRemboursement, 
  Evenement,
  ReconciliationResult
} from '@/types';
import { VPDiveParser, VPDiveParticipant } from '@/services/vpDiveParser';
import { ReconciliationService } from '@/services/reconciliationService';
import { formatMontant, cn } from '@/utils/utils';
import toast from 'react-hot-toast';

interface VPDiveReconciliationModalProps {
  transaction?: TransactionBancaire; // Transaction de dépense si c'est une dépense événement
  event?: Evenement; // Événement lié
  transactions: TransactionBancaire[]; // Toutes les transactions pour matching
  onClose: () => void;
  onReconcile: (matches: ReconciliationResult[]) => void;
}

export function VPDiveReconciliationModal({
  transaction,
  event,
  transactions,
  onClose,
  onReconcile
}: VPDiveReconciliationModalProps) {
  const [participants, setParticipants] = useState<VPDiveParticipant[]>([]);
  const [reconciliationResults, setReconciliationResults] = useState<{
    autoReconciled: ReconciliationResult[];
    needsReview: ReconciliationResult[];
    splitSuggestions: ReconciliationResult[];
    unmatched: string[];
  } | null>(null);
  const [selectedMatches, setSelectedMatches] = useState<ReconciliationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'participants' | 'matching'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xls')) {
      toast.error('Veuillez sélectionner un fichier .xls exporté depuis VP Dive');
      return;
    }

    setIsProcessing(true);
    try {
      // Parser le fichier VP Dive
      const vpDiveEvent = await VPDiveParser.parseVPDiveFile(file);
      setParticipants(vpDiveEvent.participants);
      
      // Si on a des transactions, lancer la réconciliation automatique
      if (transactions.length > 0) {
        const results = await ReconciliationService.performAutoReconciliation(
          transactions,
          undefined,
          vpDiveEvent.participants,
          undefined,
          event?.date_debut || new Date()
        );
        
        setReconciliationResults(results);
        setSelectedMatches(results.autoReconciled);
      }
      
      setActiveTab('participants');
      toast.success(`${vpDiveEvent.participants.length} participants importés`);
    } catch (error) {
      toast.error('Erreur lors de l\'import du fichier VP Dive');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApplyReconciliation = () => {
    if (selectedMatches.length === 0) {
      toast.error('Aucune correspondance sélectionnée');
      return;
    }
    
    onReconcile(selectedMatches);
    toast.success(`${selectedMatches.length} transactions réconciliées`);
    onClose();
  };

  const toggleMatchSelection = (match: ReconciliationResult) => {
    setSelectedMatches(prev => {
      const isSelected = prev.some(m => m.transaction_id === match.transaction_id);
      if (isSelected) {
        return prev.filter(m => m.transaction_id !== match.transaction_id);
      } else {
        return [...prev, match];
      }
    });
  };

  const getMatchedTransaction = (transactionId: string) => {
    return transactions.find(t => t.id === transactionId);
  };

  // Calculer les statistiques
  const stats = {
    totalParticipants: participants.length,
    paidParticipants: participants.filter(p => p.etat_paiement === 'Payé').length,
    expectedAmount: participants.reduce((sum, p) => sum + (p.montant || 0), 0),
    matchedAmount: selectedMatches.reduce((sum, m) => {
      const tx = getMatchedTransaction(m.transaction_id);
      return sum + (tx ? Math.abs(tx.montant) : 0);
    }, 0)
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* En-tête */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <Users className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold">Import VP Dive & Réconciliation</h2>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">
                {event ? `Pour l'événement: ${event.titre}` : 'Importer et matcher les participants'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <nav className="flex">
            <button
              onClick={() => setActiveTab('upload')}
              className={cn(
                "px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'upload'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              1. Import fichier
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              disabled={participants.length === 0}
              className={cn(
                "px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'participants'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
                participants.length === 0 && "opacity-50 cursor-not-allowed"
              )}
            >
              2. Participants ({participants.length})
            </button>
            <button
              onClick={() => setActiveTab('matching')}
              disabled={!reconciliationResults}
              className={cn(
                "px-6 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === 'matching'
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700",
                !reconciliationResults && "opacity-50 cursor-not-allowed"
              )}
            >
              3. Réconciliation
            </button>
          </nav>
        </div>

        {/* Contenu */}
        <div className="p-6 overflow-y-auto max-h-[500px]">
          {/* Tab Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg">
                <FileSpreadsheet className="h-12 w-12 text-gray-400 dark:text-dark-text-muted mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary mb-2">
                  Importer un fichier VP Dive
                </h3>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-6">
                  Sélectionnez le fichier .xls exporté depuis VP Dive
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader className="h-4 w-4 animate-spin" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Choisir un fichier
                    </>
                  )}
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">Comment exporter depuis VP Dive:</p>
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Connectez-vous à VP Dive</li>
                      <li>Allez dans "Sorties" ou "Formations"</li>
                      <li>Sélectionnez l'événement</li>
                      <li>Cliquez sur "Export" → "Excel"</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab Participants */}
          {activeTab === 'participants' && participants.length > 0 && (
            <div className="space-y-4">
              {/* Statistiques */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total participants</p>
                  <p className="text-2xl font-bold">{stats.totalParticipants}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Payés</p>
                  <p className="text-2xl font-bold text-green-600">{stats.paidParticipants}</p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">En attente</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.totalParticipants - stats.paidParticipants}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Montant attendu</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatMontant(stats.expectedAmount)}
                  </p>
                </div>
              </div>

              {/* Liste des participants */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Nom
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Licence
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Niveau
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Montant
                      </th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Statut
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">
                        Contact
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {participants.map((participant, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:bg-dark-bg-tertiary">
                        <td className="px-4 py-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                              {participant.nom}
                            </p>
                            {participant.role && (
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">{participant.role}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-dark-text-primary">
                          {participant.numero_licence}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
                            {participant.pratique || 'N/A'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">
                          {formatMontant(participant.montant || 0)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={cn(
                            "px-2 py-1 text-xs rounded-full",
                            participant.etat_paiement === 'Payé'
                              ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700"
                          )}>
                            {participant.etat_paiement || 'En attente'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-dark-text-primary">
                          {participant.portable || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tab Matching */}
          {activeTab === 'matching' && reconciliationResults && (
            <div className="space-y-6">
              {/* Résumé */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="font-medium text-green-900 mb-2">Résultats de la réconciliation</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-green-600 font-medium">Automatique:</span>{' '}
                    {reconciliationResults.autoReconciled.length} transactions
                  </div>
                  <div>
                    <span className="text-orange-600 font-medium">À vérifier:</span>{' '}
                    {reconciliationResults.needsReview.length} transactions
                  </div>
                  <div>
                    <span className="text-blue-600 font-medium">Ventilation suggérée:</span>{' '}
                    {reconciliationResults.splitSuggestions.length} transactions
                  </div>
                </div>
              </div>

              {/* Correspondances automatiques */}
              {reconciliationResults.autoReconciled.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                    Correspondances automatiques (confiance &gt; 90%)
                  </h3>
                  <div className="space-y-2">
                    {reconciliationResults.autoReconciled.map((match) => {
                      const tx = getMatchedTransaction(match.transaction_id);
                      if (!tx) return null;
                      
                      return (
                        <div
                          key={match.transaction_id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary"
                        >
                          <div className="flex items-center gap-4">
                            <input
                              type="checkbox"
                              checked={selectedMatches.some(m => m.transaction_id === match.transaction_id)}
                              onChange={() => toggleMatchSelection(match)}
                              className="h-4 w-4 text-blue-600 rounded"
                            />
                            <div>
                              <p className="text-sm font-medium">{tx.contrepartie_nom}</p>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                                {formatMontant(tx.montant)} - {tx.communication}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                            <div className="text-right">
                              <p className="text-sm font-medium text-green-600">
                                {match.matched_with.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                                Confiance: {match.matched_with.confidence}%
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Correspondances à vérifier */}
              {reconciliationResults.needsReview.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                    À vérifier manuellement (confiance 60-90%)
                  </h3>
                  <div className="space-y-2">
                    {reconciliationResults.needsReview.map((match) => {
                      const tx = getMatchedTransaction(match.transaction_id);
                      if (!tx) return null;
                      
                      return (
                        <div
                          key={match.transaction_id}
                          className="flex items-center justify-between p-3 border border-orange-200 rounded-lg hover:bg-orange-50"
                        >
                          <div className="flex items-center gap-4">
                            <input
                              type="checkbox"
                              checked={selectedMatches.some(m => m.transaction_id === match.transaction_id)}
                              onChange={() => toggleMatchSelection(match)}
                              className="h-4 w-4 text-blue-600 rounded"
                            />
                            <div>
                              <p className="text-sm font-medium">{tx.contrepartie_nom}</p>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                                {formatMontant(tx.montant)} - {tx.communication}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <ChevronRight className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                            <div className="text-right">
                              <p className="text-sm font-medium text-orange-600">
                                {match.matched_with.name}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                                Confiance: {match.matched_with.confidence}%
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600 dark:text-dark-text-secondary">
              {selectedMatches.length > 0 && (
                <span>
                  {selectedMatches.length} transaction(s) sélectionnée(s) - 
                  Total: {formatMontant(stats.matchedAmount)}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-dark-text-primary bg-gray-100 dark:bg-dark-bg-tertiary hover:bg-gray-200 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleApplyReconciliation}
                disabled={selectedMatches.length === 0}
                className={cn(
                  "px-4 py-2 rounded-lg flex items-center gap-2 transition-colors",
                  selectedMatches.length > 0
                    ? "bg-blue-600 hover:bg-blue-700 text-white"
                    : "bg-gray-300 text-gray-500 cursor-not-allowed"
                )}
              >
                <Link2 className="h-4 w-4" />
                Réconcilier ({selectedMatches.length})
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}