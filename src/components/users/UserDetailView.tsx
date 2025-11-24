import { useState, useEffect } from 'react';
import { User, UserRole, AuditLog } from '@/types/user.types';
import { PermissionService } from '@/services/permissionService';
import { PasswordService } from '@/services/passwordService';
import { UserService } from '@/services/userService';
import { GoogleMailService } from '@/services/googleMailService';
import { AuditLogList } from './AuditLogList';
import { SendUserEmailModal } from './SendUserEmailModal';
import type { EmailTemplateType } from '@/types/emailTemplates';
import {
  X, Save, Shield, User as UserIcon, Mail,
  Calendar, Clock, CheckCircle, XCircle, AlertTriangle,
  Key, Trash2, Lock
} from 'lucide-react';
import { formatDate } from '@/utils/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { generateDefaultPassword } from '@/utils/passwordGenerator';

interface UserDetailViewProps {
  user: User | null;
  onClose: () => void;
  onUpdate?: (userId: string, updates: Partial<User>) => void;
  onCreate?: (userData: Partial<User>) => void;
  onActivate?: (userId: string, activate: boolean) => void;
  onChangeRole?: (userId: string, role: UserRole) => void;
  onDelete?: (userId: string) => void;
  currentUser: User | null;
}

export function UserDetailView({
  user,
  onClose,
  onUpdate,
  onCreate,
  onActivate,
  onChangeRole,
  onDelete,
  currentUser
}: UserDetailViewProps) {
  const { clubId, user: firebaseAuthUser } = useAuth();
  const isCreateMode = !user;
  const [formData, setFormData] = useState<Partial<User>>({
    email: '',
    displayName: '',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    role: 'user',
    ...user,
    // Ensure role is synced with app_role
    role: user?.app_role || user?.role || 'user'
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'permissions' | 'audit'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPassword, setResetPassword] = useState<string>(generateDefaultPassword());
  const [resetRequireChange, setResetRequireChange] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState(false);
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  // Update formData when user changes (including lifras_id from Membre type)
  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        displayName: user.displayName || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phoneNumber: user.phoneNumber || '',
        role: user.role || 'user',
        ...user,
        // Explicitly include lifras_id from Membre type (user is actually Membre)
        lifras_id: (user as any).lifras_id,
        // Include boolean fields explicitly to preserve false values
        isEncadrant: user.isEncadrant || false,
        isCA: user.isCA || false
      });
    }
  }, [user]);

  // Load user names for metadata display
  useEffect(() => {
    const loadUserNames = async () => {
      if (!user || !clubId) return;

      const userIds = new Set<string>();
      if (user.metadata?.createdBy) userIds.add(user.metadata.createdBy);
      if (user.metadata?.activatedBy) userIds.add(user.metadata.activatedBy);
      if (user.metadata?.suspendedBy) userIds.add(user.metadata.suspendedBy);

      if (userIds.size === 0) return;

      try {
        const names: Record<string, string> = {};
        for (const userId of userIds) {
          const userData = await UserService.getUser(clubId, userId);
          if (userData) {
            names[userId] = userData.displayName || userData.email;
          }
        }
        setUserNames(names);
      } catch (error) {
        console.error('Error loading user names:', error);
      }
    };

    loadUserNames();
  }, [user, clubId]);

  useEffect(() => {
    const loadAuditLogs = async () => {
      if (user && clubId) {
        try {
          const logs = await UserService.getAuditLogs(clubId, user.id, 100);
          setAuditLogs(logs);
        } catch (error) {
          console.error('Error loading audit logs:', error);
          toast.error('Impossible de charger l\'historique');
        }
      }
    };

    if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [user, clubId, activeTab]);

  const canEdit = () => {
    if (!currentUser || !user) return false;
    return PermissionService.canPerformAction(currentUser, user, 'edit');
  };

  const canActivate = () => {
    if (!currentUser || !user) return false;
    return PermissionService.canPerformAction(currentUser, user, 'activate');
  };

  const canChangeRole = () => {
    if (!currentUser || !user) return false;
    return PermissionService.canPerformAction(currentUser, user, 'assignRole');
  };

  const canDelete = () => {
    if (!currentUser) return false;
    return PermissionService.hasPermission(currentUser, 'users.delete');
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email) {
      newErrors.email = 'L\'email est requis';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email invalide';
    }

    if (!formData.displayName) {
      newErrors.displayName = 'Le nom d\'affichage est requis';
    }

    if (isCreateMode && !formData.role) {
      newErrors.role = 'Le rôle est requis';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Auto-save handler for individual fields
  const handleFieldSave = async (field: string, value: any) => {
    if (isCreateMode || !user || !clubId || !firebaseAuthUser) return;

    try {
      // Validation
      if (field === 'email') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!value || !emailRegex.test(value)) {
          toast.error('Email invalide');
          return;
        }
      }
      if (field === 'displayName' && (!value || !value.trim())) {
        toast.error('Le nom d\'affichage est obligatoire');
        return;
      }
      if (field === 'lifras_id' && value && value.trim()) {
        // LifrasID validation: should be numeric or empty
        const trimmed = value.trim();
        if (!/^\d+$/.test(trimmed)) {
          toast.error('LifrasID doit contenir uniquement des chiffres');
          return;
        }
      }

      // Clean value for lifras_id (trim whitespace)
      const cleanValue = field === 'lifras_id' && value ? value.trim() : value;

      // Save only the specific field
      // For boolean fields (isCA, isEncadrant), preserve false values
      const isBooleanField = typeof cleanValue === 'boolean';
      const finalValue = isBooleanField ? cleanValue : (cleanValue || undefined);

      console.log('🔍 [UserDetailView] handleFieldSave - Direct save to Firestore:', {
        field,
        originalValue: value,
        cleanValue,
        isBooleanField,
        finalValue,
        userId: user.id,
        clubId
      });

      // Call UserService directly instead of going through UserManagement
      await UserService.updateUser(clubId, user.id, { [field]: finalValue }, firebaseAuthUser.uid);

      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });

      // Refresh user data to reflect changes
      if (onUpdate) {
        onUpdate(user.id, { [field]: finalValue });
      }
    } catch (error) {
      console.error(`Error saving ${field}:`, error);
      toast.error('Erreur lors de la sauvegarde');
    }
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    if (isCreateMode && onCreate) {
      onCreate({
        ...formData,
        clubId: 'calypso'
      });
    }
  };

  const handleResetPassword = async () => {
    if (!user || !currentUser) return;

    if (resetPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setIsResetting(true);
    try {
      await PasswordService.resetUserPassword(
        user.id,
        currentUser.clubId,
        resetPassword,
        resetRequireChange
      );

      toast.success('Mot de passe réinitialisé avec succès !');
      setShowResetPasswordModal(false);
      setResetPassword(generateDefaultPassword());
      setResetRequireChange(true);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(error.message || 'Erreur lors de la réinitialisation du mot de passe');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendEmail = async (templateType: string, templateId: string, password: string) => {
    if (!user || !clubId || !currentUser || !firebaseAuthUser) return;

    await GoogleMailService.sendUserEmail(
      clubId,
      user,
      templateId,
      templateType as EmailTemplateType,
      password,
      firebaseAuthUser.uid,
      currentUser.displayName || currentUser.email
    );
  };

  const getRoleBadge = (role: UserRole) => {
    const config = PermissionService.getRoleConfig(role);

    // Fallback pour les rôles non configurés (ex: 'membre' pour club members sans accès app)
    if (!config) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          <Shield className="w-4 h-4" />
          {role === 'membre' ? 'Membre' : role}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${
          PermissionService.getRoleBadgeClass(role)
        }`}
        style={{ backgroundColor: `${config.color}20`, color: config.color }}
      >
        <Shield className="w-4 h-4" />
        {config.label}
      </span>
    );
  };

  const getStatusIcon = () => {
    if (!user) return null;

    // Priority: pending activation first
    if (user.metadata?.pendingActivation) {
      return <Clock className="w-5 h-5 text-amber-500" />;
    }
    if (user.status === 'deleted') {
      return <Trash2 className="w-5 h-5 text-gray-500 dark:text-dark-text-muted" />;
    }
    if (user.status === 'suspended') {
      return <AlertTriangle className="w-5 h-5 text-orange-500" />;
    }
    return user.isActive ?
      <CheckCircle className="w-5 h-5 text-green-500" /> :
      <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getPermissions = () => {
    if (!user) return [];
    return PermissionService.getUserPermissions(user);
  };

  if (!isCreateMode && !user) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide-out Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-white dark:bg-dark-bg-secondary shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="w-16 h-16 rounded-full border-2 border-white/20"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-white dark:bg-dark-bg-secondary/20 flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-white" />
                </div>
              )}
              <div>
                <h2 className="text-2xl font-bold">
                  {isCreateMode ? 'Nouvel Utilisateur' : formData.displayName}
                </h2>
                {user && (
                  <div className="flex items-center gap-3 mt-2">
                    {getRoleBadge(user.role)}
                    <div className="flex items-center gap-1">
                      {getStatusIcon()}
                      <span className="text-sm">
                        {user.metadata?.pendingActivation ? 'En attente d\'activation' :
                         user.status === 'deleted' ? 'Supprimé' :
                         user.status === 'suspended' ? 'Suspendu' :
                         user.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white dark:bg-dark-bg-secondary/20 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action buttons in header */}
          {!isCreateMode && user && user.status !== 'deleted' && (
            <div className="flex gap-2 mt-4">
              {/* Firebase Activation Button (for pending members) */}
              {user.metadata?.pendingActivation && (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                <>
                  <button
                    onClick={async () => {
                      if (!user || !clubId || !firebaseAuthUser) return;

                      const toastId = toast.loading('Activation en cours...');
                      try {
                        console.log('🔑 [UserDetailView] Activating user via Vercel Function:', {
                          userId: user.id,
                          email: user.email,
                          clubId: clubId
                        });

                        // Get auth token
                        const authToken = await firebaseAuthUser.getIdToken();

                        // Call Vercel serverless function
                        // Use environment variable for API URL or fallback to relative path
                        const apiUrl = import.meta.env.VITE_API_URL
                          ? `${import.meta.env.VITE_API_URL}/api/activate-user`
                          : '/api/activate-user';

                        console.log('🌐 [UserDetailView] Using API URL:', apiUrl);

                        const response = await fetch(apiUrl, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            userId: user.id,
                            clubId: clubId,
                            authToken: authToken
                          }),
                        });

                        let data;
                        const contentType = response.headers.get('content-type');

                        if (contentType && contentType.includes('application/json')) {
                          data = await response.json();
                        } else {
                          // If response is not JSON, try to read it as text
                          const text = await response.text();
                          console.error('❌ Non-JSON response:', text);
                          data = { error: 'Server error: ' + text };
                        }

                        if (!response.ok) {
                          console.error('❌ API Error Response:', data);
                          const errorMessage = data.hint ? `${data.error}\n${data.hint}` : (data.error || 'Erreur lors de l\'activation');
                          throw new Error(errorMessage);
                        }

                        console.log('✅ [UserDetailView] Activation successful:', data);

                        toast.success(
                          `✓ ${data.message}\n\nEmail: ${data.email}\nMot de passe temporaire: ${data.defaultPassword}\n\n⚠️ L'utilisateur doit changer son mot de passe à la première connexion`,
                          {
                            duration: 8000,
                            id: toastId
                          }
                        );

                        // Close detail view to force refresh of user list
                        onClose();
                      } catch (error: any) {
                        console.error('❌ [UserDetailView] Error activating Firebase account:', error);

                        let errorMessage = error.message || 'Erreur lors de l\'activation';

                        toast.error(errorMessage, { id: toastId });
                      }
                    }}
                    className="px-3 py-1.5 text-sm bg-amber-500/90 text-white rounded-lg hover:bg-amber-600 font-medium"
                    title="Activer le compte Firebase Auth (permet la connexion)"
                  >
                    <Key className="w-4 h-4 inline mr-1" />
                    Activer Firebase Auth
                  </button>

                  {/* Script fallback button */}
                  <button
                    onClick={() => {
                      if (!user) return;

                      // Copy email to clipboard
                      navigator.clipboard.writeText(user.email);

                      toast.success(
                        `📋 Email copié: ${user.email}\n\nCommande:\nnode scripts/activate-user.cjs`,
                        {
                          duration: 8000
                        }
                      );
                    }}
                    className="px-3 py-1.5 text-sm bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 font-medium"
                    title="Copier l'email pour activation via script"
                  >
                    📋 Copier pour script
                  </button>
                </>
              )}

              {/* Normal Activate/Deactivate Button (hidden for pending members) */}
              {!user.metadata?.pendingActivation && canActivate() && onActivate && (
                <button
                  onClick={() => onActivate(user.id, !user.isActive)}
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${
                    user.isActive
                      ? 'bg-white/20 text-white hover:bg-white/30'
                      : 'bg-green-100/20 text-green-100 hover:bg-green-100/30'
                  }`}
                >
                  {user.isActive ? 'Désactiver' : 'Activer'}
                </button>
              )}

              {canDelete() && onDelete && (
                <button
                  onClick={() => onDelete(user.id)}
                  className="px-3 py-1.5 text-sm bg-red-100/20 text-red-100 rounded-lg hover:bg-red-100/30 font-medium"
                >
                  <Trash2 className="w-4 h-4 inline mr-1" />
                  Supprimer
                </button>
              )}

              {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                <>
                  <button
                    onClick={() => setShowResetPasswordModal(true)}
                    className="px-3 py-1.5 text-sm bg-orange-100/20 text-orange-100 rounded-lg hover:bg-orange-100/30 font-medium"
                  >
                    <Lock className="w-4 h-4 inline mr-1" />
                    Réinitialiser mot de passe
                  </button>

                  <button
                    onClick={() => setShowSendEmailModal(true)}
                    className="px-3 py-1.5 text-sm bg-cyan-100/20 text-cyan-100 rounded-lg hover:bg-cyan-100/30 font-medium"
                  >
                    <Mail className="w-4 h-4 inline mr-1" />
                    Envoyer Email
                  </button>
                </>
              )}
            </div>
          )}

          {!isCreateMode && user && user.status === 'deleted' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-dark-bg-secondary/10 text-white/80 rounded-lg mt-4">
              <Trash2 className="w-4 h-4" />
              <span className="font-medium">Utilisateur supprimé</span>
              {user.metadata?.deletedAt && (
                <span className="text-sm">le {formatDate(user.metadata.deletedAt)}</span>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        {!isCreateMode && user && (
          <div className="border-b border-gray-200 dark:border-dark-border">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('details')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
                  activeTab === 'details'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Détails
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
                  activeTab === 'permissions'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Permissions
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-6 py-3 font-medium text-sm border-b-2 transition ${
                  activeTab === 'audit'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Historique
              </button>
            </nav>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Pending Activation Info Banner */}
          {!isCreateMode && user && user.metadata?.pendingActivation && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-medium mb-2">Compte en attente d'activation</p>
                  <p>Ce membre a été créé dans Firestore mais n'a pas encore de compte Firebase Authentication. Il ne peut pas se connecter à l'application.</p>
                  <p className="mt-2 font-medium">Cliquez sur le bouton "Activer Firebase Auth" en haut pour activer ce compte.</p>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'details' || isCreateMode) && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Email *
                  </label>
                  {isCreateMode ? (
                    <>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          errors.email ? 'border-red-500' : 'border-gray-300'
                        }`}
                      />
                      {errors.email && (
                        <p className="text-red-500 text-xs mt-1">{errors.email}</p>
                      )}
                    </>
                  ) : (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      onBlur={() => handleFieldSave('email', formData.email)}
                      disabled={!canEdit()}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                      }`}
                    />
                  )}
                </div>

                {/* LifrasID - editable */}
                {!isCreateMode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      LifrasID
                    </label>
                    <input
                      type="text"
                      value={(formData as any).lifras_id || ''}
                      onChange={(e) => setFormData({ ...formData, lifras_id: e.target.value } as any)}
                      onBlur={() => handleFieldSave('lifras_id', (formData as any).lifras_id)}
                      disabled={!canEdit()}
                      placeholder="Optionnel"
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                      }`}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nom
                  </label>
                  <input
                    type="text"
                    value={formData.lastName || ''}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    onBlur={() => handleFieldSave('lastName', formData.lastName)}
                    disabled={!isCreateMode && !canEdit()}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      !isCreateMode && !canEdit() ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Prénom
                  </label>
                  <input
                    type="text"
                    value={formData.firstName || ''}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    onBlur={() => handleFieldSave('firstName', formData.firstName)}
                    disabled={!isCreateMode && !canEdit()}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      !isCreateMode && !canEdit() ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nom d'affichage *
                  </label>
                  <input
                    type="text"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    onBlur={() => handleFieldSave('displayName', formData.displayName)}
                    disabled={!isCreateMode && !canEdit()}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.displayName ? 'border-red-500' : 'border-gray-300'
                    } ${!isCreateMode && !canEdit() ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                  />
                  {errors.displayName && (
                    <p className="text-red-500 text-xs mt-1">{errors.displayName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={formData.phoneNumber || ''}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    onBlur={() => handleFieldSave('phoneNumber', formData.phoneNumber)}
                    disabled={!isCreateMode && !canEdit()}
                    className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      !isCreateMode && !canEdit() ? 'bg-gray-50 cursor-not-allowed' : ''
                    }`}
                  />
                </div>

                {/* Role selector - always visible in edit mode if user can change roles */}
                {(isCreateMode || (user && canChangeRole() && onChangeRole)) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Rôle {isCreateMode ? '*' : ''}
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => {
                        const newRole = e.target.value as UserRole;
                        setFormData({ ...formData, role: newRole });
                        if (!isCreateMode && user && onChangeRole) {
                          onChangeRole(user.id, newRole);
                        }
                      }}
                      disabled={!isCreateMode && !canChangeRole()}
                      className={`w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                        !isCreateMode && !canChangeRole() ? 'bg-gray-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {PermissionService.getAssignableRoles(currentUser).map(role => (
                        <option key={role} value={role}>
                          {PermissionService.getRoleConfig(role).label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Comité d'Administration checkbox */}
              <div className="border-t pt-6 space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isCA"
                    checked={formData.isCA || false}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setFormData({ ...formData, isCA: newValue });
                      if (!isCreateMode && user && onUpdate) {
                        handleFieldSave('isCA', newValue);
                      }
                    }}
                    disabled={!isCreateMode && !canEdit()}
                    className="h-4 w-4 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="isCA" className="ml-3 text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                    Membre du Comité d'Administration
                  </label>
                </div>

                {/* Encadrant checkbox */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isEncadrant"
                    checked={formData.isEncadrant || false}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setFormData({ ...formData, isEncadrant: newValue });
                      if (!isCreateMode && user && onUpdate) {
                        handleFieldSave('isEncadrant', newValue);
                      }
                    }}
                    disabled={!isCreateMode && !canEdit()}
                    className="h-4 w-4 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <label htmlFor="isEncadrant" className="ml-3 text-sm font-medium text-gray-700 dark:text-dark-text-primary">
                    Encadrant
                  </label>
                </div>
              </div>

              {isCreateMode && (
                <div className="border-t pt-6">
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-1">Activation requise</p>
                        <p>Le membre sera créé mais ne pourra pas encore se connecter. Vous devrez l'activer via le bouton "Activer Firebase Auth" ou via le script <code>activate-user.cjs</code>.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isCreateMode && user && (
                <div className="border-t pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        <Calendar className="w-4 h-4 inline mr-1" />
                        Date de création
                      </label>
                      <div className="text-gray-900 dark:text-dark-text-primary">{formatDate(user.createdAt)}</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Dernière connexion
                      </label>
                      <div className="text-gray-900 dark:text-dark-text-primary">
                        {user.lastLogin ? formatDate(user.lastLogin) : 'Jamais'}
                      </div>
                    </div>
                  </div>

                  {user.metadata && (
                    <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-4 rounded-lg space-y-2">
                      {user.metadata.createdBy && (
                        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          Créé par: <span className="font-medium">{userNames[user.metadata.createdBy] || user.metadata.createdBy}</span>
                        </p>
                      )}
                      {user.metadata.activatedBy && (
                        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          Activé par: <span className="font-medium">{userNames[user.metadata.activatedBy] || user.metadata.activatedBy}</span>
                          {user.metadata.activatedAt && (
                            <span> le {formatDate(user.metadata.activatedAt)}</span>
                          )}
                        </p>
                      )}
                      {user.metadata.suspendedBy && (
                        <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                          Suspendu par: <span className="font-medium">{userNames[user.metadata.suspendedBy] || user.metadata.suspendedBy}</span>
                          {user.metadata.suspendedReason && (
                            <span> - Raison: {user.metadata.suspendedReason}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'permissions' && user && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">
                  Rôle actuel: {PermissionService.getRoleConfig(user.role).label}
                </h3>
                <p className="text-sm text-blue-700">
                  {PermissionService.getRoleConfig(user.role).description}
                </p>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Permissions accordées</h3>
                <div className="grid grid-cols-2 gap-3">
                  {getPermissions().map(permission => (
                    <div
                      key={permission}
                      className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg"
                    >
                      <Key className="w-4 h-4 text-gray-400 dark:text-dark-text-muted" />
                      <span className="text-sm text-gray-700 dark:text-dark-text-primary">
                        {PermissionService.getPermissionLabel(permission)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {user.customPermissions && user.customPermissions.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4">Permissions personnalisées</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {user.customPermissions.map(permission => (
                      <div
                        key={permission}
                        className="flex items-center gap-2 p-3 bg-green-50 rounded-lg"
                      >
                        <Key className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-700">
                          {PermissionService.getPermissionLabel(permission)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && user && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-dark-text-primary">Historique des activités</h3>
                <span className="text-sm text-gray-500 dark:text-dark-text-muted">
                  {auditLogs.length} entrée{auditLogs.length > 1 ? 's' : ''}
                </span>
              </div>
              <AuditLogList
                logs={auditLogs}
                users={currentUser ? [currentUser, user] : [user]}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 bg-gray-50 dark:bg-dark-bg-tertiary flex justify-end gap-2">
          {isCreateMode && (
            <button
              onClick={handleSubmit}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              <Save className="w-4 h-4 inline mr-1" />
              Créer l'utilisateur
            </button>
          )}

          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Reset Password Modal */}
      {showResetPasswordModal && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
            onClick={() => setShowResetPasswordModal(false)}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <Lock className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-dark-text-primary">
                  Réinitialiser le mot de passe
                </h3>
              </div>

              <p className="text-sm text-gray-600 dark:text-dark-text-secondary mb-4">
                Réinitialisez le mot de passe de <strong>{user?.displayName}</strong>.
                Communiquez le nouveau mot de passe à l'utilisateur de manière sécurisée.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    Nouveau mot de passe *
                  </label>
                  <input
                    type="text"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder={generateDefaultPassword()}
                  />
                  <p className="text-xs text-gray-500 dark:text-dark-text-muted mt-1">
                    Minimum 6 caractères
                  </p>
                </div>

                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="resetRequireChange"
                    checked={resetRequireChange}
                    onChange={(e) => setResetRequireChange(e.target.checked)}
                    className="mt-1 rounded border-gray-300 dark:border-dark-border text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="resetRequireChange" className="ml-2 text-sm text-gray-700 dark:text-dark-text-primary">
                    <span className="font-medium">Obliger à changer le mot de passe à la prochaine connexion</span>
                    <br />
                    <span className="text-gray-500 dark:text-dark-text-muted">L'utilisateur sera redirigé vers la page de changement de mot de passe.</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowResetPasswordModal(false);
                    setResetPassword(generateDefaultPassword());
                    setResetRequireChange(true);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text-primary rounded-lg hover:bg-gray-200 font-medium"
                  disabled={isResetting}
                >
                  Annuler
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={isResetting}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium disabled:opacity-50"
                >
                  {isResetting ? 'Réinitialisation...' : 'Réinitialiser'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Send Email Modal */}
      {user && showSendEmailModal && (
        <SendUserEmailModal
          user={user}
          isOpen={showSendEmailModal}
          onClose={() => setShowSendEmailModal(false)}
          onSend={handleSendEmail}
        />
      )}
    </>
  );
}
