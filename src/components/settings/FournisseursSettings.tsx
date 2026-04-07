import { logger } from '@/utils/logger';
/**
 * FournisseursSettings - Beheer van leveranciers (fournisseurs)
 *
 * Leveranciers zijn externe partijen (niet-leden) die terugbetaald kunnen worden
 * via het dépenses systeem. Hun IBAN wordt gebruikt voor EPC QR-code generatie.
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Fournisseur } from '@/types';
import {
  getFournisseurs,
  createFournisseur,
  updateFournisseur,
  deleteFournisseur,
  FournisseurFilters,
  CreateFournisseurDTO,
  UpdateFournisseurDTO,
} from '@/services/fournisseurService';
import { SettingsHeader } from './SettingsHeader';
import { FournisseurDetailPanel } from './FournisseurDetailPanel';
import { SupplierExtractor } from './SupplierExtractor';
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Mail,
  Phone,
  CreditCard,
  Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';

export function FournisseursSettings() {
  const { appUser, hasPermission } = useAuth();
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [selectedFournisseur, setSelectedFournisseur] = useState<Fournisseur | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showExtractor, setShowExtractor] = useState(false);

  useEffect(() => {
    if (appUser) {
      loadFournisseurs();
    }
  }, [appUser, showInactive]);

  const loadFournisseurs = async () => {
    if (!appUser) return;

    setLoading(true);
    try {
      const filters: FournisseurFilters = showInactive ? {} : { actif: true };
      const data = await getFournisseurs(appUser.clubId, filters);
      setFournisseurs(data);
    } catch (error) {
      logger.error('Error loading fournisseurs:', error);
      toast.error('Erreur lors du chargement des fournisseurs');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setSelectedFournisseur(null);
  };

  const handleCreateFournisseur = async (data: CreateFournisseurDTO) => {
    if (!appUser) return;

    try {
      await createFournisseur(appUser.clubId, data, appUser.id);
      toast.success('Fournisseur créé');
      await loadFournisseurs();
      setIsCreating(false);
    } catch (error) {
      logger.error('Error creating fournisseur:', error);
      toast.error(error.message || 'Erreur lors de la création');
    }
  };

  const handleUpdateFournisseur = async (id: string, data: UpdateFournisseurDTO) => {
    if (!appUser) return;

    try {
      await updateFournisseur(appUser.clubId, id, data);
      toast.success('Fournisseur mis à jour');
      await loadFournisseurs();
      // Update selected if it's the same
      if (selectedFournisseur?.id === id) {
        const updated = fournisseurs.find(f => f.id === id);
        if (updated) setSelectedFournisseur({ ...updated, ...data } as Fournisseur);
      }
    } catch (error) {
      logger.error('Error updating fournisseur:', error);
      toast.error(error.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteFournisseur = async (id: string) => {
    if (!appUser) return;

    if (!confirm('Supprimer ce fournisseur ? Cette action est irréversible.')) {
      return;
    }

    try {
      await deleteFournisseur(appUser.clubId, id);
      toast.success('Fournisseur supprimé');
      await loadFournisseurs();
      setSelectedFournisseur(null);
    } catch (error) {
      logger.error('Error deleting fournisseur:', error);
      toast.error(error.message || 'Erreur lors de la suppression');
    }
  };

  const handleClose = () => {
    setSelectedFournisseur(null);
    setIsCreating(false);
  };

  // Filter fournisseurs by search term
  const filteredFournisseurs = fournisseurs.filter(f => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      f.nom.toLowerCase().includes(search) ||
      (f.email && f.email.toLowerCase().includes(search)) ||
      (f.numero_tva && f.numero_tva.toLowerCase().includes(search)) ||
      (f.iban && f.iban.toLowerCase().includes(search))
    );
  });

  // Stats
  const stats = {
    total: fournisseurs.length,
    active: fournisseurs.filter(f => f.actif).length,
    inactive: fournisseurs.filter(f => !f.actif).length,
  };

  if (!hasPermission('users.view')) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
        <div className="max-w-7xl mx-auto">
          <SettingsHeader
            breadcrumb={['Paramètres', 'Fournisseurs']}
            title="Fournisseurs"
            description="Gestion des fournisseurs externes"
          />
          <div className="flex items-center justify-center h-64 bg-white dark:bg-dark-bg-secondary rounded-xl">
            <p className="text-gray-500 dark:text-dark-text-muted">
              Vous n'avez pas accès à cette section
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary p-6">
      <div className="max-w-7xl mx-auto">
        <SettingsHeader
          breadcrumb={['Paramètres', 'Fournisseurs']}
          title="Fournisseurs"
          description="Gestion des fournisseurs externes pour les remboursements"
        />

        <div className="bg-white dark:bg-dark-bg-secondary rounded-xl shadow-sm border border-gray-200 dark:border-dark-border">
          {/* Header with stats and actions */}
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-dark-text-primary">
                  Liste des Fournisseurs
                </h2>
                {/* Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                    <span className="font-medium">{stats.total}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-green-600">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span className="font-medium">{stats.active}</span>
                  </div>
                  {stats.inactive > 0 && (
                    <div className="flex items-center gap-1.5 text-gray-400 dark:text-dark-text-muted">
                      <div className="w-2 h-2 bg-gray-400 rounded-full" />
                      <span className="font-medium">{stats.inactive}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadFournisseurs}
                  className="p-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg"
                  title="Actualiser"
                >
                  <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                </button>
                {hasPermission('users.create') && (
                  <>
                    <button
                      onClick={() => setShowExtractor(true)}
                      className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary text-sm"
                      title="Extraire les fournisseurs depuis les transactions"
                    >
                      <Download className="w-4 h-4" />
                      Extraire
                    </button>
                    <button
                      onClick={handleCreate}
                      className="flex items-center gap-2 px-3 py-1.5 bg-calypso-blue text-white rounded-lg hover:bg-calypso-blue/90 text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Nouveau
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, email, IBAN ou TVA..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-calypso-blue focus:border-transparent dark:bg-dark-bg-tertiary dark:text-dark-text-primary"
                />
              </div>
              <button
                onClick={() => setShowInactive(!showInactive)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition',
                  showInactive
                    ? 'bg-gray-100 dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-primary dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text-primary'
                    : 'bg-white border-gray-300 dark:border-dark-border text-gray-500 dark:text-dark-text-muted dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text-secondary'
                )}
              >
                {showInactive ? (
                  <ToggleRight className="w-4 h-4" />
                ) : (
                  <ToggleLeft className="w-4 h-4" />
                )}
                Inactifs
              </button>
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-calypso-blue" />
              </div>
            ) : filteredFournisseurs.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-dark-text-muted" />
                <p className="text-gray-500 dark:text-dark-text-muted">
                  {searchTerm ? 'Aucun fournisseur trouvé' : 'Aucun fournisseur'}
                </p>
                {!searchTerm && hasPermission('users.create') && (
                  <button
                    onClick={handleCreate}
                    className="mt-4 text-calypso-blue hover:underline text-sm"
                  >
                    Créer le premier fournisseur
                  </button>
                )}
              </div>
            ) : (
              filteredFournisseurs.map((fournisseur) => (
                <div
                  key={fournisseur.id}
                  onClick={() => setSelectedFournisseur(fournisseur)}
                  className={cn(
                    'p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary transition',
                    selectedFournisseur?.id === fournisseur.id && 'bg-blue-50 dark:bg-dark-bg-tertiary',
                    !fournisseur.actif && 'opacity-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-calypso-blue/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-calypso-blue" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-dark-text-primary">
                            {fournisseur.nom}
                          </span>
                          {!fournisseur.actif && (
                            <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-dark-bg-tertiary text-gray-600 dark:text-dark-text-secondary rounded">
                              Inactif
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-dark-text-muted dark:text-dark-text-secondary">
                          {fournisseur.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3.5 h-3.5" />
                              {fournisseur.email}
                            </span>
                          )}
                          {fournisseur.telephone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5" />
                              {fournisseur.telephone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-dark-text-secondary font-mono">
                        <CreditCard className="w-3.5 h-3.5" />
                        {formatIBAN(fournisseur.iban)}
                      </div>
                      {fournisseur.numero_tva && (
                        <div className="text-xs text-gray-400 dark:text-dark-text-muted mt-1">
                          TVA: {fournisseur.numero_tva}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      {(selectedFournisseur || isCreating) && (
        <FournisseurDetailPanel
          fournisseur={selectedFournisseur}
          onClose={handleClose}
          onCreate={handleCreateFournisseur}
          onUpdate={handleUpdateFournisseur}
          onDelete={handleDeleteFournisseur}
        />
      )}

      {/* Supplier Extractor Modal */}
      {showExtractor && (
        <SupplierExtractor
          onClose={() => setShowExtractor(false)}
          onSuppliersCreated={loadFournisseurs}
        />
      )}
    </div>
  );
}

/**
 * Format IBAN for display (groups of 4)
 */
function formatIBAN(iban: string): string {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}
