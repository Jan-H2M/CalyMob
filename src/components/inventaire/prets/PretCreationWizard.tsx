import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowRight, ArrowLeft, User, Package, FileText, PenTool, Calendar } from 'lucide-react';
import { LoanService } from '@/services/loanService';
import { getMembres } from '@/services/membreService';
import { InventoryItemService } from '@/services/inventoryItemService';
import { PDFGenerationService } from '@/services/pdfGenerationService';
import { EmailService } from '@/services/emailService';
import { InventoryItem, Loan } from '@/types/inventory';
import { Membre } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';

interface Props {
  onClose: () => void;
  onComplete: () => void;
}

type Step = 'member' | 'items' | 'details' | 'signature';

export function PretCreationWizard({ onClose, onComplete }: Props) {
  const { clubId, appUser } = useAuth();
  const [step, setStep] = useState<Step>('member');
  const [loading, setLoading] = useState(false);

  // Data
  const [members, setMembers] = useState<Membre[]>([]);
  const [availableItems, setAvailableItems] = useState<InventoryItem[]>([]);

  // Form
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [datePret, setDatePret] = useState(new Date().toISOString().split('T')[0]);
  const [dateRetourPrevue, setDateRetourPrevue] = useState('');
  const [notes, setNotes] = useState('');
  const [montantCaution, setMontantCaution] = useState(0);

  // Signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState('');

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId]);

  useEffect(() => {
    if (selectedItemIds.length > 0 && clubId) {
      calculateCaution();
    }
  }, [selectedItemIds, clubId]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const [membersData, itemsData] = await Promise.all([
        getMembres(clubId, { member_status: 'active' }),
        InventoryItemService.getItems(clubId, { statut: 'disponible' })
      ]);

      setMembers(membersData);
      setAvailableItems(itemsData);
    } catch (error) {
      console.error('Erreur chargement données:', error);
      toast.error('Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const calculateCaution = async () => {
    if (!clubId) return;

    try {
      const caution = await LoanService.calculateCautionAmount(clubId, selectedItemIds);
      setMontantCaution(caution);
    } catch (error) {
      console.error('Erreur calcul caution:', error);
    }
  };

  const handleNext = () => {
    if (step === 'member' && !selectedMemberId) {
      toast.error('Veuillez sélectionner un membre');
      return;
    }

    if (step === 'items' && selectedItemIds.length === 0) {
      toast.error('Veuillez sélectionner au moins un matériel');
      return;
    }

    if (step === 'details') {
      if (!dateRetourPrevue) {
        toast.error('Veuillez indiquer la date de retour prévue');
        return;
      }
      if (new Date(dateRetourPrevue) <= new Date(datePret)) {
        toast.error('La date de retour doit être après la date de prêt');
        return;
      }
    }

    const steps: Step[] = ['member', 'items', 'details', 'signature'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex < steps.length - 1) {
      setStep(steps[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const steps: Step[] = ['member', 'items', 'details', 'signature'];
    const currentIndex = steps.indexOf(step);
    if (currentIndex > 0) {
      setStep(steps[currentIndex - 1]);
    }
  };

  const handleComplete = async () => {
    if (!clubId || !appUser) return;

    if (!signatureDataUrl) {
      toast.error('Veuillez signer le document');
      return;
    }

    setLoading(true);

    try {
      // Créer le prêt
      const loanData: Omit<Loan, 'id' | 'createdAt' | 'updatedAt' | 'checklist_snapshot'> = {
        memberId: selectedMemberId,
        itemIds: selectedItemIds,
        date_pret: Timestamp.fromDate(new Date(datePret)),
        date_retour_prevue: Timestamp.fromDate(new Date(dateRetourPrevue)),
        montant_caution: montantCaution,
        statut: 'actif',
        notes,
        signature_emprunteur: undefined, // Sera mis à jour après
        signature_retour: undefined,
        date_retour_reel: undefined,
        caution_retournee: undefined,
        caution_non_rendue: undefined,
        notes_retour: undefined
      };

      const loanId = await LoanService.createLoan(clubId, loanData);

      // Upload signature
      await LoanService.uploadSignature(clubId, loanId, 'pret', signatureDataUrl);

      // Générer et télécharger automatiquement le contrat PDF
      let pdfGenerated = false;
      try {
        const member = selectedMember;
        const items = selectedItems;

        if (member && items.length > 0) {
          const clubInfo = {
            nom: 'Calypso Diving Club',
            adresse: 'Belgique',
            email: 'contact@calypso-diving.be',
            telephone: '+32 XXX XX XX XX',
            logo_url: '/logo-horizontal.jpg'
          };

          // Créer un objet Loan temporaire avec l'ID
          const fullLoan: Loan = {
            ...loanData,
            id: loanId,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            checklist_snapshot: []
          };

          const pdfBlob = await PDFGenerationService.generateLoanContract(
            fullLoan,
            member,
            items,
            clubInfo
          );

          // Télécharger automatiquement
          const url = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `contrat-pret-${loanId}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          pdfGenerated = true;

          // Envoyer email de confirmation (async, ne pas bloquer)
          try {
            console.log('[PretCreationWizard] Envoi email confirmation...');
            const emailResult = await EmailService.sendLoanConfirmation(
              clubId,
              fullLoan,
              member,
              items,
              undefined, // contractPdfUrl - TODO: upload PDF vers Storage
              clubInfo
            );

            if (emailResult.success) {
              console.log('[PretCreationWizard] Email envoyé avec succès');
              toast.success('Email de confirmation envoyé', { duration: 2000 });
            } else {
              console.warn('[PretCreationWizard] Échec envoi email:', emailResult.error);
              toast('Prêt créé mais email non envoyé', { icon: '⚠️', duration: 3000 });
            }
          } catch (emailError) {
            console.error('[PretCreationWizard] Erreur envoi email:', emailError);
            // Ne pas bloquer le workflow si email échoue
          }
        }
      } catch (pdfError) {
        console.error('Erreur génération PDF:', pdfError);
        // Ne pas bloquer la création du prêt si le PDF échoue
        toast.error('Prêt créé mais erreur lors de la génération du PDF');
      }

      const message = pdfGenerated ? 'Prêt créé et contrat téléchargé' : 'Prêt créé';
      toast.success(message);
      onComplete();
    } catch (error: any) {
      console.error('Erreur création prêt:', error);
      toast.error(error.message || 'Erreur lors de la création');
    } finally {
      setLoading(false);
    }
  };

  const handleItemToggle = (itemId: string) => {
    if (selectedItemIds.includes(itemId)) {
      setSelectedItemIds(selectedItemIds.filter(id => id !== itemId));
    } else {
      setSelectedItemIds([...selectedItemIds, itemId]);
    }
  };

  // ========================================
  // SIGNATURE CANVAS
  // ========================================

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Sauvegarder la signature en Data URL
    const dataUrl = canvas.toDataURL('image/png');
    setSignatureDataUrl(dataUrl);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl('');
  };

  useEffect(() => {
    // Initialize canvas
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;

    // Fill white background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [step]);

  const selectedMember = members.find(m => m.id === selectedMemberId);
  const selectedItems = availableItems.filter(i => selectedItemIds.includes(i.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 overflow-y-auto">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 h-12 w-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Package className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-dark-text-primary">
                Nouveau prêt
              </h2>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary">
                Étape {['member', 'items', 'details', 'signature'].indexOf(step) + 1} sur 4
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-dark-text-primary"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Member */}
          {step === 'member' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                  Sélectionner le membre
                </h3>
              </div>

              <div className="space-y-2">
                {members.map(member => (
                  <label
                    key={member.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                  >
                    <input
                      type="radio"
                      name="member"
                      value={member.id}
                      checked={selectedMemberId === member.id}
                      onChange={(e) => setSelectedMemberId(e.target.value)}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {member.nom} {member.prenom}
                      </p>
                      {member.email && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{member.email}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Items */}
          {step === 'items' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Package className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                  Sélectionner le matériel
                </h3>
              </div>

              <div className="space-y-2">
                {availableItems.map(item => (
                  <label
                    key={item.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 dark:border-dark-border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                  >
                    <input
                      type="checkbox"
                      checked={selectedItemIds.includes(item.id)}
                      onChange={() => handleItemToggle(item.id)}
                      className="h-4 w-4 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                        {item.numero_serie}
                      </p>
                      {item.nom && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary">{item.nom}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>

              {selectedItemIds.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-200">
                    <strong>{selectedItemIds.length}</strong> matériel(s) sélectionné(s)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Details */}
          {step === 'details' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <FileText className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                  Détails du prêt
                </h3>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-dark-text-secondary">Membre</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {selectedMember?.nom} {selectedMember?.prenom}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-dark-text-secondary">Matériel</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {selectedItems.length} article(s)
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Date de prêt
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={datePret}
                      onChange={(e) => setDatePret(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                    Retour prévu *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="date"
                      value={dateRetourPrevue}
                      onChange={(e) => setDateRetourPrevue(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Montant de caution
                </label>
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {montantCaution.toFixed(2)} €
                  </p>
                  <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                    Calculé automatiquement selon les règles de caution
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-1">
                  Notes (optionnel)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Instructions particulières, remarques..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
                />
              </div>
            </div>
          )}

          {/* Step 4: Signature */}
          {step === 'signature' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <PenTool className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-dark-text-primary">
                  Signature de l'emprunteur
                </h3>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <p className="text-sm text-yellow-800 dark:text-yellow-300">
                  Le membre <strong>{selectedMember?.nom} {selectedMember?.prenom}</strong> doit signer pour confirmer le prêt
                  de <strong>{selectedItems.length}</strong> matériel(s) avec une caution de <strong>{montantCaution.toFixed(2)} €</strong>.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-secondary mb-2">
                  Signez dans le cadre ci-dessous
                </label>
                <div className="relative border-2 border-gray-300 dark:border-dark-border rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: '200px' }}
                  />
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                  <button
                    onClick={clearSignature}
                    className="px-3 py-1 text-sm text-gray-700 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary"
                  >
                    Effacer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={handleBack}
            disabled={step === 'member'}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-primary border border-gray-300 dark:border-dark-border rounded-md hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Précédent
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary"
            >
              Annuler
            </button>

            {step !== 'signature' ? (
              <button
                onClick={handleNext}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Suivant
                <ArrowRight className="h-4 w-4 ml-2" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading || !signatureDataUrl}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Création...' : 'Créer le prêt'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
