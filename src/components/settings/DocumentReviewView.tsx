import React, { useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
  Euro,
  FileText,
  Building,
  User,
  MessageSquare,
  Link2Off
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { aiDocumentService } from '@/services/aiDocumentService';
import { unlinkExpenseFromTransaction } from '@/services/transactionMatchingService';
import { Membre, Evenement, DemandeRemboursement, TransactionBancaire } from '@/types';
import { CategoryAccountSelector } from '@/components/banque/CategoryAccountSelector';
import { PDFViewer } from '@/components/commun/PDFViewer';
import { ImageViewer } from '@/components/commun/ImageViewer';
import { cn, formatDate, formatMontant } from '@/utils/utils';
import toast from 'react-hot-toast';

interface FileWithDemande {
  file: File;
  sequence: string | null;
  transactionFound: boolean;
  transactionId?: string;
  demandeId: string; // ID de la dépense créée
}

interface DocumentReviewViewProps {
  files: FileWithDemande[];
  currentIndex: number;
  membres: Membre[];
  evenements: Evenement[];
  onNavigate: (index: number) => void;
  onClose: () => void;
}

export function DocumentReviewView({
  files,
  currentIndex,
  membres,
  evenements,
  onNavigate,
  onClose
}: DocumentReviewViewProps) {
  const { clubId, user } = useAuth();
  const currentFile = files[currentIndex];

  // État local pour l'édition
  const [demande, setDemande] = useState<Partial<DemandeRemboursement> | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [linkedTransaction, setLinkedTransaction] = useState<TransactionBancaire | null>(null);
  const [showOtherDemandeur, setShowOtherDemandeur] = useState(false);

  // NOTE: Les catégories et codes comptables sont maintenant gérés par CategoryAccountSelector
  // Pas besoin de les charger ici

  // Debug: Log des membres disponibles
  useEffect(() => {
    if (membres.length > 0) {
      logger.debug('👥 [DocumentReviewView] Membres chargés:', membres.length);
      logger.debug('👥 [DocumentReviewView] Membres actifs:', membres.filter(m => m.status === 'active').length);
      logger.debug('👥 [DocumentReviewView] Exemples:', membres.slice(0, 3).map(m => ({
        id: m.id,
        nom: `${m.prenom} ${m.nom}`,
        status: m.status
      })));
    } else {
      logger.warn('⚠️ [DocumentReviewView] Aucun membre chargé!');
    }
  }, [membres]);

  // Charger les données de la dépense depuis Firestore
  useEffect(() => {
    const loadDemande = async () => {
      if (!clubId || !currentFile?.demandeId) return;

      try {
        const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', currentFile.demandeId);
        const demandeDoc = await getDoc(demandeRef);

        if (demandeDoc.exists()) {
          const data = demandeDoc.data() as DemandeRemboursement;
          setDemande({
            ...data,
            id: demandeDoc.id,
            // Convert Firestore Timestamp to Date
            date_depense: data.date_depense?.toDate?.() || data.date_depense
          });

          // Si demandeur_nom existe sans demandeur_id, afficher le champ texte libre
          if ((data as any).demandeur_nom && !data.demandeur_id) {
            setShowOtherDemandeur(true);
          } else {
            setShowOtherDemandeur(false);
          }
        }
      } catch (error) {
        logger.error('Erreur chargement dépense:', error);
        toast.error('Erreur lors du chargement de la dépense');
      }
    };

    loadDemande();
  }, [clubId, currentFile]);

  // Charger la transaction liée si elle existe
  useEffect(() => {
    const loadLinkedTransaction = async () => {
      if (!clubId || !currentFile?.transactionId) {
        setLinkedTransaction(null);
        return;
      }

      try {
        const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', currentFile.transactionId);
        const transactionDoc = await getDoc(transactionRef);

        if (transactionDoc.exists()) {
          setLinkedTransaction({
            id: transactionDoc.id,
            ...transactionDoc.data()
          } as TransactionBancaire);
        }
      } catch (error) {
        logger.error('Erreur chargement transaction:', error);
      }
    };

    loadLinkedTransaction();
  }, [clubId, currentFile?.transactionId]);

  // Charger l'aperçu du fichier
  useEffect(() => {
    if (!currentFile?.file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      setFilePreview(e.target?.result as string);
    };
    reader.readAsDataURL(currentFile.file);

    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [currentFile]);

  // Analyser avec IA
  const handleAnalyzeWithAI = async () => {
    if (!clubId || !currentFile?.file) return;

    setIsAnalyzingAI(true);

    try {
      logger.debug('🤖 Analyse IA du document...');

      const analysis = await aiDocumentService.analyzeDocument(currentFile.file, {
        categories,
        evenements_recents: evenements,
        membres,
        useAI: true, // Laisse le service décider (IA si configurée, sinon extraction basique)
        clubId
      });

      if (analysis.status === 'completed' && demande) {
        // Mettre à jour les champs avec les résultats de l'IA
        setDemande({
          ...demande,
          montant: analysis.montant || demande.montant,
          date_depense: analysis.date || demande.date_depense,
          description: analysis.description || demande.description,
          categorie: analysis.categorie || demande.categorie,
          code_comptable: analysis.code_comptable || demande.code_comptable
        });

        toast.success('✨ Analyse IA terminée ! Champs pré-remplis');
      } else if (analysis.status === 'error') {
        toast.error(analysis.error || 'Erreur lors de l\'analyse IA');
      }
    } catch (error) {
      logger.error('Erreur analyse IA:', error);
      toast.error('Erreur lors de l\'analyse avec IA');
    } finally {
      setIsAnalyzingAI(false);
    }
  };

  // Sauvegarder les modifications
  const handleSave = async () => {
    if (!clubId || !currentFile?.demandeId || !demande) return;

    setIsSaving(true);

    try {
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', currentFile.demandeId);

      // Clean undefined values before saving to Firestore
      const cleanData = Object.entries(demande).reduce((acc, [key, value]) => {
        if (value !== undefined && value !== null) {
          acc[key] = value;
        }
        return acc;
      }, {} as any);

      await updateDoc(demandeRef, {
        ...cleanData,
        updated_at: serverTimestamp(),
        updated_by: user?.uid || 'unknown'
      });

      toast.success('✅ Modifications sauvegardées');
    } catch (error) {
      logger.error('Erreur sauvegarde:', error);
      toast.error('Erreur lors de la sauvegarde');
    } finally {
      setIsSaving(false);
    }
  };

  // Délier la transaction bancaire
  const handleUnlinkTransaction = async () => {
    if (!clubId || !currentFile?.transactionId || !currentFile?.demandeId) return;

    const confirmUnlink = window.confirm(
      `Voulez-vous vraiment délier cette dépense de la transaction ${currentFile.sequence}?\n\nCela supprimera la liaison automatique.`
    );

    if (!confirmUnlink) return;

    try {
      await unlinkExpenseFromTransaction(
        currentFile.demandeId,
        currentFile.transactionId,
        clubId
      );

      toast.success('🔓 Transaction déliée avec succès');

      // Retirer la transaction liée de l'état
      setLinkedTransaction(null);

      // Recharger la page ou mettre à jour l'état local
      // Pour simplifier, on peut juste recharger la dépense
      const demandeRef = doc(db, 'clubs', clubId, 'demandes_remboursement', currentFile.demandeId);
      const demandeDoc = await getDoc(demandeRef);

      if (demandeDoc.exists()) {
        const data = demandeDoc.data() as DemandeRemboursement;
        setDemande({
          ...data,
          id: demandeDoc.id,
          date_depense: data.date_depense?.toDate?.() || data.date_depense
        });
      }

      // Mettre à jour le fichier courant pour retirer l'indicateur de liaison
      currentFile.transactionFound = false;
      currentFile.transactionId = undefined;

    } catch (error) {
      logger.error('Erreur déliage:', error);
      toast.error('Erreur lors du déliage de la transaction');
    }
  };

  // Passer au suivant (SANS sauvegarder automatiquement)
  const handleNext = () => {
    if (currentIndex < files.length - 1) {
      onNavigate(currentIndex + 1);
    } else {
      toast.success('🎉 Toutes les dépenses ont été révisées !');
      onClose();
    }
  };

  if (!currentFile || !demande) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  const validCount = files.filter(f => f.demandeId).length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary flex flex-col">
      {/* Header avec navigation */}
      <div className="bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Titre et compteur */}
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
              Révision des documents ({currentIndex + 1}/{validCount})
            </h1>
            <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-1">{currentFile.file.name}</p>
          </div>

          {/* Navigation et sauvegarde */}
          <div className="flex items-center gap-3">
            {/* Bouton Sauvegarder dans le header */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 border-2 border-calypso-blue text-calypso-blue rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sauvegarde...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Sauvegarder
                </>
              )}
            </button>

            <button
              onClick={() => onNavigate(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              Précédent
            </button>

            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors"
            >
              {currentIndex === files.length - 1 ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Terminer
                </>
              ) : (
                <>
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Aperçu du document (gauche) - Utilise les viewers robustes */}
        <div className="w-1/2 bg-gray-900 p-2">
          {filePreview && (
            currentFile.file.type === 'application/pdf' ? (
              <PDFViewer
                fileUrl={filePreview}
                fileName={currentFile.file.name}
                className="h-full"
              />
            ) : (
              <ImageViewer
                fileUrl={filePreview}
                fileName={currentFile.file.name}
                className="h-full"
              />
            )
          )}
        </div>

        {/* Formulaire d'édition (droite) */}
        <div className="w-1/2 bg-white dark:bg-dark-bg-secondary overflow-y-auto">
          <div className="p-6 max-w-2xl">
            <div className="space-y-6">
              {/* Badge transaction liée avec détails complets */}
              {currentFile.transactionFound && currentFile.sequence && linkedTransaction && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2 flex-1">
                      <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-green-900 text-base mb-1">
                          Transaction {currentFile.sequence} liée automatiquement
                        </p>
                        <p className="text-xs text-green-700">
                          Les données ont été pré-remplies depuis la transaction bancaire
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleUnlinkTransaction}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors flex-shrink-0"
                      title="Délier cette transaction"
                    >
                      <Link2Off className="h-4 w-4" />
                      Délier
                    </button>
                  </div>

                  {/* Détails de la transaction */}
                  <div className="ml-7 pl-3 border-l-2 border-green-300 space-y-2">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-green-700 font-medium">Date:</span>
                        <span className="text-green-900 ml-2">
                          {formatDate(linkedTransaction.date_execution)}
                        </span>
                      </div>
                      <div>
                        <span className="text-green-700 font-medium">Montant:</span>
                        <span className={cn(
                          "ml-2 font-semibold",
                          linkedTransaction.montant >= 0 ? "text-green-700" : "text-red-700"
                        )}>
                          {formatMontant(linkedTransaction.montant)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span className="text-green-700 font-medium text-sm">Contrepartie:</span>
                      <p className="text-green-900 text-sm mt-0.5">
                        {linkedTransaction.contrepartie_nom || 'Non spécifié'}
                      </p>
                    </div>

                    {linkedTransaction.communication && (
                      <div>
                        <span className="text-green-700 font-medium text-sm">Communication:</span>
                        <p className="text-green-900 text-sm mt-0.5 break-words">
                          {linkedTransaction.communication}
                        </p>
                      </div>
                    )}

                    {linkedTransaction.compte_contrepartie && (
                      <div>
                        <span className="text-green-700 font-medium text-sm">Compte:</span>
                        <span className="text-green-900 text-sm ml-2 font-mono">
                          {linkedTransaction.compte_contrepartie}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Bouton Analyser avec IA */}
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Informations extraites</h2>
                <button
                  onClick={handleAnalyzeWithAI}
                  disabled={isAnalyzingAI}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {isAnalyzingAI ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Analyser avec IA
                    </>
                  )}
                </button>
              </div>

              {/* Montant */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Euro className="h-4 w-4" />
                  Montant
                </label>
                <input
                  type="number"
                  value={demande.montant || 0}
                  onChange={(e) => setDemande({ ...demande, montant: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  step="0.01"
                  min="0"
                />
              </div>

              {/* Date */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Calendar className="h-4 w-4" />
                  Date de la dépense
                </label>
                <input
                  type="date"
                  value={demande.date_depense ? formatDate(demande.date_depense).split('/').reverse().join('-') : ''}
                  onChange={(e) => setDemande({ ...demande, date_depense: new Date(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                />
              </div>

              {/* Fournisseur */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Building className="h-4 w-4" />
                  Fournisseur
                </label>
                <input
                  type="text"
                  value={demande.description || ''}
                  onChange={(e) => setDemande({ ...demande, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  placeholder="Nom du fournisseur"
                />
              </div>

              {/* Description */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <FileText className="h-4 w-4" />
                  Description
                </label>
                <textarea
                  value={demande.titre || ''}
                  onChange={(e) => setDemande({ ...demande, titre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  rows={3}
                  placeholder="Description de la dépense"
                />
              </div>

              {/* Catégorie et Code comptable (avec filtrage automatique) */}
              <div>
                <CategoryAccountSelector
                  isExpense={true}
                  selectedCategory={demande.categorie || ''}
                  selectedAccountCode={demande.code_comptable || ''}
                  clubId={clubId}
                  counterpartyName={demande.titre || ''}
                  onCategoryChange={(categoryId) => setDemande({ ...demande, categorie: categoryId })}
                  onAccountCodeChange={(accountCode) => setDemande({ ...demande, code_comptable: accountCode })}
                />
              </div>

              {/* Demandeur */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <User className="h-4 w-4" />
                  Demandeur
                </label>

                {!showOtherDemandeur ? (
                  <div className="space-y-2">
                    <select
                      value={demande.demandeur_id || ''}
                      onChange={(e) => {
                        if (e.target.value === 'autre') {
                          setShowOtherDemandeur(true);
                          setDemande({ ...demande, demandeur_id: undefined, demandeur_nom: '' } as any);
                        } else {
                          const selectedMembre = membres.find(m => m.id === e.target.value);
                          setDemande({
                            ...demande,
                            demandeur_id: e.target.value,
                            demandeur_nom: selectedMembre ? `${selectedMembre.prenom} ${selectedMembre.nom}` : undefined
                          } as any);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                    >
                      <option value="">Sélectionner un membre</option>
                      {membres
                        .filter(m => m.status === 'active')
                        .sort((a, b) => {
                          // Support both User (displayName) and Membre (prenom/nom) structures
                          const nameA = (a as any).displayName || `${a.prenom || ''} ${a.nom || ''}`.trim();
                          const nameB = (b as any).displayName || `${b.prenom || ''} ${b.nom || ''}`.trim();
                          return nameA.localeCompare(nameB);
                        })
                        .map(membre => {
                          // Support both User (displayName) and Membre (prenom/nom) structures
                          const displayName = (membre as any).displayName || `${membre.prenom || ''} ${membre.nom || ''}`.trim();
                          return (
                            <option key={membre.id} value={membre.id}>
                              {displayName}
                            </option>
                          );
                        })
                      }
                      <option value="autre" className="font-medium">--- Autre (texte libre) ---</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Choisissez un membre ou "Autre" pour saisir manuellement
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={(demande as any).demandeur_nom || ''}
                        onChange={(e) => setDemande({ ...demande, demandeur_id: undefined, demandeur_nom: e.target.value } as any)}
                        placeholder="Nom du demandeur (ex: Fournisseur externe, Club Calypso...)"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setShowOtherDemandeur(false);
                          setDemande({ ...demande, demandeur_id: undefined, demandeur_nom: undefined } as any);
                        }}
                        className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary transition-colors text-sm"
                        title="Revenir à la liste"
                      >
                        ← Liste
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      Saisissez le nom du demandeur ou cliquez "← Liste" pour choisir un membre
                    </p>
                  </div>
                )}
              </div>

              {/* Événement lié */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <Calendar className="h-4 w-4" />
                  Événement lié (optionnel)
                </label>
                <select
                  value={demande.evenement_id || ''}
                  onChange={(e) => setDemande({ ...demande, evenement_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                >
                  <option value="">Aucun événement</option>
                  {evenements.map(evt => (
                    <option key={evt.id} value={evt.id}>
                      {evt.titre} - {formatDate(evt.date)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Commentaire */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  <MessageSquare className="h-4 w-4" />
                  Commentaire (optionnel)
                </label>
                <textarea
                  value={demande.commentaire || ''}
                  onChange={(e) => setDemande({ ...demande, commentaire: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                  rows={3}
                  placeholder="Ajoutez des notes ou précisions sur cette dépense..."
                />
              </div>

              {/* Note : Le bouton de sauvegarde est maintenant dans le header pour une meilleure visibilité */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
