import React, { useState, useEffect } from 'react';
import { ClipboardList, Plus, Filter, Search, AlertTriangle, Calendar, Eye } from 'lucide-react';
import { LoanService } from '@/services/loanService';
import { getMembres } from '@/services/membreService';
import { InventoryItemService } from '@/services/inventoryItemService';
import { Loan, InventoryItem } from '@/types/inventory';
import { Membre } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { PretDetailView } from './PretDetailView';
import { PretCreationWizard } from './PretCreationWizard';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function PretsPage() {
  const { clubId } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<Membre[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<'' | 'actif' | 'en_retard' | 'rendu'>('');
  const [filterMembre, setFilterMembre] = useState<string>('');

  // Modals
  const [detailViewLoan, setDetailViewLoan] = useState<Loan | null>(null);
  const [showCreationWizard, setShowCreationWizard] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    actifs: 0,
    en_retard: 0,
    rendus: 0,
    caution_totale_en_cours: 0
  });

  useEffect(() => {
    if (clubId) {
      loadData();
    }
  }, [clubId, filterStatut, filterMembre, searchTerm]);

  const loadData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      // Charger membres et matériel en parallèle
      const [membersData, itemsData] = await Promise.all([
        getMembres(clubId),
        InventoryItemService.getItems(clubId)
      ]);

      setMembers(membersData);
      setItems(itemsData);

      // Charger prêts avec filtres
      const filters: any = {};
      if (filterStatut) filters.statut = filterStatut;
      if (filterMembre) filters.memberId = filterMembre;
      if (searchTerm) filters.search = searchTerm;

      const loansData = await LoanService.getLoans(clubId, filters);
      setLoans(loansData);

      // Calculer stats
      const statsData = await LoanService.getStats(clubId);
      setStats(statsData);
    } catch (error: any) {
      console.error('Erreur chargement prêts:', error);
      toast.error(error.message || 'Erreur lors du chargement');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setShowCreationWizard(true);
  };

  const handleRowClick = (loan: Loan) => {
    setDetailViewLoan(loan);
  };

  const handleCloseDetail = () => {
    setDetailViewLoan(null);
  };

  const handleSaveDetail = () => {
    loadData();
    handleCloseDetail();
  };

  const handleCloseCreation = () => {
    setShowCreationWizard(false);
  };

  const handleCreationComplete = () => {
    loadData();
    setShowCreationWizard(false);
  };

  const getMemberName = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    return member ? `${member.nom} ${member.prenom}` : 'Membre inconnu';
  };

  const getItemNames = (itemIds: string[]) => {
    return itemIds.map(id => {
      const item = items.find(i => i.id === id);
      return item?.numero_serie || id;
    }).join(', ');
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
      <span className={cn('px-2 py-1 text-xs font-medium rounded-full', badges[statut as keyof typeof badges])}>
        {labels[statut as keyof typeof labels]}
      </span>
    );
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    return new Date(timestamp.toDate()).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Prêts de Matériel</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
            Suivi des prêts de matériel aux membres
          </p>
        </div>

        <button
          onClick={handleCreateNew}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nouveau prêt
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-dark-text-secondary">Total</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.total}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Actifs</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{stats.actifs}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700 dark:text-red-300">En retard</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{stats.en_retard}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 dark:text-green-300">Rendus</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{stats.rendus}</p>
            </div>
            <ClipboardList className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-700 dark:text-purple-300">Cautions</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {stats.caution_totale_en_cours.toFixed(0)} €
              </p>
            </div>
            <Calendar className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Alert - En retard */}
      {stats.en_retard > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-900 dark:text-red-200">
                Prêts en retard
              </h3>
              <p className="mt-1 text-sm text-red-800 dark:text-red-300">
                {stats.en_retard} prêt(s) n'ont pas été rendus à la date prévue. Contactez les membres concernés.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">Filtres</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher dans notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            />
          </div>

          {/* Statut */}
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les statuts</option>
            <option value="actif">Actif</option>
            <option value="en_retard">En retard</option>
            <option value="rendu">Rendu</option>
          </select>

          {/* Membre */}
          <select
            value={filterMembre}
            onChange={(e) => setFilterMembre(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
          >
            <option value="">Tous les membres</option>
            {members.filter(m => m.statut === 'actif').map(member => (
              <option key={member.id} value={member.id}>
                {member.nom} {member.prenom}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
          <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Membre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Matériel
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Date prêt
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Retour prévu
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Caution
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {loans.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Aucun prêt trouvé
                </td>
              </tr>
            ) : (
              loans.map((loan) => (
                <tr
                  key={loan.id}
                  className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                    {getMemberName(loan.memberId)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-dark-text-secondary">
                    <div className="max-w-xs truncate" title={getItemNames(loan.itemIds)}>
                      {getItemNames(loan.itemIds)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {formatDate(loan.date_pret)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-dark-text-secondary">
                    {formatDate(loan.date_retour_prevue)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-dark-text-primary">
                    {loan.montant_caution.toFixed(2)} €
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatutBadge(loan.statut)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleRowClick(loan)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      title="Consulter"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {detailViewLoan && (
        <PretDetailView
          loan={detailViewLoan}
          onClose={handleCloseDetail}
          onSave={handleSaveDetail}
        />
      )}

      {/* Creation Wizard */}
      {showCreationWizard && (
        <PretCreationWizard
          onClose={handleCloseCreation}
          onComplete={handleCreationComplete}
        />
      )}
    </div>
  );
}
