import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, UserRole, AuditLog } from '@/types/user.types';
import { TransactionBancaire } from '@/types';
import { PermissionService } from '@/services/permissionService';
import { PasswordService } from '@/services/passwordService';
import { UserService } from '@/services/userService';
import { ClubEmailService } from '@/services/clubEmailService';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { checkMemberBrowserCompatibility } from '@/services/compatibilityService';
import type { CompatibilitySettings } from '@/types/settings.types';
import { AuditLogList } from './AuditLogList';
import { SendUserEmailModal } from './SendUserEmailModal';
import { UserExercicesTab } from './UserExercicesTab';
import { MedicalTab } from './MedicalTab';
import { DocumentsTab } from './DocumentsTab';
import type { EmailTemplateType } from '@/types/emailTemplates';
import { ValueListSelector } from '@/components/commun/ValueListSelector';
import { MemberCategorySelector } from '@/components/cotisations/MemberCategorySelector';
import { MembershipSeasonService } from '@/services/membershipSeasonService';
import { MEMBERSHIP_PERIOD_LABELS } from '@/types/cotisations.types';
import {
  X, Save, Shield, User as UserIcon, Mail,
  Calendar, Clock, CheckCircle, XCircle, AlertTriangle,
  Key, Trash2, Lock, CreditCard, Search, Smartphone, Bell, Globe,
  Heart, FileText, Upload, Download, Eye, Link2, ExternalLink,
  Activity, Fingerprint, ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatDate, formatMontant } from '@/utils/utils';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { generateDefaultPassword } from '@/utils/passwordGenerator';
import { NIVEAU_OPTIONS, calculatePlongeurCode } from '@/utils/plongeurUtils';
import { getRole, formatIBAN, cleanIBAN, isValidIBANFormat } from '@/utils/fieldMapper';
import { IbanLookupModal } from './IbanLookupModal';
import { useNavigate } from 'react-router-dom';

interface UserDetailViewProps {
  user: User | null;
  onClose: () => void;
  onUpdate?: (userId: string, updates: Partial<User>) => void;
  onCreate?: (userData: Partial<User>) => void;
  onActivate?: (userId: string, activate: boolean) => void;
  onChangeRole?: (userId: string, role: UserRole) => void;
  onDelete?: (userId: string) => void;
  currentUser: User | null;
  /** Sorted/filtered user list for prev/next navigation */
  userList?: User[];
  /** Navigate to a different user */
  onNavigate?: (user: User) => void;
}
function getMobileCompatibilityBadge(user: any, settings: CompatibilitySettings | null) {
  if (!settings || !user.app_platform) return null;

  const platform = user.app_platform; // 'ios' or 'android'
  const osVersion = user.device_os_version;

  if (!osVersion) return null;

  let isCompatible = true;
  let warningLevel: 'none' | 'warning' | 'error' = 'none';

  if (platform === 'ios') {
    const version = parseFloat(osVersion);
    const minSupported = parseFloat(settings.calymob.ios.minSupported);
    const minRecommended = parseFloat(settings.calymob.ios.minRecommended);

    if (version < minSupported) {
      warningLevel = 'error';
      isCompatible = false;
    } else if (version < minRecommended) {
      warningLevel = 'warning';
    }
  } else if (platform === 'android') {
    const apiLevel = parseInt(user.device_api_level || '0');
    if (apiLevel > 0) {
      const minSupported = settings.calymob.android.minSupported;
      const minRecommended = settings.calymob.android.minRecommended;

      if (apiLevel < minSupported) {
        warningLevel = 'error';
        isCompatible = false;
      } else if (apiLevel < minRecommended) {
        warningLevel = 'warning';
      }
    }
  }

  if (warningLevel === 'none') {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
        ✓ Compatible
      </span>
    );
  }
  if (warningLevel === 'warning') {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 rounded-full">
        ⚠ Update aanbevolen
      </span>
    );
  }
  if (warningLevel === 'error') {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
        ✗ Niet ondersteund
      </span>
    );
  }
  return null;
}

function getBrowserCompatibilityBadge(user: any, settings: CompatibilitySettings | null) {
  if (!settings || !user.browser_name || !user.browser_version) return null;

  const browserName = user.browser_name.toLowerCase();
  const browserConfig = settings.calycompta.browsers[browserName.charAt(0).toUpperCase() + browserName.slice(1)];

  if (!browserConfig) return null;

  const version = parseInt(user.browser_version);
  let warningLevel: 'none' | 'warning' | 'error' = 'none';

  if (browserConfig.status === 'untested') {
    warningLevel = 'warning';
  } else if (browserConfig.minSupported && version < browserConfig.minSupported) {
    warningLevel = 'error';
  } else if (browserConfig.minRecommended && version < browserConfig.minRecommended) {
    warningLevel = 'warning';
  }

  if (warningLevel === 'warning') {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-orange-700 bg-orange-100 rounded-full">
        ⚠ {browserConfig.status === 'untested' ? 'Non testé' : 'Update recommandé'}
      </span>
    );
  }
  if (warningLevel === 'error') {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-red-700 bg-red-100 rounded-full">
        ✗ Non supporté
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-green-700 bg-green-100 rounded-full">
      ✓ Compatible
    </span>
  );
}

function toDateInputValue(value?: Date | Timestamp | null): string {
  if (!value) return '';

  const date = value instanceof Timestamp ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().split('T')[0];
}

function isExpiredDate(value?: Date | Timestamp | null): boolean {
  if (!value) return false;

  const date = value instanceof Timestamp ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  return date < new Date();
}

export function UserDetailView({
  user,
  onClose,
  onUpdate,
  onCreate,
  onActivate,
  onChangeRole,
  onDelete,
  currentUser,
  userList,
  onNavigate,
}: UserDetailViewProps) {
  const { clubId, user: firebaseAuthUser } = useAuth();
  const isCreateMode = !user;
  const [compatibilitySettings, setCompatibilitySettings] = useState<CompatibilitySettings | null>(null);
  const [formData, setFormData] = useState<Partial<User>>(() => {
    if (!user) {
      return {
        email: '',
        displayName: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        role: 'user',
        clubStatuten: []
      };
    }
    // Ensure role is synced with app_role using Field Mapper
    const { role: _, ...userWithoutRole } = user as any;

    // Initialize clubStatuten from existing data or migrate from deprecated fields
    let clubStatuten = user.clubStatuten || [];
    if (clubStatuten.length === 0) {
      // Backwards compatibility: migrate from deprecated boolean fields
      // Use capitalized values to match the value list
      if (user.isCA) clubStatuten.push('CA');
      if (user.isEncadrant) clubStatuten.push('Encadrants');
    }

    return {
      ...userWithoutRole,
      role: getRole(user),
      clubStatuten
    };
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<'details' | 'permissions' | 'audit' | 'exercices' | 'app' | 'medical' | 'documents'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetPassword, setResetPassword] = useState<string>(generateDefaultPassword());
  const [resetRequireChange, setResetRequireChange] = useState<boolean>(true);
  const [isResetting, setIsResetting] = useState(false);
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [showIbanLookup, setShowIbanLookup] = useState(false);
  const [linkedTransactions, setLinkedTransactions] = useState<TransactionBancaire[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [membershipSummaryLine, setMembershipSummaryLine] = useState<string | null>(null);
  const navigate = useNavigate();

  // Load linked transactions (cotisations)
  useEffect(() => {
    const loadLinkedTransactions = async () => {
      if (!clubId || !user?.id) {
        setLinkedTransactions([]);
        return;
      }

      setLoadingTransactions(true);
      try {
        // Query transactions that have this member in matched_entities
        const txRef = collection(db, 'clubs', clubId, 'transactions_bancaires');
        const snapshot = await getDocs(txRef);

        const linked: TransactionBancaire[] = [];
        snapshot.docs.forEach(doc => {
          const tx = { id: doc.id, ...doc.data() } as TransactionBancaire;
          // Check if this transaction has this member linked
          if (tx.matched_entities?.some(e => e.entity_type === 'member' && e.entity_id === user.id)) {
            linked.push(tx);
          }
        });

        // Sort by date descending
        linked.sort((a, b) => {
          const dateA = a.date_execution instanceof Timestamp ? a.date_execution.toDate() : new Date(a.date_execution);
          const dateB = b.date_execution instanceof Timestamp ? b.date_execution.toDate() : new Date(b.date_execution);
          return dateB.getTime() - dateA.getTime();
        });

        setLinkedTransactions(linked);
      } catch (error) {
        logger.error('Error loading linked transactions:', error);
      } finally {
        setLoadingTransactions(false);
      }
    };

    loadLinkedTransactions();
  }, [clubId, user?.id]);

  // Load compatibility settings
  useEffect(() => {
    if (clubId) {
      FirebaseSettingsService.getCompatibilitySettings(clubId).then(setCompatibilitySettings);
    }
  }, [clubId]);

  // Update formData when user changes (including lifras_id from Membre type)
  useEffect(() => {
    if (user) {
      setFormData({
        ...user,
        role: getRole(user), // Ensure role is correctly calculated
        // Explicitly include lifras_id and plongeur fields from User type
        lifras_id: user.lifras_id,
        plongeur_niveau: user.plongeur_niveau,
        plongeur_code: user.plongeur_code,
        // Include IBAN fields
        iban: (user as any).iban || '',
        ibans: (user as any).ibans || [],
        // Include boolean fields explicitly to preserve false values
        isEncadrant: user.isEncadrant || false,
        isCA: user.isCA || false
      });
    }
  }, [user]);

  useEffect(() => {
    const loadMembershipSummary = async () => {
      if (!clubId || !formData.membership_category_code) {
        setMembershipSummaryLine(null);
        return;
      }

      try {
        const season = formData.membership_season_id
          ? await MembershipSeasonService.getSeasonById(clubId, formData.membership_season_id)
          : await MembershipSeasonService.getActiveSeason(clubId);

        if (!season) {
          setMembershipSummaryLine(null);
          return;
        }

        const tariff = season.tariffs.find(t => t.code === formData.membership_category_code);
        if (!tariff) {
          setMembershipSummaryLine(null);
          return;
        }

        const period = formData.membership_period || 'jan_dec';
        const price = period === 'jan_dec' ? tariff.price_jan_dec : tariff.price_sept_dec;
        const priceLabel = price !== null && price !== undefined ? ` · ${formatMontant(price)}` : '';

        setMembershipSummaryLine(`${tariff.label} · ${MEMBERSHIP_PERIOD_LABELS[period]}${priceLabel}`);
      } catch (error) {
        logger.error('Error loading membership summary:', error);
        setMembershipSummaryLine(null);
      }
    };

    void loadMembershipSummary();
  }, [clubId, formData.membership_category_code, formData.membership_period, formData.membership_season_id]);

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
        logger.error('Error loading user names:', error);
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
          logger.error('Error loading audit logs:', error);
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
      const nullableDateFields = new Set([
        'cotisation_validite',
        'certificat_medical_date',
        'certificat_medical_validite'
      ]);
      const isBooleanField = typeof cleanValue === 'boolean';
      const finalValue = cleanValue === null && nullableDateFields.has(field)
        ? null
        : isBooleanField
          ? cleanValue
          : (cleanValue || undefined);

      logger.debug('🔍 [UserDetailView] handleFieldSave - Direct save to Firestore:', {
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
      logger.error(`Error saving ${field}:`, error);
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

  const handleMembershipCategoryChange = async (
    categoryCode: string,
    period: 'jan_dec' | 'sept_dec',
    seasonId: string
  ) => {
    const localUpdates = {
      membership_category_code: categoryCode || undefined,
      membership_period: categoryCode ? period : undefined,
      membership_season_id: categoryCode ? seasonId : undefined
    };

    setFormData(prev => ({
      ...prev,
      ...localUpdates
    }));

    if (isCreateMode || !user || !clubId || !firebaseAuthUser) return;

    const persistedUpdates = {
      membership_category_code: categoryCode || null,
      membership_period: categoryCode ? period : null,
      membership_season_id: categoryCode ? seasonId : null
    };

    try {
      await UserService.updateUser(clubId, user.id, persistedUpdates, firebaseAuthUser.uid);
      toast.success('✓ Sauvegardé', { duration: 1500, position: 'bottom-right' });

      if (onUpdate) {
        onUpdate(user.id, persistedUpdates as Partial<User>);
      }
    } catch (error) {
      logger.error('Error saving membership category:', error);
      toast.error('Erreur lors de la sauvegarde');
      setFormData(prev => ({
        ...prev,
        membership_category_code: user.membership_category_code,
        membership_period: user.membership_period,
        membership_season_id: user.membership_season_id
      }));
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
      logger.error('Error resetting password:', error);
      toast.error(error.message || 'Erreur lors de la réinitialisation du mot de passe');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSendEmail = async (templateType: string, templateId: string, password: string) => {
    if (!user || !clubId || !currentUser || !firebaseAuthUser) return;

    await ClubEmailService.sendUserEmail(
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
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-gray-800 text-gray-700 dark:text-dark-text-primary dark:text-gray-300">
          <Shield className="w-4 h-4" />
          {role === 'membre' ? 'Membre' : role}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${PermissionService.getRoleBadgeClass(role)
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

  // Navigation: prev/next member
  const currentIndex = user && userList ? userList.findIndex(u => u.id === user.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = userList ? currentIndex < userList.length - 1 : false;

  const goToPrev = useCallback(() => {
    if (hasPrev && userList && onNavigate) {
      onNavigate(userList[currentIndex - 1]);
    }
  }, [hasPrev, userList, onNavigate, currentIndex]);

  const goToNext = useCallback(() => {
    if (hasNext && userList && onNavigate) {
      onNavigate(userList[currentIndex + 1]);
    }
  }, [hasNext, userList, onNavigate, currentIndex]);

  // Keyboard navigation: arrow left/right
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrev, goToNext]);

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
                    {getRoleBadge(getRole(user))}
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
            <div className="flex items-center gap-1">
              {/* Prev/Next navigation */}
              {!isCreateMode && userList && userList.length > 1 && onNavigate && (
                <>
                  <button
                    onClick={goToPrev}
                    disabled={!hasPrev}
                    className="p-2 hover:bg-white/20 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Précédent (←)"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-xs text-white/70 min-w-[3rem] text-center">
                    {currentIndex + 1}/{userList.length}
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={!hasNext}
                    className="p-2 hover:bg-white/20 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Suivant (→)"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/20 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Action buttons in header */}
          {!isCreateMode && user && user.status !== 'deleted' && (
            <div className="flex gap-2 mt-4">
              {/* Firebase Activation Button (for pending members) */}
              {user.metadata?.pendingActivation && currentUser && (getRole(currentUser) === 'admin' || getRole(currentUser) === 'superadmin') && (
                <>
                  <button
                    onClick={async () => {
                      if (!user || !clubId || !firebaseAuthUser) return;

                      const toastId = toast.loading('Activation en cours...');
                      try {
                        logger.debug('🔑 [UserDetailView] Activating user via bulk-invite API (single user):', {
                          userId: user.id,
                          email: user.email,
                          clubId: clubId
                        });

                        // Get auth token
                        const authToken = await firebaseAuthUser.getIdToken();

                        // Call bulk-invite API with single user for reset-link flow
                        const response = await fetch('/api/bulk-invite-users', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${authToken}`,
                          },
                          body: JSON.stringify({
                            clubId: clubId,
                            userIds: [user.id],
                            sendEmails: false,
                          }),
                        });

                        let data;
                        const contentType = response.headers.get('content-type');

                        if (contentType && contentType.includes('application/json')) {
                          data = await response.json();
                        } else {
                          const text = await response.text();
                          logger.error('❌ Non-JSON response:', text);
                          data = { error: 'Server error: ' + text };
                        }

                        if (!response.ok) {
                          logger.error('❌ API Error Response:', data);
                          const errorMessage = data.error || 'Erreur lors de l\'activation';
                          throw new Error(errorMessage);
                        }

                        // Check if any member was actually activated
                        const summary = data?.summary;
                        if (summary && summary.activated === 0 && summary.failed === 0 && summary.alreadyActive === 0) {
                          logger.error('❌ No members were processed:', data);
                          throw new Error('Le membre n\'a pas pu être traité. Vérifiez son statut dans Firestore.');
                        }

                        if (summary?.failed > 0) {
                          const failedResult = data?.results?.failed?.[0];
                          const reason = failedResult?.reason || 'Erreur inconnue';
                          logger.error('❌ Member activation failed:', failedResult);
                          throw new Error(`Échec de l'activation: ${reason}`);
                        }

                        logger.debug('✅ [UserDetailView] Activation successful:', data);

                        toast.success(
                          `✓ Compte activé pour ${user.email}\n\nAucun email n'a été envoyé automatiquement depuis cette action.`,
                          { duration: 6000, id: toastId }
                        );

                        // Close detail view to force refresh of user list
                        onClose();
                      } catch (error: any) {
                        logger.error('❌ [UserDetailView] Error activating Firebase account:', error);
                        toast.error(error.message || 'Erreur lors de l\'activation', { id: toastId });
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
                  className={`px-3 py-1.5 text-sm rounded-lg font-medium ${user.isActive
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

              {currentUser && (getRole(currentUser) === 'admin' || getRole(currentUser) === 'superadmin') && (
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
                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'details'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                Détails
              </button>
              <button
                onClick={() => setActiveTab('medical')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition flex items-center gap-1 ${activeTab === 'medical'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                <Heart className="w-4 h-4" />
                Médical
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition flex items-center gap-1 ${activeTab === 'documents'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                <FileText className="w-4 h-4" />
                Docs
              </button>
              <button
                onClick={() => setActiveTab('permissions')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'permissions'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                Droits
              </button>
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'audit'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                Audit
              </button>
              <button
                onClick={() => setActiveTab('exercices')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition ${activeTab === 'exercices'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                Exerc.
              </button>
              <button
                onClick={() => setActiveTab('app')}
                className={`px-4 py-3 font-medium text-sm border-b-2 transition flex items-center gap-1 ${activeTab === 'app'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-dark-text-muted hover:text-gray-700 dark:text-dark-text-primary'
                  }`}
              >
                <Smartphone className="w-4 h-4" />
                App
                {(user as any)?.app_installed && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" title="CalyMob installée" />
                )}
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
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
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
                        className={`w-full h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                          }`}
                      />
                      {errors.email && (
                        <p role="alert" className="text-red-500 text-xs mt-1">{errors.email}</p>
                      )}
                    </>
                  ) : (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      onBlur={() => handleFieldSave('email', formData.email)}
                      disabled={!canEdit()}
                      className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                        }`}
                    />
                  )}
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
                    className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                      }`}
                  />
                </div>

                {/* Plongeur niveau et code - always visible, editable dropdown for admins */}
                {!isCreateMode && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                      Niveau de plongée
                    </label>
                    {canEdit() ? (
                      <select
                        value={formData.plongeur_code || ''}
                        onChange={async (e) => {
                          const newCode = e.target.value;
                          const option = NIVEAU_OPTIONS.find(o => o.code === newCode);
                          const newNiveau = option?.fullName || '';
                          setFormData({ ...formData, plongeur_code: newCode || undefined, plongeur_niveau: newNiveau || undefined });
                          // Save both fields together
                          if (user && clubId && firebaseAuthUser) {
                            try {
                              await UserService.updateUser(clubId, user.id, {
                                plongeur_code: newCode || null,
                                plongeur_niveau: newNiveau || null,
                                is_diver: newCode ? newCode !== 'NAG' : false,
                              }, firebaseAuthUser.uid);
                              toast.success('✓ Niveau sauvegardé', { duration: 1500, position: 'bottom-right' });
                              if (onUpdate) {
                                onUpdate(user.id, { plongeur_code: newCode || undefined, plongeur_niveau: newNiveau || undefined, is_diver: newCode ? newCode !== 'NAG' : false });
                              }
                            } catch (error) {
                              logger.error('Error saving niveau:', error);
                              toast.error('Erreur lors de la sauvegarde du niveau');
                            }
                          }
                        }}
                        className="w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-dark-bg-secondary text-sm"
                      >
                        <option value="">— Aucun niveau —</option>
                        {NIVEAU_OPTIONS.map(opt => (
                          <option key={opt.code} value={opt.code}>
                            {opt.label} — {opt.fullName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex items-center gap-2 h-10">
                        {formData.plongeur_code ? (
                          <>
                            <span className={`inline-flex items-center px-3 h-10 text-sm font-semibold rounded-lg ${
                              formData.plongeur_code === 'NAG'
                                ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300'
                                : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                            }`}>
                              {NIVEAU_OPTIONS.find(o => o.code === formData.plongeur_code)?.label || formData.plongeur_code}
                            </span>
                            <span className="inline-flex items-center px-3 h-10 text-sm text-gray-700 dark:text-dark-text-primary bg-gray-50 dark:bg-dark-bg-tertiary rounded-lg">
                              {formData.plongeur_niveau || NIVEAU_OPTIONS.find(o => o.code === formData.plongeur_code)?.fullName || ''}
                            </span>
                          </>
                        ) : (
                          <span className="text-sm text-gray-400 dark:text-dark-text-muted italic">Aucun niveau défini</span>
                        )}
                      </div>
                    )}
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
                    className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                      }`}
                  />
                </div>

                {clubId && (
                  <div>
                    <MemberCategorySelector
                      categoryCode={formData.membership_category_code}
                      period={formData.membership_period}
                      seasonId={formData.membership_season_id}
                      onChange={handleMembershipCategoryChange}
                      disabled={!isCreateMode && !canEdit()}
                      compact={true}
                      categoryLabel="Type de membre"
                      showSeasonInfo={false}
                      showPeriodSelector={false}
                      showSummary={false}
                    />
                  </div>
                )}

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
                    className={`w-full h-10 px-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.displayName ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'
                      } ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''}`}
                  />
                  {errors.displayName && (
                    <p role="alert" className="text-red-500 text-xs mt-1">{errors.displayName}</p>
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
                    className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                      }`}
                  />
                </div>

                {/* IBAN */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-1">
                    IBAN
                  </label>
                  <div className="relative flex gap-2">
                    <div className="relative flex-1">
                      <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-dark-text-muted" />
                      <input
                        type="text"
                        value={formatIBAN(formData.iban) || ''}
                        onChange={(e) => setFormData({ ...formData, iban: cleanIBAN(e.target.value) })}
                        onBlur={() => {
                          const iban = formData.iban;
                          if (iban && !isValidIBANFormat(iban)) {
                            toast.error('Format IBAN invalide');
                            return;
                          }
                          handleFieldSave('iban', iban || null);
                        }}
                        disabled={!isCreateMode && !canEdit()}
                        placeholder="BE12 3456 7890 1234"
                        className={`w-full h-10 pl-10 pr-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                          }`}
                      />
                    </div>
                    {/* Search IBAN button */}
                    {!isCreateMode && canEdit() && (
                      <button
                        type="button"
                        onClick={() => setShowIbanLookup(true)}
                        className="p-2 text-gray-500 dark:text-dark-text-muted hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Rechercher IBAN dans les transactions"
                      >
                        <Search className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                  {formData.ibans && formData.ibans.length > 1 && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                      +{formData.ibans.length - 1} autre(s) IBAN détecté(s)
                    </p>
                  )}
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
                      className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canChangeRole() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                        }`}
                    >
                      {PermissionService.getAssignableRoles(currentUser).map(role => (
                        <option key={role} value={role}>
                          {PermissionService.getRoleConfig(role).label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-muted">
                      {formData.role === 'membre' && 'Membre du club sans accès à CalyCompta'}
                      {formData.role === 'user' && 'Accès CalyCompta: ses propres dépenses et événements uniquement'}
                      {formData.role === 'validateur' && 'Accès CalyCompta: toutes les opérations, transactions et rapports'}
                      {formData.role === 'admin' && 'Accès CalyCompta complet + gestion des utilisateurs'}
                      {formData.role === 'superadmin' && 'Accès CalyCompta complet + suppression utilisateurs'}
                    </p>
                  </div>
                )}
              </div>

              {/* Fonction (Club Statuten) - Dynamic Value List */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-2">
                  Fonction
                </label>
                {clubId && (
                  <ValueListSelector
                    clubId={clubId}
                    listId="fonction"
                    value={formData.clubStatuten || []}
                    onChange={(newValue) => {
                      const selectedFonctions = newValue as string[];
                      setFormData({
                        ...formData,
                        clubStatuten: selectedFonctions,
                        // Maintain backwards compatibility with deprecated fields
                        // Use capitalized values to match the value list
                        isCA: selectedFonctions.includes('CA'),
                        isEncadrant: selectedFonctions.includes('Encadrants')
                      });
                      if (!isCreateMode && user && onUpdate) {
                        handleFieldSave('clubStatuten', selectedFonctions);
                      }
                    }}
                    mode="multi"
                    disabled={!isCreateMode && !canEdit()}
                    showBadges={true}
                  />
                )}
              </div>

              {isCreateMode && (
                <div className="border-t pt-4">
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
                <div className="border-t pt-4 space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label
                        className="mb-1 flex items-center text-sm font-medium text-gray-700 dark:text-dark-text-primary"
                        title="Cotisation valable jusqu'au"
                      >
                        <Clock className="mr-1 h-4 w-4 flex-shrink-0" />
                        <span>Cotisation</span>
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue((formData as any).cotisation_validite)}
                        onChange={(e) => {
                          const date = e.target.value ? new Date(e.target.value) : null;
                          setFormData({ ...formData, cotisation_validite: date } as any);
                        }}
                        onBlur={() => handleFieldSave('cotisation_validite', (formData as any).cotisation_validite)}
                        disabled={!isCreateMode && !canEdit()}
                        className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                          } ${isExpiredDate((formData as any).cotisation_validite)
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-gray-900 dark:text-dark-text-primary'
                          }`}
                      />
                    </div>

                    <div>
                      <label
                        className="mb-1 flex items-center text-sm font-medium text-gray-700 dark:text-dark-text-primary"
                        title="Certificat médical validité Lifras"
                      >
                        <Calendar className="mr-1 h-4 w-4 flex-shrink-0" />
                        <span>Certif. méd. validité</span>
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue((formData as any).certificat_medical_validite)}
                        onChange={(e) => {
                          const date = e.target.value ? new Date(e.target.value) : null;
                          setFormData({ ...formData, certificat_medical_validite: date } as any);
                        }}
                        onBlur={() => handleFieldSave('certificat_medical_validite', (formData as any).certificat_medical_validite)}
                        disabled={!isCreateMode && !canEdit()}
                        className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : ''
                          } ${isExpiredDate((formData as any).certificat_medical_validite)
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-gray-900 dark:text-dark-text-primary'
                          }`}
                      />
                    </div>

                    <div>
                      <label
                        className="mb-1 flex items-center text-sm font-medium text-gray-700 dark:text-dark-text-primary"
                        title="Certificat médical date d'édition"
                      >
                        <Calendar className="mr-1 h-4 w-4 flex-shrink-0" />
                        <span>Certif. méd. édition</span>
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue((formData as any).certificat_medical_date)}
                        onChange={(e) => {
                          const date = e.target.value ? new Date(e.target.value) : null;
                          setFormData({ ...formData, certificat_medical_date: date } as any);
                        }}
                        onBlur={() => handleFieldSave('certificat_medical_date', (formData as any).certificat_medical_date)}
                        disabled={!isCreateMode && !canEdit()}
                        className={`w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500 ${!isCreateMode && !canEdit() ? 'bg-gray-50 dark:bg-dark-bg-tertiary cursor-not-allowed' : 'text-gray-900 dark:text-dark-text-primary'
                          }`}
                      />
                    </div>
                  </div>

                  {membershipSummaryLine && (
                    <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                      {membershipSummaryLine}
                    </div>
                  )}

                  {/* Liaisons (transactions cotisation) */}
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-dark-text-primary mb-3 flex items-center gap-2">
                      <Link2 className="w-4 h-4" />
                      Liaisons
                    </h4>

                    {loadingTransactions ? (
                      <div className="text-sm text-gray-500 dark:text-dark-text-muted">Chargement...</div>
                    ) : linkedTransactions.length === 0 ? (
                      <div className="text-sm text-gray-400 dark:text-dark-text-muted italic">Aucune liaison</div>
                    ) : (
                      <div className="space-y-2">
                        {linkedTransactions.map(tx => {
                          const txDate = tx.date_execution instanceof Timestamp
                            ? tx.date_execution.toDate()
                            : new Date(tx.date_execution);
                          const linkedEntity = tx.matched_entities?.find(e => e.entity_type === 'member' && e.entity_id === user.id);
                          const cotisationDate = linkedEntity?.cotisation_date instanceof Timestamp
                            ? linkedEntity.cotisation_date.toDate()
                            : linkedEntity?.cotisation_date ? new Date(linkedEntity.cotisation_date) : null;

                          return (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <CreditCard className="w-4 h-4 text-green-600 flex-shrink-0" />
                                  <span className="font-medium text-green-800 dark:text-green-300 text-sm">
                                    Cotisation
                                  </span>
                                  <span className="text-green-600 dark:text-green-400 font-semibold text-sm">
                                    {formatMontant(tx.montant)}
                                  </span>
                                </div>
                                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                                  Transaction du {formatDate(txDate)}
                                  {cotisationDate && (
                                    <span className="ml-2">• Validité: {formatDate(cotisationDate)}</span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => navigate(`/transactions?openTransaction=${tx.id}`)}
                                className="p-1.5 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded transition-colors"
                                title="Voir la transaction"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* User ID & LIFRAS ID */}
                  <div className="bg-gray-50 dark:bg-dark-bg-tertiary p-3 rounded-lg space-y-1 mt-4">
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      ID utilisateur: <span className="font-mono font-medium text-gray-700 dark:text-dark-text-primary">{user.id}</span>
                    </p>
                    {(formData as any).lifras_id && (
                      <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                        ID LIFRAS: <span className="font-mono font-medium text-gray-700 dark:text-dark-text-primary">{(formData as any).lifras_id}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'permissions' && user && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-medium text-blue-900 mb-2">
                  Rôle actuel: {PermissionService.getRoleConfig(getRole(user)).label}
                </h3>
                <p className="text-sm text-blue-700">
                  {PermissionService.getRoleConfig(getRole(user)).description}
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

          {activeTab === 'exercices' && user && clubId && (
            <UserExercicesTab clubId={clubId} memberId={user.id} />
          )}

          {activeTab === 'app' && user && (
            <div className="space-y-6">
              {/* App Installation Status */}
              <div className={`p-4 rounded-lg border ${(user as any).app_installed
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-gray-50 dark:bg-dark-bg-tertiary border-gray-200 dark:border-dark-border'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${(user as any).app_installed
                    ? 'bg-green-100 dark:bg-green-900/30'
                    : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary'
                    }`}>
                    <Smartphone className={`w-6 h-6 ${(user as any).app_installed
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400 dark:text-dark-text-muted'
                      }`} />
                  </div>
                  <div>
                    <h3 className={`font-medium ${(user as any).app_installed
                      ? 'text-green-800 dark:text-green-200'
                      : 'text-gray-700 dark:text-dark-text-primary'
                      }`}>
                      {(user as any).app_installed ? 'CalyMob installée' : 'CalyMob non installée'}
                    </h3>
                    {(user as any).app_installed && (user as any).app_last_opened && (
                      <p className="text-sm text-green-600 dark:text-green-400">
                        Dernière ouverture: {formatDate((user as any).app_last_opened)}
                      </p>
                    )}
                  </div>
                </div>
              </div>



              {/* Web browser info - always show if we have browser data */}
              {(user as any).browser_name && (
                <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Informations navigateur
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Navigateur</label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {(user as any).browser_name} {(user as any).browser_version}
                        </p>
                        {getBrowserCompatibilityBadge(user, compatibilitySettings)}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Plateforme</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).device_type || 'Web'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Locale</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).device_locale || 'Inconnu'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Dernière connexion</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).web_last_login ? formatDate((user as any).web_last_login) : 'Inconnue'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {(user as any).app_installed && (
                <>
                  {/* Device Info */}
                  <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      Informations appareil
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Plateforme</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary flex items-center gap-2 mt-1">
                          {(user as any).app_platform === 'ios' ? (
                            <>
                              <span className="text-lg">🍎</span> iOS
                            </>
                          ) : (user as any).app_platform === 'android' ? (
                            <>
                              <span className="text-lg">🤖</span> Android
                            </>
                          ) : (
                            'Inconnu'
                          )}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Modèle</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).device_brand && (user as any).device_brand !== 'Apple' && (
                            <span className="text-gray-500 dark:text-dark-text-muted mr-1">{(user as any).device_brand}</span>
                          )}
                          {(user as any).device_model || 'Inconnu'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Version OS</label>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                            {(user as any).device_os_version || 'Inconnu'}
                          </p>
                          {getMobileCompatibilityBadge(user, compatibilitySettings)}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Version App</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).app_version || 'Inconnue'}
                          {(user as any).app_build_number && (
                            <span className="text-gray-500 dark:text-dark-text-muted ml-1">
                              (build {(user as any).app_build_number})
                            </span>
                          )}
                        </p>
                      </div>
                      {/* Nieuwe debug velden */}
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Locale</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).device_locale || 'Inconnu'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Timezone</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).device_timezone || 'Inconnu'}
                        </p>
                      </div>
                      {(user as any).device_screen_width && (user as any).device_screen_height && (
                        <div>
                          <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Écran</label>
                          <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                            {(user as any).device_screen_width}×{(user as any).device_screen_height}
                            {(user as any).device_pixel_ratio && (user as any).device_pixel_ratio !== 1 && (
                              <span className="text-gray-500 dark:text-dark-text-muted ml-1">
                                @{(user as any).device_pixel_ratio}x
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                      {(user as any).device_is_physical === false && (
                        <div>
                          <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Type</label>
                          <p className="font-medium text-orange-600 dark:text-orange-400 mt-1">
                            Simulateur/Émulateur
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Historique
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Première installation</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).app_first_installed ? formatDate((user as any).app_first_installed) : 'Inconnue'}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Dernière ouverture</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).app_last_opened ? formatDate((user as any).app_last_opened) : 'Inconnue'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Push Notifications */}
                  <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                      <Bell className="w-4 h-4" />
                      Notifications Push
                    </h4>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-dark-text-primary">Statut</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${(user as any).notifications_enabled
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                          : 'bg-gray-100 dark:bg-dark-bg-tertiary dark:bg-dark-bg-secondary text-gray-600 dark:text-dark-text-secondary'
                          }`}>
                          {(user as any).notifications_enabled ? 'Activées' : 'Désactivées'}
                        </span>
                      </div>
                      {(user as any).fcm_tokens && (user as any).fcm_tokens.length > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-dark-text-primary">Appareils enregistrés</span>
                          <span className="text-gray-900 dark:text-dark-text-primary font-medium">
                            {(user as any).fcm_tokens.length}
                          </span>
                        </div>
                      )}
                      {(user as any).fcm_token_updated_at && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-dark-text-primary">Dernière mise à jour token</span>
                          <span className="text-gray-900 dark:text-dark-text-primary">
                            {formatDate((user as any).fcm_token_updated_at)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Diagnostics (from CalyMob CrashlyticsService + DiagnosticService) */}
                  {((user as any).diag_biometric || (user as any).diag_errors) && (
                    <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Diagnostics
                      </h4>

                      {/* Biometric Status */}
                      {(user as any).diag_biometric && (
                        <div className="mb-4">
                          <h5 className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
                            <Fingerprint className="w-3 h-3" />
                            Biométrie
                          </h5>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700 dark:text-dark-text-primary">Disponible</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                (user as any).diag_biometric.available
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {(user as any).diag_biometric.available ? 'Oui' : 'Non'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-700 dark:text-dark-text-primary">Appareil supporté</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                (user as any).diag_biometric.deviceSupported
                                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                              }`}>
                                {(user as any).diag_biometric.deviceSupported ? 'Oui' : 'Non'}
                              </span>
                            </div>
                            {(user as any).diag_biometric.types && (
                              <div className="col-span-2">
                                <span className="text-sm text-gray-700 dark:text-dark-text-primary mr-2">Types:</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-dark-text-primary">
                                  {(user as any).diag_biometric.types || 'Aucun'}
                                </span>
                              </div>
                            )}
                            {(user as any).diag_biometric.error && (
                              <div className="col-span-2 bg-red-50 dark:bg-red-900/10 rounded p-2">
                                <span className="text-xs text-red-600 dark:text-red-400 font-mono">
                                  {(user as any).diag_biometric.error}
                                </span>
                              </div>
                            )}
                            {(user as any).diag_biometric.updated_at && (
                              <div className="col-span-2 text-xs text-gray-400 dark:text-dark-text-muted">
                                Mis à jour: {formatDate((user as any).diag_biometric.updated_at)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Recent Errors */}
                      {(user as any).diag_errors && (user as any).diag_errors.length > 0 && (
                        <div>
                          <h5 className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide mb-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Dernières erreurs ({(user as any).diag_errors.length})
                          </h5>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {((user as any).diag_errors as Array<{domain: string; message: string; detail?: string; timestamp: string}>).map((err, i) => (
                              <div key={i} className="bg-gray-50 dark:bg-dark-bg-secondary rounded p-2 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium text-gray-900 dark:text-dark-text-primary uppercase">
                                    {err.domain}
                                  </span>
                                  <span className="text-gray-400 dark:text-dark-text-muted">
                                    {err.timestamp ? new Date(err.timestamp).toLocaleString('fr-BE') : ''}
                                  </span>
                                </div>
                                <p className="text-gray-700 dark:text-dark-text-secondary">{err.message}</p>
                                {err.detail && (
                                  <p className="text-gray-500 dark:text-dark-text-muted font-mono mt-1 break-all">
                                    {err.detail}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Web Login Info (CalyCompta) */}
              {(user as any).device_platform === 'web' && (user as any).web_last_login && (
                <div className="bg-white dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-dark-text-primary mb-4 flex items-center gap-2">
                    <span className="text-lg">🌐</span>
                    Connexion Web (CalyCompta)
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Navigateur</label>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary">
                          {(user as any).browser_name || 'Inconnu'}
                          {(user as any).browser_version && (
                            <span className="text-gray-500 dark:text-dark-text-muted ml-1">
                              v{(user as any).browser_version}
                            </span>
                          )}
                        </p>
                        {getBrowserCompatibilityBadge(user, compatibilitySettings)}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Type</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).device_type || 'Desktop'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Locale</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).device_locale || 'Inconnu'}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Timezone</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {(user as any).device_timezone || 'Inconnu'}
                      </p>
                    </div>
                    {(user as any).device_screen_width && (user as any).device_screen_height && (
                      <div>
                        <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Écran</label>
                        <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                          {(user as any).device_screen_width}×{(user as any).device_screen_height}
                          {(user as any).device_pixel_ratio && (user as any).device_pixel_ratio !== 1 && (
                            <span className="text-gray-500 dark:text-dark-text-muted ml-1">
                              @{(user as any).device_pixel_ratio}x
                            </span>
                          )}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="text-xs text-gray-500 dark:text-dark-text-muted uppercase tracking-wide">Dernière connexion web</label>
                      <p className="font-medium text-gray-900 dark:text-dark-text-primary mt-1">
                        {formatDate((user as any).web_last_login)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!(user as any).app_installed && !(user as any).web_last_login && (
                <div className="bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-200 dark:border-dark-border rounded-lg p-6 text-center">
                  <Smartphone className="w-12 h-12 text-gray-300 dark:text-dark-text-muted mx-auto mb-3" />
                  <p className="text-gray-600 dark:text-dark-text-secondary">
                    Ce membre n'a pas encore installé l'application CalyMob.
                  </p>
                  <p className="text-sm text-gray-500 dark:text-dark-text-muted mt-2">
                    Les informations apparaîtront ici une fois l'app installée et ouverte.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Onglet Médical */}
          {activeTab === 'medical' && user && (
            <MedicalTab
              user={user}
              clubId={clubId!}
              currentUserId={firebaseAuthUser?.uid}
              currentUserName={currentUser?.displayName || currentUser?.email}
              canEdit={canEdit()}
              onUpdate={(updates) => {
                if (onUpdate) {
                  onUpdate(user.id, updates);
                }
              }}
            />
          )}

          {/* Onglet Documents */}
          {activeTab === 'documents' && user && (
            <DocumentsTab
              user={user}
              clubId={clubId!}
              currentUserId={firebaseAuthUser?.uid}
              currentUserName={currentUser?.displayName || currentUser?.email}
              canEdit={canEdit()}
              onUpdate={(updates) => {
                if (onUpdate) {
                  onUpdate(user.id, updates);
                }
              }}
            />
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
                    className="w-full h-10 px-3 border border-gray-300 dark:border-dark-border rounded-lg focus:ring-2 focus:ring-blue-500"
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

      {/* IBAN Lookup Modal */}
      {showIbanLookup && clubId && (
        <IbanLookupModal
          clubId={clubId}
          firstName={formData.firstName || ''}
          lastName={formData.lastName || ''}
          currentIban={(formData as any).iban}
          onSelect={(iban) => {
            setFormData({ ...formData, iban } as any);
            handleFieldSave('iban', iban);
            setShowIbanLookup(false);
            toast.success('IBAN selectionne');
          }}
          onClose={() => setShowIbanLookup(false)}
        />
      )}
    </>
  );
}
