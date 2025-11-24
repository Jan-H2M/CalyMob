import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole, AuditLog, UpdateUserDTO, ActivateUserDTO, UpdateUserRoleDTO } from '@/types/user.types';
import { UserService } from '@/services/userService';
import { UserList } from './UserList';
import { UserDetailView } from './UserDetailView';
import { AuditLogList } from './AuditLogList';
import { MembreImportModal } from '../membres/MembreImportModal';
import { Users, Shield, Activity, RefreshCw, UserPlus, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

export function UserManagement() {
  const { appUser, hasPermission, refreshUserData } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'deleted'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [caFirst, setCaFirst] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (appUser) {
      loadData();
    }
  }, [appUser]);

  const loadData = async () => {
    if (!appUser) return;

    setLoading(true);
    try {
      const [loadedUsers, logs] = await Promise.all([
        UserService.getUsers(appUser.clubId),
        hasPermission('audit.view') ? UserService.getAuditLogs(appUser.clubId) : Promise.resolve([])
      ]);

      setUsers(loadedUsers);
      setAuditLogs(logs);
    } catch (error) {
      console.error('Error loading data:', error);
      // Don't clear the existing users list on error, just show the error
      alert('Erreur lors du chargement des données. La liste affiche les données en cache.');
    } finally {
      setLoading(false);
    }
  };


  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    if (!hasPermission('users.update') || !appUser) {
      alert('Vous n\'avez pas la permission de modifier des utilisateurs');
      return;
    }

    const updateDTO: UpdateUserDTO = {
      displayName: updates.displayName,
      firstName: updates.firstName,
      lastName: updates.lastName,
      phoneNumber: updates.phoneNumber,
      photoURL: updates.photoURL,
      isCA: updates.isCA,
      isEncadrant: updates.isEncadrant,
      preferences: updates.preferences
    };

    try {
      await UserService.updateUser(appUser.clubId, userId, updateDTO, appUser.id);
      // Success toast is shown by UserDetailView auto-save
      await loadData();
    } catch (error) {
      console.error('Error updating user:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la mise à jour de l\'utilisateur');
    }
  };

  const handleActivateUser = async (userId: string, activate: boolean) => {
    if (!hasPermission('users.activate') || !appUser) {
      alert('Vous n\'avez pas la permission d\'activer/désactiver des utilisateurs');
      return;
    }

    const activateDTO: ActivateUserDTO = {
      userId: userId,
      activate: activate,
      sendNotification: false
    };

    try {
      await UserService.activateUser(appUser.clubId, activateDTO, appUser.id);
      await loadData();
    } catch (error) {
      console.error('Error activating/deactivating user:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors de la modification du statut');
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    if (!hasPermission('users.assignRole') || !appUser) {
      alert('Vous n\'avez pas la permission de changer les rôles');
      return;
    }

    const roleDTO: UpdateUserRoleDTO = {
      userId: userId,
      newRole: newRole
    };

    try {
      await UserService.changeUserRole(appUser.clubId, roleDTO, appUser.id);
      await loadData();
    } catch (error) {
      console.error('Error changing user role:', error);
      alert(error instanceof Error ? error.message : 'Erreur lors du changement de rôle');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!hasPermission('users.delete') || !appUser) {
      alert('Vous n\'avez pas la permission de supprimer des utilisateurs');
      return;
    }

    let confirmMessage = 'Êtes-vous sûr de vouloir supprimer cet utilisateur ?';
    confirmMessage += '\n\nNote: L\'utilisateur sera marqué comme supprimé mais ses données seront conservées.';

    if (confirm(confirmMessage)) {
      try {
        await UserService.deleteUser(appUser.clubId, userId, appUser.id);
        await loadData();
        setSelectedUser(null);
      } catch (error) {
        console.error('Error deleting user:', error);
        alert(error instanceof Error ? error.message : 'Erreur lors de la suppression de l\'utilisateur');
      }
    }
  };

  const handleCreate = () => {
    setIsCreating(true);
    setSelectedUser(null); // Open detail view in create mode
  };

  const handleCreateUser = async (userData: Partial<User>) => {
    if (!appUser) return;

    // Validation
    if (!userData.email || !userData.email.includes('@')) {
      toast.error('Email invalide');
      return;
    }
    if (!userData.displayName) {
      toast.error('Nom d\'affichage obligatoire');
      return;
    }

    console.log('🔐 [UserManagement] Creating member (Firestore only):', {
      email: userData.email,
      clubId: appUser.clubId,
      createdBy: appUser.id,
      currentUserRole: appUser.role
    });

    try {
      // Create ONLY Firestore document (no Firebase Auth)
      // User will need to be activated later via script or activation flow
      await UserService.createUser(appUser.clubId, '', {
        email: userData.email,
        displayName: userData.displayName,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role || 'user',
        clubId: appUser.clubId
      }, appUser.id);

      toast.success('✓ Membre créé (activation requise pour connexion)', { duration: 4000 });
      await loadData();
      setSelectedUser(null);
      setIsCreating(false);
    } catch (error: any) {
      console.error('Error creating member:', error);
      toast.error(error.message || 'Erreur lors de la création du membre');
    }
  };

  const handleCancel = () => {
    setSelectedUser(null);
    setIsCreating(false);
  };

  const handleSort = (column: 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt') => {
    if (sortBy === column) {
      // Toggle order if clicking same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    let matchesStatus = false;
    if (statusFilter === 'all') {
      matchesStatus = user.status !== 'deleted'; // Don't show deleted by default
    } else if (statusFilter === 'active') {
      matchesStatus = user.isActive && user.status !== 'deleted';
    } else if (statusFilter === 'inactive') {
      matchesStatus = !user.isActive && user.status !== 'deleted';
    } else if (statusFilter === 'deleted') {
      matchesStatus = user.status === 'deleted';
    }

    return matchesSearch && matchesRole && matchesStatus;
  }).sort((a, b) => {
    // CA members first (if enabled)
    if (caFirst) {
      if (a.isCA && !b.isCA) return -1;
      if (!a.isCA && b.isCA) return 1;
    }

    // Then sort by selected column
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.displayName.localeCompare(b.displayName);
        break;
      case 'lastName':
        const aLastName = a.lastName || a.nom || '';
        const bLastName = b.lastName || b.nom || '';
        comparison = aLastName.localeCompare(bLastName);
        break;
      case 'role':
        const roleOrder = { 'membre': 4, 'superadmin': 0, 'admin': 1, 'validateur': 2, 'user': 3 };
        comparison = roleOrder[a.role] - roleOrder[b.role];
        break;
      case 'status':
        const statusOrder = { 'active': 0, 'pending': 1, 'inactive': 2, 'suspended': 3, 'deleted': 4 };
        comparison = statusOrder[a.status] - statusOrder[b.status];
        break;
      case 'lastLogin':
        const aLogin = a.lastLogin ? new Date(a.lastLogin).getTime() : 0;
        const bLogin = b.lastLogin ? new Date(b.lastLogin).getTime() : 0;
        comparison = aLogin - bLogin;
        break;
      case 'createdAt':
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        comparison = aCreated - bCreated;
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
    byRole: {
      superadmin: users.filter(u => u.role === 'superadmin').length,
      admin: users.filter(u => u.role === 'admin').length,
      validateur: users.filter(u => u.role === 'validateur').length,
      user: users.filter(u => u.role === 'user').length
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
    <div className="space-y-4">
      <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">Gestion des Utilisateurs</h1>
            {/* Compact stats inline */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{stats.total}</span>
              </div>
              <div className="flex items-center gap-1.5 text-green-600">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="font-medium">{stats.active}</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-600">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                <span className="font-medium">{stats.inactive}</span>
              </div>
              <div className="flex items-center gap-1.5 text-purple-600">
                <Shield className="w-4 h-4" />
                <span className="font-medium">{stats.byRole.superadmin + stats.byRole.admin}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadData}
              className="p-2 text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:bg-dark-bg-tertiary rounded-lg"
              title="Actualiser"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {hasPermission('users.create') && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  title="Importer membres depuis Excel"
                >
                  <Upload className="w-4 h-4" />
                  Importer Excel
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  title="Créer un nouvel utilisateur"
                >
                  <UserPlus className="w-4 h-4" />
                  Créer
                </button>
              </>
            )}
          </div>
        </div>

        <div className="border-b border-gray-200 dark:border-dark-border mb-3">
          <nav className="-mb-px flex space-x-6">
            <button
              onClick={() => setActiveTab('users')}
              className={`py-1.5 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'users'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Utilisateurs ({filteredUsers.length})
              </div>
            </button>

            {hasPermission('audit.view') && (
              <button
                onClick={() => {
                  setActiveTab('audit');
                  loadData();
                }}
                className={`py-1.5 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'audit'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" />
                  Journal d'Audit
                </div>
              </button>
            )}
          </nav>
        </div>

        {activeTab === 'users' && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tous les rôles</option>
                <option value="superadmin">Super Admin</option>
                <option value="admin">Administrateur</option>
                <option value="validateur">Validateur</option>
                <option value="user">Utilisateur</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive' | 'deleted')}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Actifs et inactifs</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
                {hasPermission('users.delete') && (
                  <option value="deleted">Supprimés</option>
                )}
              </select>

              {/* CA First toggle - compact */}
              <button
                onClick={() => setCaFirst(!caFirst)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition ${
                  caFirst
                    ? 'bg-purple-50 border-purple-300 text-purple-700'
                    : 'bg-gray-50 border-gray-300 text-gray-600'
                }`}
                title="Membres CA en premier"
              >
                <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center ${
                  caFirst ? 'border-purple-600 bg-purple-600' : 'border-gray-400'
                }`}>
                  {caFirst && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="font-medium">CA</span>
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <UserList
                users={filteredUsers}
                onSelectUser={setSelectedUser}
                currentUser={appUser}
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
            )}
          </>
        )}

        {activeTab === 'audit' && hasPermission('audit.view') && (
          <AuditLogList logs={auditLogs} users={users} />
        )}
      </div>

      {(selectedUser || isCreating) && (
        <UserDetailView
          user={selectedUser}
          onClose={handleCancel}
          onUpdate={handleUpdateUser}
          onCreate={handleCreateUser}
          onActivate={handleActivateUser}
          onChangeRole={handleChangeRole}
          onDelete={handleDeleteUser}
          currentUser={appUser}
        />
      )}

      {showImportModal && (
        <MembreImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          clubId={appUser.clubId}
          onImportComplete={(count) => {
            toast.success(`${count} nouveaux membres importés`);
            loadData(); // Refresh member list
          }}
        />
      )}

    </div>
  );
}