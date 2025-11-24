import React, { useState, useEffect } from 'react';
import { Plus, Upload, Search, Filter, User, Mail, Phone, Award, Calendar, Eye } from 'lucide-react';
import { getMembres } from '@/services/membreService';
import { Membre } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { MembreImportModal } from './MembreImportModal';
import { MembreDetailView } from './MembreDetailView';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { formatDate } from '@/utils/utils';

export function MembresPage() {
  const { clubId } = useAuth();
  const [members, setMembers] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatut, setFilterStatut] = useState<'active' | 'inactive' | ''>('');
  const [filterNiveau, setFilterNiveau] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [detailViewMember, setDetailViewMember] = useState<Membre | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Helper to check if member is beginner (<1 year)
  const isDebutant = (membre: Membre): boolean => {
    if (!membre.date_adhesion) return false;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return membre.date_adhesion > oneYearAgo;
  };

  useEffect(() => {
    loadMembers();
  }, [clubId, filterStatut, filterNiveau, searchTerm]);

  const loadMembers = async () => {
    if (!clubId) return;

    try {
      setLoading(true);
      const filters: any = {};
      if (filterStatut) filters.member_status = filterStatut;
      if (filterNiveau) filters.niveau_plongee = filterNiveau;
      if (searchTerm) filters.search = searchTerm;

      const membersData = await getMembres(clubId, filters);
      setMembers(membersData);
    } catch (error) {
      console.error('Erreur chargement membres:', error);
      toast.error('Erreur lors du chargement des membres');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setDetailViewMember({
      id: '',
      nom: '',
      prenom: '',
      email: '',
      member_status: 'active',
      has_app_access: false,
      is_diver: true,
      has_lifras: false,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Membre);
  };

  const handleSave = async () => {
    await loadMembers();
    setDetailViewMember(null);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setDetailViewMember(null);
    setIsCreating(false);
  };

  const handleImportComplete = async () => {
    setShowImportModal(false);
    await loadMembers();
  };

  const niveaux = Array.from(new Set(members.map(m => m.niveau_plongee).filter(Boolean)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            Membres Inventaire
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
            Gestion des membres ayant accès au matériel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-dark-border rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-dark-text-secondary bg-white dark:bg-dark-bg-secondary hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
          >
            <Upload className="h-4 w-4 mr-2" />
            Importer XLS
          </button>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouveau membre
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Rechercher par nom, prénom ou email..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
              />
            </div>
          </div>

          {/* Statut Filter */}
          <div>
            <select
              value={filterStatut}
              onChange={(e) => setFilterStatut(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            >
              <option value="">Tous les statuts</option>
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
            </select>
          </div>

          {/* Niveau Filter */}
          <div>
            <select
              value={filterNiveau}
              onChange={(e) => setFilterNiveau(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-primary text-gray-900 dark:text-dark-text-primary"
            >
              <option value="">Tous les niveaux</option>
              {niveaux.map(niveau => (
                <option key={niveau} value={niveau}>{niveau}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mb-1">
            Total membres
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
            {members.length}
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mb-1">
            Actifs
          </div>
          <div className="text-2xl font-bold text-green-600">
            {members.filter(m => m.member_status === 'active').length}
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mb-1">
            Inactifs
          </div>
          <div className="text-2xl font-bold text-gray-600">
            {members.filter(m => m.member_status === 'inactive').length}
          </div>
        </div>
        <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border p-4">
          <div className="text-sm font-medium text-gray-500 dark:text-dark-text-secondary mb-1">
            Débutants (&lt;1 an)
          </div>
          <div className="text-2xl font-bold text-blue-600">
            {members.filter(m => isDebutant(m)).length}
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-12">
            <User className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-dark-text-primary">Aucun membre</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-dark-text-secondary">
              Commencez par créer un membre ou importer depuis un fichier Excel
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-border">
              <thead className="bg-gray-50 dark:bg-dark-bg-tertiary">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Membre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Niveau / Licence
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Ancienneté
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
                {members.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {member.nom} {member.prenom}
                            {isDebutant(member) && (
                              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200">
                                Débutant
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="h-3 w-3 text-gray-400" />
                          {member.email}
                        </div>
                        {member.telephone && (
                          <div className="flex items-center gap-2 text-gray-500 dark:text-dark-text-secondary">
                            <Phone className="h-3 w-3" />
                            {member.telephone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {member.niveau_plongee && (
                          <div className="flex items-center gap-2 mb-1">
                            <Award className="h-3 w-3 text-gray-400" />
                            <span className="text-gray-900 dark:text-dark-text-primary">{member.niveau_plongee}</span>
                          </div>
                        )}
                        {member.lifras_id && (
                          <div className="text-gray-500 dark:text-dark-text-secondary text-xs">
                            LIFRAS: {member.lifras_id}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                        {member.date_adhesion && (
                          <>
                            <div>
                              {(() => {
                                const years = (Date.now() - member.date_adhesion.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                                return years.toFixed(1) + ' an' + (years >= 2 ? 's' : '');
                              })()}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
                              Depuis {formatDate(member.date_adhesion)}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={cn(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                        member.member_status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200'
                          : 'bg-gray-100 dark:bg-gray-900/30 text-gray-800 dark:text-gray-200'
                      )}>
                        {member.member_status === 'active' ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setDetailViewMember(member)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        title="Consulter"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showImportModal && (
        <MembreImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {detailViewMember && (
        <MembreDetailView
          member={detailViewMember}
          isCreateMode={isCreating}
          onClose={handleCancel}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
