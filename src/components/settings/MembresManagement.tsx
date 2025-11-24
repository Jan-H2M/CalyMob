import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Membre, UserRole, MemberStatus } from '@/types';
import {
  MembreFilters,
  getMembres,
  grantAppAccess,
  revokeAppAccess,
  changeAppRole
} from '@/services/membreService';
import { PermissionService } from '@/services/permissionService';
import { Plus, Users, Shield, Activity, RefreshCw, UserCheck, UserX } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Gestion unifiée des membres (utilisateurs + membres club)
 *
 * Fonctionnalités:
 * - Liste tous les membres (avec/sans accès app)
 * - Filtre par statut membre, statut app, rôle
 * - Octroi/retrait accès application
 * - Changement de rôle app
 * - CRUD membres club (à venir)
 */
export function MembresManagement() {
  const { appUser, hasPermission } = useAuth();
  const [membres, setMembres] = useState<Membre[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState<MemberStatus | 'all'>('all');
  const [hasAppAccessFilter, setHasAppAccessFilter] = useState<'all' | 'yes' | 'no'>('all');

  useEffect(() => {
    loadMembres();
  }, []);

  const loadMembres = async () => {
    if (!appUser) return;

    setLoading(true);
    try {
      const filters: MembreFilters = {};

      if (roleFilter !== 'all') filters.app_role = roleFilter;
      if (memberStatusFilter !== 'all') filters.member_status = memberStatusFilter;
      if (hasAppAccessFilter === 'yes') filters.has_app_access = true;
      if (hasAppAccessFilter === 'no') filters.has_app_access = false;
      if (searchTerm) filters.search = searchTerm;

      const loadedMembres = await getMembres(appUser.clubId, filters);
      setMembres(loadedMembres);
    } catch (error) {
      console.error('Error loading membres:', error);
      toast.error('Erreur lors du chargement des membres');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadMembres();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, roleFilter, memberStatusFilter, hasAppAccessFilter]);

  const handleGrantAppAccess = async (membreId: string) => {
    if (!hasPermission('users.create') || !appUser) {
      toast.error('Vous n\'avez pas la permission d\'octroyer des accès');
      return;
    }

    try {
      await grantAppAccess(appUser.clubId, membreId, 'user', appUser.id);
      toast.success('Accès application octroyé');
      await loadMembres();
    } catch (error) {
      console.error('Error granting app access:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors de l\'octroi d\'accès');
    }
  };

  const handleRevokeAppAccess = async (membreId: string) => {
    if (!hasPermission('users.delete') || !appUser) {
      toast.error('Vous n\'avez pas la permission de retirer des accès');
      return;
    }

    if (confirm('Êtes-vous sûr de vouloir retirer l\'accès application à ce membre ?')) {
      try {
        await revokeAppAccess(appUser.clubId, membreId, appUser.id);
        toast.success('Accès application retiré');
        await loadMembres();
      } catch (error) {
        console.error('Error revoking app access:', error);
        toast.error(error instanceof Error ? error.message : 'Erreur lors du retrait d\'accès');
      }
    }
  };

  const handleChangeRole = async (membreId: string, newRole: UserRole) => {
    if (!hasPermission('users.assignRole') || !appUser) {
      toast.error('Vous n\'avez pas la permission de changer les rôles');
      return;
    }

    try {
      await changeAppRole(appUser.clubId, membreId, newRole, appUser.id);
      toast.success('Rôle modifié avec succès');
      await loadMembres();
    } catch (error) {
      console.error('Error changing role:', error);
      toast.error(error instanceof Error ? error.message : 'Erreur lors du changement de rôle');
    }
  };

  const filteredMembres = membres.filter(membre => {
    const matchesSearch = searchTerm === '' ||
      `${membre.prenom} ${membre.nom}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      membre.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (membre.lifras_id && membre.lifras_id.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesSearch;
  });

  const stats = {
    total: membres.length,
    withAppAccess: membres.filter(m => m.has_app_access).length,
    withoutAppAccess: membres.filter(m => !m.has_app_access).length,
    activeDivers: membres.filter(m => m.is_diver && m.member_status === 'active').length,
    byRole: {
      superadmin: membres.filter(m => m.app_role === 'superadmin').length,
      admin: membres.filter(m => m.app_role === 'admin').length,
      validateur: membres.filter(m => m.app_role === 'validateur').length,
      user: membres.filter(m => m.app_role === 'user').length
    }
  };

  if (!hasPermission('users.view')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-dark-text-muted" />
          <p className="text-gray-500 dark:text-dark-text-muted">Vous n'avez pas accès à cette section</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">Gestion des Membres</h1>
            <p className="text-gray-600 dark:text-dark-text-secondary mt-1">
              Membres du club et utilisateurs de l'application
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadMembres}
              className="p-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg"
              title="Actualiser"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {hasPermission('users.create') && (
              <button
                onClick={() => toast('Fonctionnalité à venir', { icon: '⏳' })}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-5 h-5" />
                Nouveau Membre
              </button>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-dark-text-secondary">Total Membres</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-gray-400 dark:text-dark-text-muted" />
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-600">Avec Accès App</p>
                <p className="text-2xl font-bold text-green-900">{stats.withAppAccess}</p>
              </div>
              <UserCheck className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-600">Plongeurs Actifs</p>
                <p className="text-2xl font-bold text-blue-900">{stats.activeDivers}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-600">Admins</p>
                <p className="text-2xl font-bold text-purple-900">
                  {stats.byRole.superadmin + stats.byRole.admin}
                </p>
              </div>
              <Shield className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Rechercher par nom, email, LIFRAS..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-dark-bg-primary dark:text-dark-text-primary"
            />
          </div>

          <select
            value={hasAppAccessFilter}
            onChange={(e) => setHasAppAccessFilter(e.target.value as 'all' | 'yes' | 'no')}
            className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-primary dark:text-dark-text-primary"
          >
            <option value="all">Tous les membres</option>
            <option value="yes">Avec accès app</option>
            <option value="no">Sans accès app</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg-primary dark:text-dark-text-primary"
          >
            <option value="all">Tous les rôles</option>
            <option value="superadmin">Super Admin</option>
            <option value="admin">Administrateur</option>
            <option value="validateur">Validateur</option>
            <option value="user">Utilisateur</option>
          </select>
        </div>

        {/* Members Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
                    LIFRAS
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Accès App
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Rôle App
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-dark-bg-secondary divide-y divide-gray-200 dark:divide-dark-border">
                {filteredMembres.map((membre) => (
                  <tr key={membre.id} className="hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                            {membre.prenom} {membre.nom}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-dark-text-secondary">
                            {membre.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                        {membre.telephone || membre.phoneNumber || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-dark-text-primary">
                        {membre.lifras_id || '-'}
                      </div>
                      {membre.niveau_plongee && (
                        <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          {membre.niveau_plongee}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {membre.has_app_access ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          Oui
                        </span>
                      ) : (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                          Non
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {membre.has_app_access && membre.app_role ? (
                        <select
                          value={membre.app_role}
                          onChange={(e) => handleChangeRole(membre.id, e.target.value as UserRole)}
                          disabled={!hasPermission('users.assignRole')}
                          className="text-sm border border-gray-300 dark:border-dark-border rounded px-2 py-1 dark:bg-dark-bg-primary dark:text-dark-text-primary"
                        >
                          <option value="membre">Membre</option>
                          <option value="user">Utilisateur</option>
                          <option value="validateur">Validateur</option>
                          <option value="admin">Administrateur</option>
                          <option value="superadmin">Super Admin</option>
                        </select>
                      ) : (
                        <span className="text-sm text-gray-400 dark:text-dark-text-muted">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        membre.member_status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : membre.member_status === 'inactive'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {membre.member_status === 'active' ? 'Actif' : membre.member_status === 'inactive' ? 'Inactif' : 'Archivé'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {membre.has_app_access ? (
                        <button
                          onClick={() => handleRevokeAppAccess(membre.id)}
                          disabled={!hasPermission('users.delete')}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Retirer l'accès application"
                        >
                          <UserX className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGrantAppAccess(membre.id)}
                          disabled={!hasPermission('users.create')}
                          className="text-green-600 hover:text-green-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Octroyer l'accès application"
                        >
                          <UserCheck className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredMembres.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-dark-text-secondary">
                Aucun membre trouvé
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
