import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  X,
  Loader2,
  FileText,
  AlertCircle,
  Sparkles,
  CreditCard,
  User,
  Edit2,
  Save,
  Search
} from 'lucide-react';
import { TransactionBancaire, DemandeRemboursement, AIExpenseMatch } from '@/types';
import { ExpenseMatchingService } from '@/services/expenseMatchingService';
import { AIMatchStorageService } from '@/services/aiMatchStorageService';
import { TransactionPickerModal } from './TransactionPickerModal';
import { useAuth } from '@/contexts/AuthContext';
import { formatMontant, formatDate } from '@/utils/utils';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export function AIMatchValidation() {
  const navigate = useNavigate();
  const { clubId, user } = useAuth();
  const [searchParams] = useSearchParams();
  const matchId = searchParams.get('matchId');

  const [match, setMatch] = useState<AIExpenseMatch | null>(null);
  const [transaction, setTransaction] = useState<TransactionBancaire | null>(null);
  const [demande, setDemande] = useState<DemandeRemboursement | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [documentUrls, setDocumentUrls] = useState<string[]>([]);
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);

  // État pour l'édition de la demande
  const [isEditingDemande, setIsEditingDemande] = useState(false);
  const [editedDemande, setEditedDemande] = useState({
    montant: 0,
    description: '',
    categorie: ''
  });

  // État pour le modal de sélection de transaction
  const [showTransactionPicker, setShowTransactionPicker] = useState(false);

  useEffect(() => {
    if (matchId && clubId) {
      loadData();
    }
  }, [matchId, clubId]);

  const loadData = async () => {
    if (!clubId || !matchId) {
      toast.error('Paramètres manquants');
      navigate('/parametres/auto-link-expenses');
      return;
    }

    setLoading(true);
    try {
      // Charger la correspondance AI
      const aiMatch = await AIMatchStorageService.getMatch(clubId, matchId);
      if (!aiMatch) {
        toast.error('Correspondance introuvable');
        navigate('/parametres/auto-link-expenses');
        return;
      }
      setMatch(aiMatch);

      // Charger la transaction
      const txRef = doc(db, 'clubs', clubId, 'transactions_bancaires', aiMatch.transaction_id);
      const txSnap = await getDoc(txRef);
      if (txSnap.exists()) {
        const txData = txSnap.data();
        setTransaction({
          id: txSnap.id,
          ...txData,
          date_execution: txData.date_execution?.toDate?.() || new Date(txData.date_execution),
          date_valeur: txData.date_valeur?.toDate?.() || new Date(txData.date_valeur),
          created_at: txData.created_at?.toDate?.() || new Date(),
          updated_at: txData.updated_at?.toDate?.() || new Date()
        } as TransactionBancaire);
      }

      // Charger la demande
      const demRef = doc(db, 'clubs', clubId, 'demandes_remboursement', aiMatch.demande_id);
      const demSnap = await getDoc(demRef);
      if (demSnap.exists()) {
        const demData = demSnap.data();
        const dem = {
          id: demSnap.id,
          ...demData,
          date_demande: demData.date_demande?.toDate?.() || new Date(demData.date_demande),
          date_approbation: demData.date_approbation?.toDate?.() || demData.date_approbation,
          created_at: demData.created_at?.toDate?.() || new Date(),
          updated_at: demData.updated_at?.toDate?.() || new Date()
        } as DemandeRemboursement;

        setDemande(dem);
        console.log('[AIMatchValidation] Demande:', dem);
        console.log('[AIMatchValidation] URLs justificatifs:', dem.urls_justificatifs);
        setDocumentUrls(dem.urls_justificatifs || []);
        setEditedDemande({
          montant: dem.montant,
          description: dem.description,
          categorie: dem.categorie || ''
        });
      }
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDemande = async () => {
    if (!clubId || !demande) return;

    try {
      const demRef = doc(db, 'clubs', clubId, 'demandes_remboursement', demande.id);
      await updateDoc(demRef, {
        montant: editedDemande.montant,
        description: editedDemande.description,
        categorie: editedDemande.categorie,
        updated_at: Timestamp.now()
      });

      setDemande({
        ...demande,
        montant: editedDemande.montant,
        description: editedDemande.description,
        categorie: editedDemande.categorie
      });

      setIsEditingDemande(false);
      toast.success('Demande mise à jour');
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde');
      console.error(error);
    }
  };

  const handleValidate = async () => {
    if (!clubId || !match || !user) return;

    setProcessing(true);
    try {
      // Lier la transaction à la demande
      await ExpenseMatchingService.linkManually(clubId, match.transaction_id, match.demande_id);

      // Mettre à jour le statut du match
      await AIMatchStorageService.updateMatchStatus(clubId, match.id, 'validated', user.uid);

      toast.success('✅ Liaison validée avec succès');
      navigate('/parametres/auto-link-expenses');
    } catch (error) {
      toast.error('Erreur lors de la liaison');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!clubId || !match || !user) return;

    setProcessing(true);
    try {
      // Mettre à jour le statut du match
      await AIMatchStorageService.updateMatchStatus(clubId, match.id, 'rejected', user.uid);

      toast('Correspondance rejetée', {
        icon: 'ℹ️',
        style: {
          background: '#EFF6FF',
          color: '#1E40AF',
          border: '1px solid #BFDBFE'
        }
      });
      navigate('/parametres/auto-link-expenses');
    } catch (error) {
      toast.error('Erreur lors du rejet');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleManualSelection = async (newTransactionId: string) => {
    if (!clubId || !match || !user || !demande) return;

    setProcessing(true);
    try {
      // 1. Rejeter l'ancienne correspondance AI
      await AIMatchStorageService.updateMatchStatus(clubId, match.id, 'rejected', user.uid);

      // 2. Créer la liaison manuelle avec la nouvelle transaction
      await ExpenseMatchingService.linkManually(clubId, newTransactionId, demande.id);

      toast.success('✅ Nouvelle transaction liée avec succès');
      setShowTransactionPicker(false);
      navigate('/parametres/auto-link-expenses');
    } catch (error) {
      toast.error('Erreur lors de la liaison');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const renderDocumentPreview = () => {
    console.log('[AIMatchValidation] renderDocumentPreview - documentUrls:', documentUrls);
    console.log('[AIMatchValidation] renderDocumentPreview - selectedDocIndex:', selectedDocIndex);

    if (documentUrls.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg p-8">
          <AlertCircle className="h-16 w-16 text-gray-400 dark:text-dark-text-muted mb-4" />
          <p className="text-gray-600 dark:text-dark-text-secondary font-medium">Aucun justificatif disponible</p>
          <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-2">Cette demande n'a pas de document attaché</p>
        </div>
      );
    }

    const currentUrl = documentUrls[selectedDocIndex];
    console.log('[AIMatchValidation] Current URL:', currentUrl);

    // Extraire le nom du fichier de l'URL (avant les paramètres ? et &)
    const urlWithoutParams = currentUrl.split('?')[0];
    const isPdf = urlWithoutParams.toLowerCase().endsWith('.pdf');
    const isImage = /\.(jpg|jpeg|png|gif|webp)($|\?)/i.test(currentUrl);
    const isText = /\.(txt|csv|json|log)($|\?)/i.test(currentUrl);
    console.log('[AIMatchValidation] File types - PDF:', isPdf, 'Image:', isImage, 'Text:', isText);

    return (
      <div className="h-full flex flex-col">
        {/* Document selector if multiple */}
        {documentUrls.length > 1 && (
          <div className="flex items-center gap-2 mb-4 p-2 bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg">
            {documentUrls.map((url, index) => (
              <button
                key={index}
                onClick={() => setSelectedDocIndex(index)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  selectedDocIndex === index
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-200'
                }`}
              >
                Document {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* Document viewer */}
        <div className="flex-1 bg-white dark:bg-dark-bg-secondary rounded-lg overflow-hidden shadow-inner">
          {isPdf ? (
            <iframe
              src={currentUrl}
              className="w-full h-full"
              title="Document PDF"
            />
          ) : isImage ? (
            <div className="w-full h-full flex items-center justify-center p-4">
              <img
                src={currentUrl}
                alt="Justificatif"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : isText ? (
            <iframe
              src={currentUrl}
              className="w-full h-full"
              title="Document texte"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8">
              <FileText className="h-16 w-16 text-blue-600 mb-4" />
              <p className="text-gray-700 dark:text-dark-text-primary font-medium mb-2">Aperçu non disponible</p>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                Ouvrir le document
              </a>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-dark-text-secondary">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!transaction || !demande || !match) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <p className="text-gray-900 dark:text-dark-text-primary font-medium">Données introuvables</p>
          <button
            onClick={() => navigate('/parametres/auto-link-expenses')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary">
      {/* Header */}
      <div className="bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4">
        <div className="max-w-7xl mx-auto">
          {/* Top row - Navigation */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => navigate('/parametres/auto-link-expenses')}
              className="flex items-center gap-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:text-dark-text-primary transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              Retour à la liste
            </button>
          </div>

          {/* Bottom row - Title and actions */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">Validation de correspondance IA</h1>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Vérifiez la correspondance avant de valider</p>
            </div>

            {/* Action buttons */}
            {match.statut === 'pending' && (
              <div className="flex gap-3">
                <button
                  onClick={() => setShowTransactionPicker(true)}
                  disabled={processing}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <Search className="h-5 w-5" />
                  Choisir une autre transaction
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="px-4 py-2 bg-gray-300 text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  <X className="h-5 w-5" />
                  Rejeter
                </button>
                <button
                  onClick={handleValidate}
                  disabled={processing}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Validation...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Valider la liaison
                    </>
                  )}
                </button>
              </div>
            )}

            {match.statut !== 'pending' && (
              <div className={`px-4 py-2 rounded-lg font-medium ${
                match.statut === 'validated'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-700'
              }`}>
                {match.statut === 'validated' ? '✅ Validé' : '❌ Rejeté'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-5 gap-6 h-[calc(100vh-180px)]">
          {/* Left column - Transaction & AI Analysis & Demand */}
          <div className="col-span-2 space-y-6 overflow-y-auto">
            {/* Transaction bancaire */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border-2 border-blue-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  Transaction bancaire proposée
                </h2>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                  Analyse IA
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Montant</span>
                  <span className="text-lg font-bold text-red-600">
                    {formatMontant(transaction.montant)}
                  </span>
                </div>
                <div className="border-t border-gray-200 dark:border-dark-border pt-3">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-2">Bénéficiaire</span>
                  <span className="text-base font-bold text-gray-900 dark:text-dark-text-primary">{transaction.contrepartie_nom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Date d'exécution</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">{formatDate(transaction.date_execution)}</span>
                </div>
                {transaction.contrepartie_iban && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-3">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">IBAN</span>
                    <span className="text-xs font-mono text-gray-700 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary px-2 py-1 rounded block">
                      {transaction.contrepartie_iban}
                    </span>
                  </div>
                )}
                {transaction.communication && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-3">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">Communication</span>
                    <p className="text-sm text-gray-900 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary p-3 rounded border border-gray-200 dark:border-dark-border">
                      {transaction.communication}
                    </p>
                  </div>
                )}
                {transaction.details && (
                  <div className="border-t border-gray-200 dark:border-dark-border pt-3">
                    <span className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">Détails</span>
                    <p className="text-xs text-gray-700 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded">{transaction.details}</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Analysis */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl shadow-sm border border-purple-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                Analyse IA
              </h2>
              <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Confiance</span>
                  <span className={`text-lg font-bold ${
                    match.confidence >= 80 ? 'text-green-600' :
                    match.confidence >= 60 ? 'text-amber-600' :
                    'text-red-600'
                  }`}>
                    {match.confidence}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      match.confidence >= 80 ? 'bg-green-600' :
                      match.confidence >= 60 ? 'bg-amber-600' :
                      'bg-red-600'
                    }`}
                    style={{ width: `${match.confidence}%` }}
                  />
                </div>
              </div>
              <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">Raisonnement :</p>
                <p className="text-sm text-gray-900 dark:text-dark-text-primary leading-relaxed">{match.reasoning}</p>
              </div>
            </div>

            {/* Dépense */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary flex items-center gap-2">
                  <User className="h-5 w-5 text-orange-600" />
                  Dépense
                </h2>
                {!isEditingDemande ? (
                  <button
                    onClick={() => setIsEditingDemande(true)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <Edit2 className="h-4 w-4" />
                    Modifier
                  </button>
                ) : (
                  <button
                    onClick={handleSaveDemande}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 flex items-center gap-1"
                  >
                    <Save className="h-4 w-4" />
                    Sauvegarder
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Montant */}
                <div>
                  <label className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">Montant</label>
                  {isEditingDemande ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editedDemande.montant}
                      onChange={(e) => setEditedDemande({ ...editedDemande, montant: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <span className="text-lg font-bold text-orange-600">
                      {formatMontant(demande.montant)}
                    </span>
                  )}
                </div>

                {/* Demandeur */}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600 dark:text-dark-text-secondary">Demandeur</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {demande.demandeur_nom} {demande.demandeur_prenom}
                  </span>
                </div>

                {/* Catégorie */}
                <div>
                  <label className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">Catégorie</label>
                  {isEditingDemande ? (
                    <input
                      type="text"
                      value={editedDemande.categorie}
                      onChange={(e) => setEditedDemande({ ...editedDemande, categorie: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-dark-text-primary">{demande.categorie || 'N/A'}</span>
                  )}
                </div>

                {/* Description */}
                <div>
                  <label className="text-sm text-gray-600 dark:text-dark-text-secondary block mb-1">Description</label>
                  {isEditingDemande ? (
                    <textarea
                      value={editedDemande.description}
                      onChange={(e) => setEditedDemande({ ...editedDemande, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-sm text-gray-900 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary p-2 rounded">{demande.description}</p>
                  )}
                </div>

                {demande.date_approbation && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 dark:text-dark-text-muted">Approuvé le</span>
                    <span className="text-gray-700 dark:text-dark-text-primary">
                      {formatDate(new Date(demande.date_approbation))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right column - Document preview */}
          <div className="col-span-3">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 h-full">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
                Justificatif{documentUrls.length > 1 ? 's' : ''}
                {documentUrls.length > 0 && (
                  <span className="text-sm text-gray-500 dark:text-dark-text-muted font-normal">
                    ({documentUrls.length} document{documentUrls.length > 1 ? 's' : ''})
                  </span>
                )}
              </h2>
              <div className="h-[calc(100%-3rem)]">
                {renderDocumentPreview()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Picker Modal */}
      {showTransactionPicker && clubId && transaction && demande && (
        <TransactionPickerModal
          clubId={clubId}
          currentTransactionId={transaction.id}
          demandeAmount={demande.montant}
          onSelect={handleManualSelection}
          onClose={() => setShowTransactionPicker(false)}
        />
      )}
    </div>
  );
}
