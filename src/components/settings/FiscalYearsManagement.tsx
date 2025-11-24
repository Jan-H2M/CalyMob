import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  Lock,
  LockKeyhole,
  Unlock,
  Check,
  X,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Euro,
  Eye,
  Save,
  Loader2,
  Clock
} from 'lucide-react';
import { FiscalYear } from '@/types';
import { FiscalYearService } from '@/services/fiscalYearService';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import { FiscalYearDetailView } from './FiscalYearDetailView';
import { formatMontant, formatDate, cn } from '@/utils/utils';
import toast from 'react-hot-toast';
import { differenceInDays } from 'date-fns';

export function FiscalYearsManagement() {
  const { clubId, user } = useAuth();
  const { allFiscalYears: contextFiscalYears, selectedFiscalYear, setSelectedFiscalYear } = useFiscalYear();
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [currentFY, setCurrentFY] = useState<FiscalYear | null>(null);
  const [loading, setLoading] = useState(true);
  const [balanceCurrent, setBalanceCurrent] = useState<number>(0);
  const [balanceSavings, setBalanceSavings] = useState<number>(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closing, setClosing] = useState(false);

  // DetailView state (replaces old inline edit form)
  const [detailViewFY, setDetailViewFY] = useState<FiscalYear | null>(null);

  // Formulaire de création uniquement (pas d'édition inline)
  const [newFYYear, setNewFYYear] = useState(new Date().getFullYear() + 1);
  const [newFYStartDate, setNewFYStartDate] = useState('');
  const [newFYEndDate, setNewFYEndDate] = useState('');
  const [newFYOpeningCurrent, setNewFYOpeningCurrent] = useState(0);
  const [newFYOpeningSavings, setNewFYOpeningSavings] = useState(0);
  const [newFYAccountCurrent, setNewFYAccountCurrent] = useState('');
  const [newFYAccountSavings, setNewFYAccountSavings] = useState('');
  const [newFYNotes, setNewFYNotes] = useState('');

  // Charger les années fiscales
  useEffect(() => {
    const loadFiscalYears = async () => {
      if (!clubId) return;

      try {
        setLoading(true);
        const years = await FiscalYearService.getFiscalYears(clubId);
        setFiscalYears(years);

        const current = years.find(y => y.status === 'open');
        setCurrentFY(current || null);

        // Charger les soldes en temps réel si année active
        if (current) {
          const balCurrent = await FiscalYearService.calculateCurrentBalance(clubId, 'current');
          const balSavings = await FiscalYearService.calculateCurrentBalance(clubId, 'savings');
          setBalanceCurrent(balCurrent);
          setBalanceSavings(balSavings);
        }
      } catch (error) {
        console.error('Erreur lors du chargement:', error);
        toast.error('Erreur lors du chargement des années fiscales');
      } finally {
        setLoading(false);
      }
    };

    loadFiscalYears();
  }, [clubId]);

  // Calculer la variation
  const calculateVariation = (opening: number, closing: number) => {
    const diff = closing - opening;
    const percent = opening !== 0 ? (diff / opening) * 100 : 0;
    return { diff, percent };
  };

  // Debug: Afficher les transactions de l'épargne
  const handleDebugSavingsTransactions = async () => {
    if (!clubId || !currentFY) return;

    try {
      const transactions = await FiscalYearService.getTransactionsForFiscalYear(
        clubId,
        currentFY,
        'savings'
      );

      console.log('=== TRANSACTIONS ÉPARGNE ===');
      console.log(`Compte Épargne configuré: ${currentFY.account_numbers?.bank_savings || 'NON DÉFINI'}`);
      console.log(`Nombre de transactions trouvées: ${transactions.length}`);
      console.log('Détail des transactions:');
      transactions.forEach((tx, i) => {
        console.log(`${i + 1}. ${tx.date_execution?.toLocaleDateString()} - ${tx.contrepartie_nom} - ${tx.montant} € (Compte: ${tx.numero_compte})`);
      });

      const total = transactions.reduce((sum, tx) => sum + tx.montant, 0);
      console.log(`Total des mouvements: ${total} €`);
      console.log(`Opening balance: ${currentFY.opening_balances.bank_savings} €`);
      console.log(`Closing balance calculé: ${currentFY.opening_balances.bank_savings + total} €`);
      console.log(`Closing balance affiché: ${balanceSavings} €`);

      toast.success(`${transactions.length} transaction(s) trouvée(s) - Voir console (F12)`);
    } catch (error) {
      console.error('Erreur debug:', error);
      toast.error('Erreur lors du debug');
    }
  };

  // Créer une nouvelle année fiscale
  const handleCreateFiscalYear = async () => {
    if (!clubId || !newFYStartDate || !newFYEndDate) {
      toast.error('Veuillez remplir tous les champs obligatoires');
      return;
    }

    try {
      const startDate = new Date(newFYStartDate);
      const endDate = new Date(newFYEndDate);

      await FiscalYearService.createFiscalYear(
        clubId,
        newFYYear,
        startDate,
        endDate,
        {
          bank_current: newFYOpeningCurrent,
          bank_savings: newFYOpeningSavings
        },
        undefined,
        user?.uid
      );

      toast.success(`Année fiscale ${newFYYear} créée avec succès`);

      // Recharger les données
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);
      setShowCreateForm(false);

      // Reset form
      setNewFYYear(newFYYear + 1);
      setNewFYStartDate('');
      setNewFYEndDate('');
      setNewFYOpeningCurrent(0);
      setNewFYOpeningSavings(0);
    } catch (error) {
      console.error('Erreur lors de la création:', error);
      toast.error('Erreur lors de la création de l\'année fiscale');
    }
  };

  // Clôturer une année fiscale
  const handleCloseFiscalYear = async () => {
    if (!clubId || !currentFY) return;

    try {
      setClosing(true);

      // Vérifier si la clôture est possible
      const { canClose, reasons } = await FiscalYearService.canCloseFiscalYear(clubId, currentFY);

      if (!canClose) {
        const nonWarningReasons = reasons.filter(r => !r.includes('avertissement'));
        if (nonWarningReasons.length > 0) {
          toast.error(`Impossible de clôturer: ${nonWarningReasons.join(', ')}`);
          setClosing(false);
          return;
        }
      }

      await FiscalYearService.closeFiscalYear(clubId, currentFY.id, user?.uid);

      toast.success(`Année fiscale ${currentFY.year} clôturée avec succès`);
      toast.success(`Année ${currentFY.year + 1} créée automatiquement`);

      // Recharger les données
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);
      const newCurrent = years.find(y => y.status === 'open');
      setCurrentFY(newCurrent || null);

      setShowCloseModal(false);
    } catch (error) {
      console.error('Erreur lors de la clôture:', error);
      toast.error('Erreur lors de la clôture de l\'année fiscale');
    } finally {
      setClosing(false);
    }
  };

  // Rouvrir une année fiscale
  const handleReopenFiscalYear = async (fiscalYearId: string) => {
    if (!clubId) return;

    const confirm = window.confirm(
      'Êtes-vous sûr de vouloir rouvrir cette année fiscale ?\n\n' +
      'Cela permettra de faire des ajustements, mais attention aux impacts sur l\'année suivante.'
    );

    if (!confirm) return;

    try {
      await FiscalYearService.reopenFiscalYear(clubId, fiscalYearId);
      toast.success('Année fiscale rouverte');

      // Recharger
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);
    } catch (error) {
      console.error('Erreur lors de la réouverture:', error);
      toast.error('Erreur lors de la réouverture');
    }
  };

  // Verrouiller définitivement une année fiscale
  const handlePermanentlyCloseFiscalYear = async (fiscalYearId: string, year: number) => {
    if (!clubId) return;

    const confirmFirst = window.confirm(
      `⚠️ ATTENTION: Verrouillage définitif de l'année ${year}\n\n` +
      `Cette action est IRRÉVERSIBLE. L'année ne pourra plus jamais être modifiée.\n\n` +
      `Êtes-vous sûr de vouloir continuer ?`
    );

    if (!confirmFirst) return;

    const userInput = prompt(`Pour confirmer, tapez exactement: VERROUILLER`);

    if (userInput !== 'VERROUILLER') {
      toast.error('Action annulée');
      return;
    }

    try {
      await FiscalYearService.permanentlyCloseFiscalYear(clubId, fiscalYearId);
      toast.success(`Année ${year} verrouillée définitivement`);

      // Recharger
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);
    } catch (error: any) {
      console.error('Erreur lors du verrouillage:', error);
      toast.error(error.message || 'Erreur lors du verrouillage');
    }
  };

  // Éditer une année fiscale
  const handleEditFiscalYear = (fy: FiscalYear) => {
    setEditingFY(fy);
    setNewFYYear(fy.year);
    setNewFYStartDate(fy.start_date.toISOString().split('T')[0]);
    setNewFYEndDate(fy.end_date.toISOString().split('T')[0]);
    setNewFYOpeningCurrent(fy.opening_balances.bank_current);
    setNewFYOpeningSavings(fy.opening_balances.bank_savings);
    setNewFYAccountCurrent(fy.account_numbers?.bank_current || '');
    setNewFYAccountSavings(fy.account_numbers?.bank_savings || '');
    setNewFYNotes(fy.notes || '');
    setShowCreateForm(true);
  };

  // Sauvegarder les modifications
  const handleSaveEdit = async () => {
    if (!clubId || !editingFY) return;

    try {
      await FiscalYearService.updateFiscalYear(clubId, editingFY.id, {
        start_date: new Date(newFYStartDate),
        end_date: new Date(newFYEndDate),
        opening_balances: {
          bank_current: newFYOpeningCurrent,
          bank_savings: newFYOpeningSavings
        },
        account_numbers: (newFYAccountCurrent || newFYAccountSavings) ? {
          bank_current: newFYAccountCurrent || undefined,
          bank_savings: newFYAccountSavings || undefined
        } : undefined,
        notes: newFYNotes || undefined
      });

      toast.success('Année fiscale mise à jour');

      // Recharger
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);

      // Recharger les balances si c'est l'année active
      const updatedCurrent = years.find(y => y.status === 'open');
      setCurrentFY(updatedCurrent || null);
      if (updatedCurrent) {
        const balCurrent = await FiscalYearService.calculateCurrentBalance(clubId, 'current');
        const balSavings = await FiscalYearService.calculateCurrentBalance(clubId, 'savings');
        setBalanceCurrent(balCurrent);
        setBalanceSavings(balSavings);
      }

      // Reset
      setEditingFY(null);
      setShowCreateForm(false);
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  // Supprimer une année fiscale
  const handleDeleteFiscalYear = async (fiscalYearId: string) => {
    if (!clubId) return;

    const confirm = window.confirm(
      'Êtes-vous sûr de vouloir supprimer cette année fiscale ?\n\n' +
      'Cette action est irréversible. L\'année doit être ouverte et sans transactions.'
    );

    if (!confirm) return;

    try {
      await FiscalYearService.deleteFiscalYear(clubId, fiscalYearId);
      toast.success('Année fiscale supprimée');

      // Recharger
      const years = await FiscalYearService.getFiscalYears(clubId);
      setFiscalYears(years);
    } catch (error: any) {
      console.error('Erreur lors de la suppression:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-calypso-blue" />
      </div>
    );
  }

  const daysRemaining = currentFY ? differenceInDays(currentFY.end_date, new Date()) : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return '✅';
      case 'closed': return '🔒';
      case 'permanently_closed': return '🔐';
      default: return '';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-100 text-green-800 border-green-300';
      case 'closed': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'permanently_closed': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur d'année fiscale - compact */}
      {selectedFiscalYear && contextFiscalYears.length > 0 && (
        <div className="flex items-center gap-3 py-3 px-4 bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-lg">
          <label className="text-base font-bold text-gray-900 dark:text-dark-text-primary">
            Année fiscale active:
          </label>
          <select
            value={selectedFiscalYear.id}
            onChange={(e) => {
              const fy = contextFiscalYears.find(y => y.id === e.target.value);
              if (fy) setSelectedFiscalYear(fy);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
          >
            {contextFiscalYears.map(fy => (
              <option key={fy.id} value={fy.id}>
                {fy.year} {getStatusIcon(fy.status)}
              </option>
            ))}
          </select>
          <span className={cn(
            "px-2 py-1 text-xs rounded-full font-medium border",
            getStatusColor(selectedFiscalYear.status)
          )}>
            {selectedFiscalYear.status === 'open' && 'Ouverte'}
            {selectedFiscalYear.status === 'closed' && 'Clôturée'}
            {selectedFiscalYear.status === 'permanently_closed' && 'Verrouillée'}
          </span>
          <span className="text-sm text-gray-600 dark:text-dark-text-secondary">
            {formatDate(selectedFiscalYear.start_date)} → {formatDate(selectedFiscalYear.end_date)}
          </span>
        </div>
      )}

      {/* Année fiscale active - GRAND BANNER */}
      {currentFY && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl border-4 border-green-300 dark:border-green-700 p-8 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">
                  Année Fiscale {currentFY.year}
                </h2>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                  {formatDate(currentFY.start_date)} → {formatDate(currentFY.end_date)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="flex items-center gap-2 text-green-600">
                  <Clock className="h-5 w-5" />
                  <span className="text-2xl font-bold">{Math.max(0, daysRemaining)}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted">jours restants</p>
              </div>
              {daysRemaining < 0 && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                >
                  <Lock className="h-4 w-4" />
                  Clôturer l'année
                </button>
              )}
            </div>
          </div>

          {/* Soldes en temps réel */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Compte Courant */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Compte Courant</span>
                <Euro className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                    {formatMontant(balanceCurrent)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">Solde actuel</p>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-dark-text-muted">Début:</span>
                    <span className="font-medium">{formatMontant(currentFY.opening_balances.bank_current)}</span>
                  </div>
                  {(() => {
                    const { diff, percent } = calculateVariation(
                      currentFY.opening_balances.bank_current,
                      balanceCurrent
                    );
                    return (
                      <div className={cn(
                        "flex items-center gap-1 text-sm mt-1",
                        diff >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {diff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span className="font-medium">
                          {diff >= 0 ? '+' : ''}{formatMontant(diff)} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Compte Épargne */}
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 dark:text-dark-text-secondary">Compte Épargne</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDebugSavingsTransactions}
                    className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                    title="Afficher les transactions (debug)"
                  >
                    Debug
                  </button>
                  <Euro className="h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
                    {formatMontant(balanceSavings)}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted">Solde actuel</p>
                </div>
                <div className="border-t pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-dark-text-muted">Début:</span>
                    <span className="font-medium">{formatMontant(currentFY.opening_balances.bank_savings)}</span>
                  </div>
                  {(() => {
                    const { diff, percent } = calculateVariation(
                      currentFY.opening_balances.bank_savings,
                      balanceSavings
                    );
                    return (
                      <div className={cn(
                        "flex items-center gap-1 text-sm mt-1",
                        diff >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {diff >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        <span className="font-medium">
                          {diff >= 0 ? '+' : ''}{formatMontant(diff)} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Solde Principal (CC uniquement) */}
            <div className="bg-gradient-to-br from-calypso-blue to-blue-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Solde Principal</span>
                <Euro className="h-4 w-4 opacity-80" />
              </div>
              <div>
                <div className="text-3xl font-bold">
                  {formatMontant(balanceCurrent)}
                </div>
                <p className="text-xs opacity-80 mt-1">Compte courant uniquement</p>
                <p className="text-xs opacity-60 mt-2">
                  (Épargne: {formatMontant(balanceSavings)})
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bouton créer nouvelle année */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">Historique des années fiscales</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue-dark transition-colors flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Nouvelle année fiscale
        </button>
      </div>

      {/* Formulaire de création/édition */}
      {showCreateForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-dark-text-primary mb-4">
            {editingFY ? `Modifier l'année fiscale ${editingFY.year}` : 'Créer une année fiscale'}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ligne 1: Année + Date de début + Date de fin */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Année
              </label>
              <input
                type="number"
                value={newFYYear}
                onChange={(e) => setNewFYYear(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                min="2020"
                max="2050"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Date de début
                </label>
                <input
                  type="date"
                  value={newFYStartDate}
                  onChange={(e) => {
                    setNewFYStartDate(e.target.value);
                    // Auto-calculer la date de fin (+ 1 an)
                    if (e.target.value) {
                      const start = new Date(e.target.value);
                      const end = new Date(start);
                      end.setFullYear(end.getFullYear() + 1);
                      end.setDate(end.getDate() - 1);
                      setNewFYEndDate(end.toISOString().split('T')[0]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Date de fin
                </label>
                <input
                  type="date"
                  value={newFYEndDate}
                  onChange={(e) => setNewFYEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
                />
              </div>
            </div>

            {/* Ligne 2: IBAN Compte Courant + Solde début compte courant */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                IBAN Compte Courant (optionnel)
              </label>
              <input
                type="text"
                value={newFYAccountCurrent}
                onChange={(e) => setNewFYAccountCurrent(e.target.value)}
                placeholder="BE68 5390 0754 7034"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Solde début compte courant (€)
              </label>
              <input
                type="number"
                value={newFYOpeningCurrent}
                onChange={(e) => setNewFYOpeningCurrent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>

            {/* Ligne 3: IBAN Compte Épargne + Solde début compte épargne */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                IBAN Compte Épargne (optionnel)
              </label>
              <input
                type="text"
                value={newFYAccountSavings}
                onChange={(e) => setNewFYAccountSavings(e.target.value)}
                placeholder="BE68 5390 0754 7035"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Solde début compte épargne (€)
              </label>
              <input
                type="number"
                value={newFYOpeningSavings}
                onChange={(e) => setNewFYOpeningSavings(parseFloat(e.target.value) || 0)}
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>

            {/* Ligne 4: Notes sur 2 colonnes */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                Notes (optionnel)
              </label>
              <textarea
                value={newFYNotes}
                onChange={(e) => setNewFYNotes(e.target.value)}
                rows={2}
                placeholder="Notes ou remarques sur cette année fiscale..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent"
              />
            </div>
          </div>

          {/* Status management buttons (only when editing existing year) */}
          {editingFY && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border">
              <h5 className="text-sm font-semibold text-gray-700 dark:text-dark-text-primary mb-3">
                Gestion du statut
              </h5>
              <div className="flex flex-wrap gap-3">
                {editingFY.status === 'open' && (
                  <button
                    onClick={() => handleCloseFiscalYear(editingFY.id, editingFY.year)}
                    className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2 font-medium"
                  >
                    <Lock className="h-5 w-5" />
                    Clôturer l'année fiscale {editingFY.year}
                  </button>
                )}

                {editingFY.status === 'closed' && (
                  <>
                    <button
                      onClick={() => handleReopenFiscalYear(editingFY.id)}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
                    >
                      <Unlock className="h-5 w-5" />
                      Rouvrir l'année {editingFY.year}
                    </button>
                    <button
                      onClick={() => handlePermanentlyCloseFiscalYear(editingFY.id, editingFY.year)}
                      className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium"
                    >
                      <LockKeyhole className="h-5 w-5" />
                      Verrouiller définitivement {editingFY.year}
                    </button>
                  </>
                )}

                {editingFY.status === 'permanently_closed' && (
                  <div className="px-6 py-3 bg-red-100 text-red-800 rounded-lg flex items-center gap-2 font-medium border border-red-300">
                    <LockKeyhole className="h-5 w-5" />
                    Année verrouillée définitivement (irréversible)
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mt-2">
                {editingFY.status === 'open' && '✅ Année ouverte: tout le monde peut modifier les données'}
                {editingFY.status === 'closed' && '⚠️ Année clôturée: seuls les admins peuvent modifier'}
                {editingFY.status === 'permanently_closed' && '🔐 Année verrouillée: seul le super administrateur peut modifier (urgences uniquement)'}
              </p>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button
              onClick={editingFY ? handleSaveEdit : handleCreateFiscalYear}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {editingFY ? 'Sauvegarder les modifications' : 'Créer l\'année fiscale'}
            </button>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setEditingFY(null);
              }}
              className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Tableau des années fiscales */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto px-4 py-2">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-bg-tertiary border-b border-gray-200 dark:border-dark-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Année</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Période</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Solde début CC</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Solde fin CC</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Variation CC</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Solde début Épargne</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Solde fin Épargne</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Statut</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-dark-text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {fiscalYears.map((fy) => {
                const varCurrent = calculateVariation(fy.opening_balances.bank_current, fy.closing_balances.bank_current);
                const varSavings = calculateVariation(fy.opening_balances.bank_savings, fy.closing_balances.bank_savings);
                const isOpen = fy.status === 'open';

                return (
                  <tr key={fy.id} className={cn(
                    "hover:bg-gray-50",
                    isOpen && "bg-green-50"
                  )}>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "font-bold text-lg",
                        isOpen ? "text-green-600" : "text-gray-900"
                      )}>
                        {fy.year}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                        {formatDate(fy.start_date, 'dd/MM/yyyy')}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted">
                        → {formatDate(fy.end_date, 'dd/MM/yyyy')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-dark-text-primary">
                      {formatMontant(fy.opening_balances.bank_current)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-dark-text-primary">
                      {isOpen ? (
                        <span className="text-green-600">{formatMontant(balanceCurrent)}</span>
                      ) : (
                        formatMontant(fy.closing_balances.bank_current)
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!isOpen && (
                        <div className={cn(
                          "text-sm font-medium",
                          varCurrent.diff >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {varCurrent.diff >= 0 ? '+' : ''}{formatMontant(varCurrent.diff)}
                          <div className="text-xs">({varCurrent.percent.toFixed(1)}%)</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-dark-text-primary">
                      {formatMontant(fy.opening_balances.bank_savings)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-dark-text-primary">
                      {isOpen ? (
                        <span className="text-green-600">{formatMontant(balanceSavings)}</span>
                      ) : (
                        formatMontant(fy.closing_balances.bank_savings)
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full font-medium",
                        fy.status === 'open' && "bg-green-100 text-green-700",
                        fy.status === 'closed' && "bg-gray-100 text-gray-700",
                        fy.status === 'permanently_closed' && "bg-red-100 text-red-700"
                      )}>
                        {fy.status === 'open' && 'Ouverte'}
                        {fy.status === 'closed' && 'Clôturée'}
                        {fy.status === 'permanently_closed' && 'Verrouillée'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        {/* Eye button - opens detail view modal */}
                        <button
                          onClick={() => setDetailViewFY(fy)}
                          className="text-blue-600 hover:text-blue-700 transition-colors"
                          title="Voir les détails"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de clôture */}
      {showCloseModal && currentFY && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-bg-secondary rounded-lg max-w-2xl w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary mb-4">
              Clôturer l'année fiscale {currentFY.year}
            </h3>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Important</p>
                  <p>La clôture va :</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Sauvegarder les soldes de fin calculés</li>
                    <li>Marquer l'année {currentFY.year} comme clôturée</li>
                    <li>Créer automatiquement l'année {currentFY.year + 1} avec report des soldes</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Compte Courant</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{formatMontant(balanceCurrent)}</p>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">Sera reporté sur {currentFY.year + 1}</p>
              </div>
              <div className="bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-dark-text-muted mb-1">Compte Épargne</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{formatMontant(balanceSavings)}</p>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">Sera reporté sur {currentFY.year + 1}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCloseFiscalYear}
                disabled={closing}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {closing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Clôture en cours...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5" />
                    Confirmer la clôture
                  </>
                )}
              </button>
              <button
                onClick={() => setShowCloseModal(false)}
                disabled={closing}
                className="px-4 py-3 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:bg-dark-bg-tertiary transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal */}
      {detailViewFY && (
        <FiscalYearDetailView
          fiscalYear={detailViewFY}
          isOpen={!!detailViewFY}
          onClose={() => setDetailViewFY(null)}
          onUpdate={async () => {
            // Refresh the list
            if (clubId) {
              const years = await FiscalYearService.getFiscalYears(clubId);
              setFiscalYears(years);
            }
          }}
        />
      )}
    </div>
  );
}
