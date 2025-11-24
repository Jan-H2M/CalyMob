import React, { useState, useEffect } from 'react';
import { X, ClipboardList, Calendar, AlertTriangle, CheckCircle, Package, FileText } from 'lucide-react';
import { LoanService } from '@/services/loanService';
import { getMembreById } from '@/services/membreService';
import { InventoryItemService } from '@/services/inventoryItemService';
import { InventoryConfigService } from '@/services/inventoryConfigService';
import { PDFGenerationService } from '@/services/pdfGenerationService';
import { EmailService } from '@/services/emailService';
import { Loan, InventoryItem, CautionRule } from '@/types/inventory';
import { Membre } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { cn } from '@/utils/utils';

interface Props {
  loan: Loan;
  onClose: () => void;
  onSave: () => void;
}

export function PretDetailView({ loan, onClose, onSave }: Props) {
  const { clubId } = useAuth();
  const [member, setMember] = useState<Membre | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Retour
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [returnNotes, setReturnNotes] = useState('');
  const [cautionRefund, setCautionRefund] = useState(loan.montant_caution);
  const [checklistSnapshot, setChecklistSnapshot] = useState(loan.checklist_snapshot || []);
  const [processing, setProcessing] = useState(false);

  // Editable fields for auto-save
  const [editedNotes, setEditedNotes] = useState(loan.notes || '');

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId, loan.id]);

  useEffect(() => {
    setEditedNotes(loan.notes || '');
  }, [loan.notes]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Charger membre et matériels
      const [memberData, ...itemsData] = await Promise.all([
        getMembreById(clubId, loan.memberId),
        ...loan.itemIds.map(id => InventoryItemService.getItemById(clubId, id))
      ]);

      setMember(memberData);
      setItems(itemsData.filter(i => i !== null) as InventoryItem[]);
    } catch (error) {
      console.error('Erreur chargement données prêt:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save handler
  const handleFieldSave = async (field: string, value: any) => {
    if (!clubId) return;

    try {
      // Validate before saving
      if (field === 'notes' && value && value.trim().length > 500) {
        toast.error('Les notes ne peuvent pas dépasser 500 caractères');
        return;
      }

      // Save to Firestore
      await LoanService.updateLoan(clubId, loan.id, { [field]: value });

      // Success feedback
      toast.success('✓ Sauvegardé', {
        duration: 1500,
        position: 'bottom-right'
      });

      onSave();
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleReturn = async () => {
    if (!clubId || !member) return;

    if (!window.confirm('Confirmer le retour de ce prêt ?')) {
      return;
    }

    setProcessing(true);

    try {
      const returnData = {
        date_retour_reel: Timestamp.fromDate(new Date(returnDate)),
        caution_retournee: cautionRefund,
        notes_retour: returnNotes,
        checklist_snapshot: checklistSnapshot
      };

      await LoanService.returnLoan(clubId, loan.id, returnData);

      toast.success('Retour enregistré');

      // Envoyer email de confirmation retour (async, ne pas bloquer)
      try {
        const clubInfo = {
          nom: 'Calypso Diving Club',
          email: 'contact@calypso-diving.be'
        };

        const updatedLoan = { ...loan, ...returnData };

        const emailResult = await EmailService.sendLoanReturnConfirmation(
          clubId,
          updatedLoan,
          member,
          items,
          clubInfo
        );

        if (emailResult.success) {
          toast.success('Email de confirmation envoyé', { duration: 2000 });
        } else {
          console.warn('[PretDetailView] Échec envoi email:', emailResult.error);
        }

        // Si caution remboursée intégralement, envoyer email remboursement
        if (cautionRefund === loan.montant_caution) {
          const refundResult = await EmailService.sendRefundConfirmation(
            clubId,
            updatedLoan,
            member,
            items,
            cautionRefund,
            clubInfo
          );

          if (refundResult.success) {
            toast.success('Email remboursement caution envoyé', { duration: 2000 });
          }
        }
      } catch (emailError) {
        console.error('[PretDetailView] Erreur envoi email:', emailError);
        // Ne pas bloquer le workflow
      }

      onSave();
    } catch (error: any) {
      console.error('Erreur retour prêt:', error);
      toast.error(error.message || 'Erreur lors du retour');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!clubId) return;

    const reason = window.prompt('Raison de l\'annulation:');
    if (!reason) return;

    setProcessing(true);

    try {
      await LoanService.cancelLoan(clubId, loan.id, reason);
      toast.success('Prêt annulé');
      onSave();
    } catch (error: any) {
      console.error('Erreur annulation prêt:', error);
      toast.error(error.message || 'Erreur lors de l\'annulation');
    } finally {
      setProcessing(false);
    }
  };

  const handleDownloadContract = async () => {
    if (!clubId || !member) return;

    setProcessing(true);

    try {
      // Informations du club (à adapter selon votre structure)
      const clubInfo = {
        nom: 'Calypso Diving Club',
        adresse: 'Belgique',
        email: 'contact@calypso-diving.be',
        logo_url: '/logo-horizontal.jpg'
      };

      // Générer le PDF
      const pdfBlob = await PDFGenerationService.generateLoanContract(
        loan,
        member,
        items,
        clubInfo
      );

      // Télécharger le fichier
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrat-pret-${loan.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Contrat téléchargé');
    } catch (error: any) {
      console.error('Erreur génération PDF:', error);
      toast.error(error.message || 'Erreur lors de la génération du PDF');
    } finally {
      setProcessing(false);
    }
  };

  const handleChecklistToggle = (itemIndex: number, checkItemId: string, type: 'depart' | 'retour') => {
    const updated = [...checklistSnapshot];
    const checkItem = updated[itemIndex].items.find(i => i.id === checkItemId);
    if (checkItem) {
      if (type === 'depart') {
        checkItem.checked_depart = !checkItem.checked_depart;
      } else {
        checkItem.checked_retour = !checkItem.checked_retour;
      }
      setChecklistSnapshot(updated);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    return new Date(timestamp.toDate()).toLocaleDateString();
  };

  const getStatutBadge = (statut: string) => {
    const badges = {
      actif: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      en_retard: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      rendu: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    };

    const labels = {
      actif: 'Actif',
      en_retard: 'En retard',
      rendu: 'Rendu'
    };

    return (
      <span className={cn('px-3 py-1 text-sm font-medium rounded-full', badges[statut as keyof typeof badges])}>
        {labels[statut as keyof typeof labels]}
      </span>
    );
  };

  const isOverdue = loan.statut === 'en_retard';
  const isReturned = loan.statut === 'rendu';

  if (loading) {
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-30 z-40" onClick={onClose} />

        {/* Loading Panel */}
        <div className="fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className={cn(
        "fixed right-0 top-0 h-full w-full md:w-2/3 lg:w-1/2 bg-white dark:bg-dark-bg-secondary shadow-xl z-50",
        "transform transition-transform duration-300 ease-in-out flex flex-col"
      )}>
        {/* Compact Header */}
        <div className="flex-shrink-0 bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                Prêt à {member?.nom} {member?.prenom}
              </h2>
              <span className="text-sm text-gray-500 dark:text-dark-text-muted">•</span>
              {getStatutBadge(loan.statut)}
              {isOverdue && (
                <>
                  <span className="text-sm text-gray-500 dark:text-dark-text-muted">•</span>
                  <span className="inline-flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                    <AlertTriangle className="h-4 w-4" />
                    Retard
                  </span>
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text-primary transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
            {/* Informations générales */}
            <div>
              <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                Informations générales
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                      Date de prêt
                    </span>
                  </div>
                  <p className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">
                    {formatDate(loan.date_pret)}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-dark-text-secondary">
                      Retour prévu
                    </span>
                  </div>
                  <p className="text-base font-semibold text-gray-900 dark:text-dark-text-primary">
                    {formatDate(loan.date_retour_prevue)}
                  </p>
                </div>

                {isReturned && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">
                        Retour effectué
                      </span>
                    </div>
                    <p className="text-base font-semibold text-green-900 dark:text-green-100">
                      {formatDate(loan.date_retour_reel)}
                    </p>
                  </div>
                )}
              </div>

              {/* Notes field with auto-save */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Notes
                </label>
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  onBlur={() => handleFieldSave('notes', editedNotes)}
                  disabled={isReturned}
                  rows={3}
                  placeholder="Notes sur le prêt..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Matériel prêté */}
            <div>
              <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                Matériel prêté
              </h3>

              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {item.numero_serie}
                        </p>
                        {item.nom && (
                          <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{item.nom}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Caution */}
            <div>
              <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                Caution
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-1">
                    Montant
                  </p>
                  <p className="text-xl font-bold text-purple-900 dark:text-purple-100">
                    {loan.montant_caution.toFixed(2)} €
                  </p>
                </div>

                {isReturned && (
                  <>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1">
                        Retournée
                      </p>
                      <p className="text-xl font-bold text-green-900 dark:text-green-100">
                        {loan.caution_retournee?.toFixed(2) || '0.00'} €
                      </p>
                    </div>

                    {loan.caution_non_rendue && loan.caution_non_rendue > 0 && (
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                          Non rendue
                        </p>
                        <p className="text-xl font-bold text-red-900 dark:text-red-100">
                          {loan.caution_non_rendue.toFixed(2)} €
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Checklist (if exists) */}
            {checklistSnapshot.length > 0 && (
              <div>
                <h3 className="text-base font-medium text-gray-900 dark:text-dark-text-primary mb-3">
                  Checklists
                </h3>

                <div className="space-y-4">
                  {checklistSnapshot.map((snapshot, snapshotIndex) => (
                    <div key={`${snapshot.itemId}-${snapshot.checklistId}`} className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                          {snapshot.checklistNom}
                        </h4>
                        <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          {items.find(i => i.id === snapshot.itemId)?.numero_serie}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {snapshot.items.map(checkItem => (
                          <div key={checkItem.id} className="flex items-start gap-3 bg-white dark:bg-dark-bg-secondary rounded p-2">
                            <div className="flex-1">
                              <p className="text-sm text-gray-900 dark:text-dark-text-primary">{checkItem.texte}</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checkItem.checked_depart}
                                  onChange={() => handleChecklistToggle(snapshotIndex, checkItem.id, 'depart')}
                                  disabled={isReturned}
                                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                />
                                <span className="text-xs text-gray-500 dark:text-dark-text-secondary">Départ</span>
                              </label>
                              {!isReturned && showReturnForm && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={checkItem.checked_retour}
                                    onChange={() => handleChecklistToggle(snapshotIndex, checkItem.id, 'retour')}
                                    className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                  />
                                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary">Retour</span>
                                </label>
                              )}
                              {isReturned && (
                                <div className="flex items-center gap-2">
                                  {checkItem.checked_retour ? (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-600" />
                                  )}
                                  <span className="text-xs text-gray-500 dark:text-dark-text-secondary">Retour</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Return Form */}
            {!isReturned && showReturnForm && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-base font-medium text-blue-900 dark:text-blue-200 mb-4">
                  Enregistrer le retour
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                      Date de retour
                    </label>
                    <input
                      type="date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                      Caution retournée (€)
                    </label>
                    <input
                      type="number"
                      value={cautionRefund}
                      onChange={(e) => setCautionRefund(parseFloat(e.target.value) || 0)}
                      min="0"
                      max={loan.montant_caution}
                      step="0.01"
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                    <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
                      Sur {loan.montant_caution.toFixed(2)} € de caution
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                      Notes de retour
                    </label>
                    <textarea
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      rows={3}
                      placeholder="État du matériel, remarques..."
                      className="w-full px-3 py-2 border border-blue-300 dark:border-blue-700 rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Notes de retour (if returned) */}
            {isReturned && loan.notes_retour && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <p className="text-sm font-medium text-green-900 dark:text-green-200 mb-1">
                  Notes de retour
                </p>
                <p className="text-sm text-green-800 dark:text-green-300">{loan.notes_retour}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-between p-4 border-t border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="flex items-center gap-3">
            {!isReturned && loan.statut === 'actif' && (
              <button
                onClick={handleCancel}
                disabled={processing}
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 disabled:opacity-50"
              >
                Annuler le prêt
              </button>
            )}
            <button
              onClick={handleDownloadContract}
              disabled={processing}
              className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 disabled:opacity-50"
            >
              <FileText className="h-4 w-4 mr-2" />
              Télécharger contrat
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
            >
              Fermer
            </button>
            {!isReturned && (
              <>
                {!showReturnForm ? (
                  <button
                    onClick={() => setShowReturnForm(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Enregistrer le retour
                  </button>
                ) : (
                  <button
                    onClick={handleReturn}
                    disabled={processing}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Enregistrement...' : 'Confirmer le retour'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
