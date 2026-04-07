import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { User, UserRole, AuditLog, UpdateUserDTO, ActivateUserDTO, UpdateUserRoleDTO } from '@/types/user.types';
import { UserService } from '@/services/userService';
import { UserList } from './UserList';
import { UserDetailView } from './UserDetailView';
import { AuditLogList } from './AuditLogList';
import { MembreImportModal } from '../membres/MembreImportModal';
import { getLastImportMetadata } from '@/services/membreService';
import { Users, Shield, Activity, RefreshCw, UserPlus, Upload, Heart, Clock, FileText } from 'lucide-react';
import { generatePresencePdf } from '@/utils/generatePresencePdf';
import toast from 'react-hot-toast';
import { getRole, getLastName, isActive, getStatus } from '@/utils/fieldMapper';
import { logger } from '@/utils/logger';
import { getValueList, sortValueListItems } from '@/services/valueListService';
import type { ValueListItem } from '@/types/valueList.types';
import { MembershipSeasonService } from '@/services/membershipSeasonService';
import type { MembershipTariff } from '@/types/cotisations.types';
import { collection, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  const [sortBy, setSortBy] = useState<'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt' | 'certifValidite'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [caFirst, setCaFirst] = useState(true);
  const [fonctionFilter, setFonctionFilter] = useState<string>('all');
  const [fonctionOptions, setFonctionOptions] = useState<ValueListItem[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [medicalFilter, setMedicalFilter] = useState<'all' | 'pending' | 'expired' | 'valid'>('all');
  const [cotisationFilter, setCotisationFilter] = useState<'all' | 'expired' | 'valid'>('all');
  const [lastImportDate, setLastImportDate] = useState<Date | null>(null);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const [tariffs, setTariffs] = useState<MembershipTariff[]>([]);
  const [memberPayments, setMemberPayments] = useState<Record<string, number>>({});
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [paymentMatchFilter, setPaymentMatchFilter] = useState<'all' | 'mismatch' | 'ok' | 'no_payment'>('all');

  useEffect(() => {
    if (appUser) {
      loadData();
    }
  }, [appUser]);

  // Listen for user data updates (e.g., after browser info is saved)
  useEffect(() => {
    const handleUserDataUpdate = () => {
      logger.debug('🔄 User data updated event received, reloading users...');
      loadData();
    };

    window.addEventListener('user-data-updated', handleUserDataUpdate);
    return () => window.removeEventListener('user-data-updated', handleUserDataUpdate);
  }, [appUser]);

  // Load fonction options from ValueList
  useEffect(() => {
    async function loadFonctionOptions() {
      if (!appUser?.clubId) return;
      try {
        const list = await getValueList(appUser.clubId, 'fonction');
        if (list) {
          const sorted = sortValueListItems(list.items);
          setFonctionOptions(sorted);
        }
      } catch (err) {
        logger.error('Error loading fonction options:', err);
      }
    }
    loadFonctionOptions();
  }, [appUser?.clubId]);

  // Load membership category labels and tariffs from active season
  useEffect(() => {
    async function loadCategoryData() {
      if (!appUser?.clubId) return;
      try {
        const season = await MembershipSeasonService.getActiveSeason(appUser.clubId);
        if (season) {
          const labels: Record<string, string> = {};
          for (const tariff of season.tariffs) {
            labels[tariff.code] = tariff.label;
          }
          setCategoryLabels(labels);
          setTariffs(season.tariffs);
        }
      } catch (err) {
        logger.error('Error loading category data:', err);
      }
    }
    loadCategoryData();
  }, [appUser?.clubId]);

  // Load linked transactions to calculate member payments
  useEffect(() => {
    async function loadMemberPayments() {
      if (!appUser?.clubId) return;
      try {
        const txRef = collection(db, 'clubs', appUser.clubId, 'transactions_bancaires');
        const snapshot = await getDocs(txRef);

        const payments: Record<string, number> = {};

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const entities = data.matched_entities;
          if (!entities || !Array.isArray(entities)) return;

          // Include all amounts (positive payments and negative corrections)
          const montant = data.montant;
          if (typeof montant !== 'number' || montant === 0) return;

          // Filter by current season year (transactions from this year)
          const txDate = data.date_execution instanceof Timestamp
            ? data.date_execution.toDate()
            : data.date_execution ? new Date(data.date_execution) : null;
          if (!txDate) return;

          // Use transactions from the current season year onwards
          const currentYear = new Date().getFullYear();
          const seasonStartDate = new Date(currentYear - 1, 8, 1); // Sept 1 of previous year
          if (txDate < seasonStartDate) return;

          for (const entity of entities) {
            if (entity.entity_type === 'member' && entity.entity_id) {
              payments[entity.entity_id] = (payments[entity.entity_id] || 0) + montant;
            }
          }
        });

        setMemberPayments(payments);
        logger.debug(`✅ Loaded payments for ${Object.keys(payments).length} members`);
      } catch (err) {
        logger.error('Error loading member payments:', err);
      }
    }
    loadMemberPayments();
  }, [appUser?.clubId]);

  // Load last import date
  useEffect(() => {
    async function loadImportMeta() {
      if (!appUser?.clubId) return;
      try {
        const meta = await getLastImportMetadata(appUser.clubId);
        setLastImportDate(meta?.lastImportDate || null);
      } catch (err) {
        logger.error('Error loading import metadata:', err);
      }
    }
    loadImportMeta();
  }, [appUser?.clubId]);

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
      logger.error('Error loading data:', error);
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
      clubStatuten: updates.clubStatuten,
      preferences: updates.preferences,
      ...('membership_category_code' in updates ? { membership_category_code: updates.membership_category_code ?? null } : {}),
      ...('membership_period' in updates ? { membership_period: updates.membership_period ?? null } : {}),
      ...('membership_season_id' in updates ? { membership_season_id: updates.membership_season_id ?? null } : {})
    };

    try {
      await UserService.updateUser(appUser.clubId, userId, updateDTO, appUser.id);
      // Success toast is shown by UserDetailView auto-save
      await loadData();
      // Refresh selectedUser with latest data from Firestore
      const refreshedUser = await UserService.getUser(appUser.clubId, userId);
      if (refreshedUser) {
        setSelectedUser(refreshedUser);
      }
    } catch (error) {
      logger.error('Error updating user:', error);
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

      // Reload users and update both users list and selectedUser
      const loadedUsers = await UserService.getUsers(appUser.clubId);
      setUsers(loadedUsers);

      // Update selectedUser with fresh data if it's the same user
      if (selectedUser && selectedUser.id === userId) {
        const updatedUser = loadedUsers.find(u => u.id === userId);
        if (updatedUser) {
          setSelectedUser(updatedUser);
        }
      }

      // Also reload audit logs if user has permission
      if (hasPermission('audit.view')) {
        const logs = await UserService.getAuditLogs(appUser.clubId);
        setAuditLogs(logs);
      }
    } catch (error) {
      logger.error('Error activating/deactivating user:', error);
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
      logger.error('Error changing user role:', error);
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
        logger.error('Error deleting user:', error);
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

    logger.debug('🔐 [UserManagement] Creating member (Firestore only):', {
      email: userData.email,
      clubId: appUser.clubId,
      createdBy: appUser.id,
      currentUserRole: getRole(appUser)
    });

    try {
      // Create ONLY Firestore document (no Firebase Auth)
      // User will need to be activated later via script or activation flow
      await UserService.createUser(appUser.clubId, '', {
        email: userData.email,
        displayName: userData.displayName,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.app_role || 'user',
        app_role: userData.app_role || 'user',
        clubId: appUser.clubId,
        membership_category_code: userData.membership_category_code || null,
        membership_period: userData.membership_period || null,
        membership_season_id: userData.membership_season_id || null
      }, appUser.id);

      toast.success('✓ Membre créé (activation requise pour connexion)', { duration: 4000 });
      await loadData();
      setSelectedUser(null);
      setIsCreating(false);
    } catch (error: any) {
      logger.error('Error creating member:', error);
      toast.error(error.message || 'Erreur lors de la création du membre');
    }
  };

  const handleCancel = () => {
    setSelectedUser(null);
    setIsCreating(false);
  };

  const handleSort = (column: 'name' | 'lastName' | 'role' | 'status' | 'lastLogin' | 'createdAt' | 'certifValidite') => {
    if (sortBy === column) {
      // Toggle order if clicking same column
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  // Helper: get expected cotisation amount for a member
  const getExpectedAmount = (user: User): number | null => {
    if (!user.membership_category_code) return null;
    const tariff = tariffs.find(t => t.code === user.membership_category_code);
    if (!tariff) return null;
    const period = (user as any).membership_period || 'sept_dec';
    const price = period === 'jan_dec' ? tariff.price_jan_dec : tariff.price_sept_dec;
    return price;
  };

  // Compute payment match stats
  const paymentMatchStats = useMemo(() => {
    let mismatch = 0;
    let ok = 0;
    let noPayment = 0;

    for (const user of users) {
      if (getStatus(user) === 'deleted') continue;
      const expected = getExpectedAmount(user);
      if (expected === null || expected === 0) continue; // Skip members without category/price
      const paid = memberPayments[user.id] || 0;
      if (paid === 0) {
        noPayment++;
      } else if (Math.abs(paid - expected) > 0.01) {
        mismatch++;
      } else {
        ok++;
      }
    }
    return { mismatch, ok, noPayment };
  }, [users, tariffs, memberPayments]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || getRole(user) === roleFilter;

    let matchesStatus = false;
    const userStatus = getStatus(user);
    if (statusFilter === 'all') {
      matchesStatus = userStatus !== 'deleted'; // Don't show deleted by default
    } else if (statusFilter === 'active') {
      matchesStatus = isActive(user) && userStatus !== 'deleted';
    } else if (statusFilter === 'inactive') {
      matchesStatus = !isActive(user) && userStatus !== 'deleted';
    } else if (statusFilter === 'deleted') {
      matchesStatus = userStatus === 'deleted';
    }

    const matchesFonction = fonctionFilter === 'all' ||
      (Array.isArray(user.clubStatuten) && user.clubStatuten.includes(fonctionFilter));

    // Medical filter
    let matchesMedical = true;
    if (medicalFilter !== 'all') {
      const certValidity = user.certificat_medical_validite;
      const hasPending = user.has_pending_medical === true;

      if (medicalFilter === 'pending') {
        matchesMedical = hasPending;
      } else if (medicalFilter === 'expired') {
        if (!certValidity) {
          matchesMedical = true; // No cert = expired/missing
        } else {
          const validDate = certValidity instanceof Date
            ? certValidity
            : (certValidity as any).toDate?.() || new Date(certValidity as any);
          matchesMedical = validDate < new Date();
        }
      } else if (medicalFilter === 'valid') {
        if (!certValidity) {
          matchesMedical = false;
        } else {
          const validDate = certValidity instanceof Date
            ? certValidity
            : (certValidity as any).toDate?.() || new Date(certValidity as any);
          matchesMedical = validDate >= new Date();
        }
      }
    }

    // Cotisation filter
    let matchesCotisation = true;
    if (cotisationFilter !== 'all') {
      const cotisationValidity = (user as any).cotisation_validite;

      if (cotisationFilter === 'expired') {
        if (!cotisationValidity) {
          matchesCotisation = true; // No cotisation date = expired/missing
        } else {
          const validDate = cotisationValidity instanceof Date
            ? cotisationValidity
            : (cotisationValidity as any).toDate?.() || new Date(cotisationValidity as any);
          matchesCotisation = validDate < new Date();
        }
      } else if (cotisationFilter === 'valid') {
        if (!cotisationValidity) {
          matchesCotisation = false;
        } else {
          const validDate = cotisationValidity instanceof Date
            ? cotisationValidity
            : (cotisationValidity as any).toDate?.() || new Date(cotisationValidity as any);
          matchesCotisation = validDate >= new Date();
        }
      }
    }

    // Type de membre filter
    const matchesType = typeFilter === 'all' ||
      (typeFilter === 'none' ? !user.membership_category_code : user.membership_category_code === typeFilter);

    // Payment match filter
    let matchesPayment = true;
    if (paymentMatchFilter !== 'all') {
      const expected = getExpectedAmount(user);
      if (expected === null || expected === 0) {
        matchesPayment = false; // Skip members without category/price for all payment filters
      } else {
        const paid = memberPayments[user.id] || 0;
        if (paymentMatchFilter === 'mismatch') {
          matchesPayment = paid > 0 && Math.abs(paid - expected) > 0.01;
        } else if (paymentMatchFilter === 'no_payment') {
          matchesPayment = paid === 0;
        } else if (paymentMatchFilter === 'ok') {
          matchesPayment = Math.abs(paid - expected) <= 0.01;
        }
      }
    }

    return matchesSearch && matchesRole && matchesStatus && matchesFonction && matchesMedical && matchesCotisation && matchesType && matchesPayment;
  }).sort((a, b) => {
    // CA members first (if enabled)
    if (caFirst) {
      const aIsCA = Array.isArray(a.clubStatuten) && a.clubStatuten.includes('CA');
      const bIsCA = Array.isArray(b.clubStatuten) && b.clubStatuten.includes('CA');
      if (aIsCA && !bIsCA) return -1;
      if (!aIsCA && bIsCA) return 1;
    }

    // Then sort by selected column
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.displayName.localeCompare(b.displayName);
        break;
      case 'lastName':
        const aLastName = getLastName(a) || '';
        const bLastName = getLastName(b) || '';
        comparison = aLastName.localeCompare(bLastName);
        break;
      case 'role':
        const roleOrder = { 'membre': 4, 'superadmin': 0, 'admin': 1, 'validateur': 2, 'user': 3 };
        comparison = roleOrder[getRole(a)] - roleOrder[getRole(b)];
        break;
      case 'status':
        const statusOrder = { 'active': 0, 'pending': 1, 'inactive': 2, 'suspended': 3, 'deleted': 4 };
        comparison = statusOrder[getStatus(a)] - statusOrder[getStatus(b)];
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
      case 'certifValidite':
        const getCertifDate = (u: any): number => {
          const val = u.certificat_medical_validite;
          if (!val) return 0;
          if (val instanceof Date) return val.getTime();
          if (val?.toDate) return val.toDate().getTime();
          return 0;
        };
        comparison = getCertifDate(a) - getCertifDate(b);
        break;
    }

    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => isActive(u)).length,
    inactive: users.filter(u => !isActive(u)).length,
    byRole: {
      superadmin: users.filter(u => getRole(u) === 'superadmin').length,
      admin: users.filter(u => getRole(u) === 'admin').length,
      validateur: users.filter(u => getRole(u) === 'validateur').length,
      user: users.filter(u => getRole(u) === 'user').length
    },
    pendingMedical: users.filter(u => u.has_pending_medical === true).length,
    cotisationExpired: users.filter(u => {
      const val = (u as any).cotisation_validite;
      if (!val) return true;
      const date = val instanceof Date ? val : (val as any).toDate?.() || new Date(val as any);
      return date < new Date();
    }).length,
    cotisationValid: users.filter(u => {
      const val = (u as any).cotisation_validite;
      if (!val) return false;
      const date = val instanceof Date ? val : (val as any).toDate?.() || new Date(val as any);
      return date >= new Date();
    }).length
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
                <Users className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
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
              {stats.pendingMedical > 0 && (
                <button
                  onClick={() => setMedicalFilter('pending')}
                  className="flex items-center gap-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2 py-0.5 rounded-full transition-colors"
                  title="Certificats médicaux à valider"
                >
                  <Heart className="w-4 h-4" />
                  <Clock className="w-3 h-3" />
                  <span className="font-medium">{stats.pendingMedical}</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => generatePresencePdf(users).catch(err => logger.error('Failed to generate presence PDF', err))}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm"
              title="Générer PDF liste de présences"
            >
              <FileText className="w-4 h-4" />
              PDF Présences
            </button>
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
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  title="Créer un nouveau membre"
                >
                  <UserPlus className="w-4 h-4" />
                  Nouveau membre
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    title="Importer membres depuis Excel"
                  >
                    <Upload className="w-4 h-4" />
                    Importer Excel
                  </button>
                  {lastImportDate && (
                    <span className="text-xs text-gray-500 dark:text-dark-text-muted" title={lastImportDate.toLocaleString('fr-BE')}>
                      Dernier import: {lastImportDate.toLocaleDateString('fr-BE')}
                    </span>
                  )}
                </div>
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
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:border-gray-300 dark:border-dark-border'
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
                    : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary hover:border-gray-300 dark:border-dark-border'
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
            <div className="space-y-2 mb-3">
            {/* Row 1: Search + basic filters */}
            <div className="flex items-center gap-3">
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
                    : 'bg-gray-50 dark:bg-dark-bg-tertiary border-gray-300 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary'
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

              {/* Fonction filter */}
              <select
                value={fonctionFilter}
                onChange={(e) => setFonctionFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Toutes fonctions</option>
                {fonctionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Row 2: Type, Medical, Cotisation, Payment filters */}
            <div className="flex items-center gap-3">
              {/* Type de membre filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Type: Tous</option>
                {Object.entries(categoryLabels).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
                <option value="none">Non défini</option>
              </select>

              {/* Medical filter */}
              <select
                value={medicalFilter}
                onChange={(e) => setMedicalFilter(e.target.value as 'all' | 'pending' | 'expired' | 'valid')}
                className={`px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  medicalFilter === 'pending'
                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    : medicalFilter === 'expired'
                      ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : medicalFilter === 'valid'
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'border-gray-300 dark:border-dark-border'
                }`}
              >
                <option value="all">Médical: Tous</option>
                <option value="pending">À valider ({stats.pendingMedical})</option>
                <option value="expired">Expirés</option>
                <option value="valid">Valides</option>
              </select>

              {/* Cotisation filter */}
              <select
                value={cotisationFilter}
                onChange={(e) => setCotisationFilter(e.target.value as 'all' | 'expired' | 'valid')}
                className={`px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  cotisationFilter === 'expired'
                    ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : cotisationFilter === 'valid'
                      ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'border-gray-300 dark:border-dark-border'
                }`}
              >
                <option value="all">Cotisation: Tous</option>
                <option value="expired">Expirées ({stats.cotisationExpired})</option>
                <option value="valid">Valides ({stats.cotisationValid})</option>
              </select>

              {/* Payment match filter */}
              <select
                value={paymentMatchFilter}
                onChange={(e) => setPaymentMatchFilter(e.target.value as 'all' | 'mismatch' | 'ok' | 'no_payment')}
                className={`px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  paymentMatchFilter === 'mismatch'
                    ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300'
                    : paymentMatchFilter === 'no_payment'
                      ? 'border-red-400 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : paymentMatchFilter === 'ok'
                        ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'border-gray-300 dark:border-dark-border'
                }`}
              >
                <option value="all">Paiement: Tous</option>
                <option value="mismatch">Montant incorrect ({paymentMatchStats.mismatch})</option>
                <option value="no_payment">Pas de paiement ({paymentMatchStats.noPayment})</option>
                <option value="ok">OK ({paymentMatchStats.ok})</option>
              </select>
            </div>
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
                categoryLabels={categoryLabels}
                selectedUserId={selectedUser?.id}
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
          userList={filteredUsers}
          onNavigate={(u) => setSelectedUser(u)}
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
            setLastImportDate(new Date()); // Update displayed import date
          }}
        />
      )}

    </div>
  );
}
