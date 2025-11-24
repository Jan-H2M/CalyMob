import { useState, useEffect } from 'react';
import { X, Plus, Trash2, FileText, Loader2 } from 'lucide-react';
import { DemandeRemboursement } from '@/types';
import { expenseReportService } from '@/services/expenseReportService';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';

interface ExpenseItem {
  id: string;
  description: string;
  montant: number;
}

interface ExpenseReportFormData {
  titre: string;
  declarant: {
    nom: string;
    email: string;
  };
  dateCreation: Date;
  depenses: ExpenseItem[];
  coordonneesBancaires: {
    beneficiaire: string;
    iban: string;
  };
}

interface ExpenseReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (demand: Partial<DemandeRemboursement>, files: File[]) => Promise<string>;
  currentUser: any;
  clubId: string;
}

export function ExpenseReportModal({
  isOpen,
  onClose,
  onCreate,
  currentUser: _currentUser, // Renommé car on va utiliser useAuth
  clubId
}: ExpenseReportModalProps) {
  // Utiliser le contexte Auth pour obtenir les vraies données de session
  const { user, appUser } = useAuth();
  const [formData, setFormData] = useState<ExpenseReportFormData>({
    titre: '',
    declarant: { nom: '', email: '' },
    dateCreation: new Date(),
    depenses: [],
    coordonneesBancaires: { beneficiaire: '', iban: '', bic: '' }
  });

  const [isGenerating, setIsGenerating] = useState(false);

  // Initialisation du formulaire au montage
  useEffect(() => {
    if (isOpen && appUser && user) {
      // Debug: voir les données disponibles
      console.log('🔍 ExpenseReportModal - FULL appUser object:', JSON.stringify(appUser, null, 2));
      console.log('🔍 ExpenseReportModal - firstName:', appUser.firstName);
      console.log('🔍 ExpenseReportModal - lastName:', appUser.lastName);
      console.log('🔍 ExpenseReportModal - displayName:', appUser.displayName);
      console.log('🔍 ExpenseReportModal - user:', user);

      // Construire le nom complet depuis firstName + lastName (priorité)
      let fullName = '';
      if (appUser.firstName && appUser.lastName) {
        fullName = `${appUser.firstName} ${appUser.lastName}`;
        console.log('✅ Using firstName + lastName:', fullName);
      } else if (appUser.firstName) {
        fullName = appUser.firstName;
        console.log('✅ Using firstName only:', fullName);
      } else if (appUser.lastName) {
        fullName = appUser.lastName;
        console.log('✅ Using lastName only:', fullName);
      } else if (appUser.displayName) {
        fullName = appUser.displayName;
        console.log('⚠️ Using displayName (fallback):', fullName);
      } else if (user.displayName) {
        fullName = user.displayName;
        console.log('⚠️ Using user.displayName (fallback):', fullName);
      } else {
        // Fallback: Email avant @
        fullName = user.email?.split('@')[0] || 'Utilisateur';
        console.log('⚠️ Using email prefix (last resort):', fullName);
      }

      setFormData({
        titre: '',
        declarant: {
          nom: fullName,
          email: user.email || ''
        },
        dateCreation: new Date(),
        depenses: [],
        coordonneesBancaires: {
          beneficiaire: fullName,
          iban: ''
        }
      });
    }
  }, [isOpen, user, appUser]);

  // Ajouter une dépense
  const handleAddDepense = () => {
    setFormData(prev => ({
      ...prev,
      depenses: [...prev.depenses, { id: uuidv4(), description: '', montant: 0 }]
    }));
  };

  // Supprimer une dépense
  const handleRemoveDepense = (id: string) => {
    setFormData(prev => ({
      ...prev,
      depenses: prev.depenses.filter(d => d.id !== id)
    }));
  };

  // Mettre à jour une dépense
  const handleUpdateDepense = (id: string, field: 'description' | 'montant', value: string | number) => {
    setFormData(prev => ({
      ...prev,
      depenses: prev.depenses.map(d =>
        d.id === id ? { ...d, [field]: value } : d
      )
    }));
  };

  // Calculer le total
  const totalMontant = formData.depenses.reduce((sum, d) => sum + (d.montant || 0), 0);

  // Validation
  const isValid = formData.depenses.length > 0 &&
                  formData.depenses.every(d => d.description.trim() && d.montant > 0);

  // Générer et créer
  const handleGeneratePDF = async () => {
    // Validation finale
    if (!isValid) {
      toast.error('Veuillez ajouter au moins une dépense valide (description + montant > 0)');
      return;
    }

    setIsGenerating(true);

    try {
      // 1. Obtenir le prochain numéro de référence
      const numeroReference = await expenseReportService.getNextExpenseReportNumber(clubId);

      // 2. Générer le PDF
      const pdfBlob = await expenseReportService.generateExpenseReportPDF({
        numeroReference,
        declarant: formData.declarant,
        dateCreation: formData.dateCreation,
        depenses: formData.depenses,
        coordonneesBancaires: formData.coordonneesBancaires.iban || formData.coordonneesBancaires.bic
          ? formData.coordonneesBancaires
          : undefined,
        signature: {
          signePar: formData.declarant.nom,
          dateSignature: new Date(),
          texte: "Je certifie l'exactitude de ces dépenses"
        }
      });

      // 3. Convertir en File
      const pdfFile = new File(
        [pdfBlob],
        `note-de-frais-${numeroReference}.pdf`,
        { type: 'application/pdf' }
      );

      // 4. Générer titre/description
      const autoDescription = formData.depenses.map(d => d.description).join(' | ');
      const titreUtilisateur = formData.titre.trim();

      // Si l'utilisateur a fourni un titre, l'utiliser pour TITRE et DESCRIPTION
      // Sinon, utiliser les descriptions des dépenses
      const titre = titreUtilisateur || autoDescription;
      const description = titreUtilisateur || autoDescription;

      // 5. Créer objet demande
      const newDemand: Partial<DemandeRemboursement> = {
        titre: titre,
        description: description,
        montant: totalMontant,
        date_depense: formData.dateCreation,
        notes: titreUtilisateur ? autoDescription : undefined  // Si titre custom, mettre les dépenses dans les notes
      };

      // 6. Appeler onCreate (crée la demande + upload le PDF)
      await onCreate(newDemand, [pdfFile]);

      // 7. Succès
      toast.success('✓ Note de frais créée et dépense enregistrée');

      // Modal se fermera via le parent après la création

    } catch (error) {
      console.error('Erreur génération PDF:', error);
      toast.error('Erreur lors de la génération de la note de frais');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-bg-primary rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-dark-bg-primary border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
            Créer une Note de frais
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            disabled={isGenerating}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Titre de la demande */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
              📝 Titre de la demande (optionnel)
            </label>
            <input
              type="text"
              value={formData.titre}
              onChange={(e) => setFormData(prev => ({ ...prev, titre: e.target.value }))}
              placeholder="Ex: Frais formation octobre 2025"
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-pink-500 dark:bg-dark-bg-secondary dark:text-dark-text-primary"
              disabled={isGenerating}
            />
            <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
              Si vide, sera généré automatiquement à partir des dépenses
            </p>
          </div>

          {/* Informations générales */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3">
              📋 INFORMATIONS GÉNÉRALES
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-dark-text-secondary mb-1">
                  Nom du demandeur
                </label>
                <input
                  type="text"
                  value={formData.declarant.nom}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    declarant: { ...prev.declarant, nom: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                  disabled={isGenerating}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 dark:text-dark-text-secondary mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={formData.declarant.email}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    declarant: { ...prev.declarant, email: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                  disabled={isGenerating}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm text-gray-600 dark:text-dark-text-secondary mb-1">
                Date de création
              </label>
              <input
                type="date"
                value={formData.dateCreation.toISOString().split('T')[0]}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  dateCreation: new Date(e.target.value)
                }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Dépenses */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3">
              💰 DÉPENSES
            </h3>

            {formData.depenses.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 dark:bg-dark-bg-secondary rounded-lg border-2 border-dashed border-gray-300 dark:border-dark-border">
                <p className="text-gray-500 dark:text-dark-text-muted mb-4">Aucune dépense ajoutée</p>
              </div>
            ) : (
              <div className="space-y-3">
                {formData.depenses.map((dep) => (
                  <div key={dep.id} className="border border-gray-200 dark:border-dark-border rounded-lg p-4 dark:bg-dark-bg-secondary">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                            Description *
                          </label>
                          <input
                            type="text"
                            value={dep.description}
                            onChange={(e) => handleUpdateDepense(dep.id, 'description', e.target.value)}
                            placeholder="Ex: Formation plongée P2"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                            disabled={isGenerating}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                            Montant à rembourser *
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={dep.montant || ''}
                              onChange={(e) => handleUpdateDepense(dep.id, 'montant', parseFloat(e.target.value) || 0)}
                              placeholder="0.00"
                              className="flex-1 px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                              disabled={isGenerating}
                            />
                            <span className="text-gray-600 dark:text-dark-text-secondary">€</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDepense(dep.id)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors mt-6"
                        disabled={isGenerating}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAddDepense}
              className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
              disabled={isGenerating}
            >
              <Plus className="h-4 w-4" />
              Ajouter une dépense
            </button>

            {/* Total */}
            {formData.depenses.length > 0 && (
              <div className="mt-4 p-4 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                    📊 TOTAL À REMBOURSER:
                  </span>
                  <span className="text-lg font-bold text-pink-600 dark:text-pink-400">
                    {totalMontant.toFixed(2)} €
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Coordonnées bancaires */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3">
              🏦 COORDONNÉES BANCAIRES (optionnel)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                  Bénéficiaire
                </label>
                <input
                  type="text"
                  value={formData.coordonneesBancaires.beneficiaire}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    coordonneesBancaires: { ...prev.coordonneesBancaires, beneficiaire: e.target.value }
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                  disabled={isGenerating}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 dark:text-dark-text-secondary mb-1">
                  IBAN
                </label>
                <input
                  type="text"
                  value={formData.coordonneesBancaires.iban}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    coordonneesBancaires: { ...prev.coordonneesBancaires, iban: e.target.value }
                  }))}
                  placeholder="BE68 5390 0754 7034"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg dark:bg-dark-bg-secondary dark:text-dark-text-primary"
                  disabled={isGenerating}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-dark-bg-secondary border-t border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            disabled={isGenerating}
          >
            Annuler
          </button>
          <button
            onClick={handleGeneratePDF}
            disabled={!isValid || isGenerating}
            className="flex items-center gap-2 px-6 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Génération en cours...
              </>
            ) : (
              <>
                <FileText className="h-5 w-5" />
                ✍️ Signer et générer
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
