import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { User as FirebaseUser } from 'firebase/auth';
import { Membre, UserRole, UserStatus } from '@/types';
import { Permission, UserSession } from '@/types/user.types';
import { PermissionService } from '@/services/permissionService';
import { SessionService } from '@/services/sessionService';
import { SessionValidator } from '@/utils/sessionValidator';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { UserService } from '@/services/userService';
import { aiProviderService } from '@/services/aiProviderService';
import { AccountCodeService } from '@/services/accountCodeService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  getFirstName,
  getLastName,
  getDisplayName,
  getPhone,
  getRole,
  getStatus,
  isActive as isUserActive,
  resolveSessionRole,
  requiresPasswordChange as userRequiresPasswordChange,
  canAccessCalyCompta,
} from '@/utils/fieldMapper';

// 🚨 MODE DEBUG: Désactiver complètement le système de session
// IMPORTANT: Remettre à false après résolution du problème de déconnexion
const DISABLE_SESSION_SYSTEM = false;

// Global promise to track permission initialization
let permissionsInitialized: Promise<void> | null = null;

// Login logging debounce to prevent duplicate audit entries
// (React Strict Mode and Firebase auth state changes can trigger multiple calls)
let lastLoginLogTime: number = 0;
let lastLoginUserId: string = '';
const LOGIN_LOG_DEBOUNCE_MS = 10000; // 10 seconds cooldown per user

interface AuthContextType {
  user: FirebaseUser | null;
  appUser: Membre | null;  // Changed from AppUser to Membre (unified type)
  loading: boolean;
  initializing: boolean;  // True while initializeUser() is running (permissions loading)
  clubId: string;
  isEmulator: boolean;
  session: UserSession | null;
  compatibilityWarning: {
    warningLevel: 'none' | 'info' | 'warning' | 'error';
    message: string | null;
  } | null;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  canManageUser: (targetRole: UserRole) => boolean;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  value?: Partial<AuthContextType>;
  onInitialized?: () => void;  // Callback when user initialization is complete
}

export function AuthProvider({ children, value, onInitialized }: AuthProviderProps) {
  const [appUser, setAppUser] = useState<Membre | null>(null);  // Changed from AppUser to Membre
  const [session, setSession] = useState<UserSession | null>(null);
  const [initializing, setInitializing] = useState(true);  // Track initializeUser() completion
  const [compatibilityWarning, setCompatibilityWarning] = useState<{
    warningLevel: 'none' | 'info' | 'warning' | 'error';
    message: string | null;
  } | null>(null);
  const [isEmulator] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hostname === 'localhost' ||
             window.location.hostname === '127.0.0.1';
    }
    return false;
  });

  useEffect(() => {
    const initializeUser = async () => {
      if (value?.user) {
        setInitializing(true);  // Start initialization - keep loading until complete
        const firebaseUser = value.user;

        // ✅ CRITICAL FIX: Must call getIdTokenResult() to get custom claims
        // Custom claims are NOT available directly on the user object
        await firebaseUser.getIdToken(true); // Force refresh token
        const tokenResult = await firebaseUser.getIdTokenResult();
        const customClaims = tokenResult.claims;

        logger.debug('🔐 Custom claims loaded:', customClaims);

        // Try to get clubId from custom claims first, fallback to 'calypso'
        const clubId = customClaims.clubId || 'calypso';

        // Fetch user data from Firestore
        let firestoreUserData: Partial<Membre> & Record<string, unknown> | null = null;
        try {
          const userDocPath = `clubs/${clubId}/members/${firebaseUser.uid}`;
          logger.debug('🔍 Looking for user document at:', userDocPath);
          logger.debug('🔍 User UID:', firebaseUser.uid);
          logger.debug('🔍 User email:', firebaseUser.email);

          const userDocRef = doc(db, userDocPath);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            firestoreUserData = userDocSnap.data();
            logger.debug('✅ Loaded user data from Firestore:', firestoreUserData);
            logger.debug('🔍 [AuthContext] security field:', firestoreUserData.security);
            logger.debug('🔍 [AuthContext] security.requirePasswordChange:', firestoreUserData?.security?.requirePasswordChange);
          } else {
            logger.warn('⚠️ User document not found in Firestore at path:', userDocPath);
            logger.warn('⚠️ This user needs to be created in Firestore with role assignment');
          }
        } catch (error) {
          logger.error('❌ Error loading user from Firestore:', error);
        }

        // 🔥 CRITICAL: Custom claims from Firebase Auth take precedence over Firestore
        // This prevents the bug where role reverts to 'user' after token refresh
        // when custom claims are missing/outdated in Firebase Auth

        // Priority order for role/status:
        // 1. Custom claims (Firebase Auth token) - most reliable, included in every request
        // 2. Firestore data - can be outdated if not synced with custom claims
        // 3. Default fallback - 'user' role

        // ✅ Use Field Mapper for consistent field access
        // Combine Firebase user, custom claims, and Firestore data
        const effectiveRole = resolveSessionRole({
          tokenRole: customClaims.app_role,
          firestoreRole: firestoreUserData?.app_role ?? firestoreUserData?.role,
          firestoreHasAppAccess: firestoreUserData?.has_app_access,
        });
        const combinedUserData = {
          ...firestoreUserData,
          // Custom claims from Firebase Auth (highest priority)
          app_role: effectiveRole,
          role: effectiveRole,
          // Only override status fields if claims actually have them
          // (prevents overwriting Firestore 'active' with undefined)
          ...(customClaims.status != null ? { app_status: customClaims.status, status: customClaims.status } : {}),
        };

        const appUserData: Membre = {
          // Identification
          id: firebaseUser.uid,
          email: firebaseUser.email || '',

          // Identité - Use Field Mapper with fallbacks
          nom: getLastName(combinedUserData) || firestoreUserData?.['Last Name'] || '',
          prenom: getFirstName(combinedUserData) || firestoreUserData?.['First Name'] || '',
          // Note: getDisplayName returns 'Unknown User' as fallback, so we check explicitly
          displayName: (() => {
            const displayNameResult = getDisplayName(combinedUserData);
            if (displayNameResult && displayNameResult !== 'Unknown User') return displayNameResult;
            if (firebaseUser.displayName) return firebaseUser.displayName;
            if (firebaseUser.email) return firebaseUser.email.split('@')[0];
            return 'Utilisateur';
          })(),
          firstName: getFirstName(combinedUserData) || undefined,
          lastName: getLastName(combinedUserData) || undefined,

          // Contact - Use Field Mapper
          telephone: getPhone(combinedUserData) || firebaseUser.phoneNumber,
          phoneNumber: getPhone(combinedUserData) || firebaseUser.phoneNumber,
          photoURL: firestoreUserData?.photoURL || firebaseUser.photoURL,

          // Plongée (optionnel - champs du membre club)
          lifras_id: firestoreUserData?.lifras_id,
          nr_febras: firestoreUserData?.nr_febras,
          niveau_plongee: firestoreUserData?.niveau_plongee,

          // Accès application (nouveaux champs unifiés)
          has_app_access: firestoreUserData?.has_app_access !== false,
          app_role: getRole(combinedUserData),
          app_status: getStatus(combinedUserData),
          lastLogin: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
          customPermissions: customClaims.customPermissions,

          // Statut membre club (nouveaux champs unifiés)
          member_status: firestoreUserData?.member_status || 'active',
          is_diver: firestoreUserData?.is_diver || false,
          has_lifras: firestoreUserData?.has_lifras || !!firestoreUserData?.lifras_id,

          // Métadonnées
          createdAt: firestoreUserData?.createdAt?.toDate?.() || new Date(firebaseUser.metadata.creationTime || Date.now()),
          updatedAt: firestoreUserData?.updatedAt?.toDate?.() || new Date(firebaseUser.metadata.lastSignInTime || Date.now()),

          // Legacy fields (backward compatibility) - Use Field Mapper
          // ✅ FIXED: Custom claims take precedence for isActive status
          isActive: isUserActive(combinedUserData),
          actif: isUserActive(combinedUserData),
          role: getRole(combinedUserData),
          status: getStatus(combinedUserData),
          clubId: clubId,

          // Password management - Use Field Mapper
          requirePasswordChange: userRequiresPasswordChange(combinedUserData),

          // Security metadata
          security: firestoreUserData?.security,
        };

        // Initialize permissions from Firebase if not already done
        if (!PermissionService.isReady() && !permissionsInitialized) {
          logger.debug('🔄 Initializing permissions for clubId:', clubId);
          permissionsInitialized = PermissionService.initialize(clubId);
        }

        // Wait for permissions to be initialized
        if (permissionsInitialized) {
          await permissionsInitialized;
        }

        // Initialize AccountCodeService with codes from Firebase
        try {
          logger.debug('📊 [AuthContext] Loading account codes from Firebase...');
          await AccountCodeService.loadCodes(clubId);
          logger.debug('✅ [AuthContext] AccountCodeService initialized');
        } catch (error) {
          logger.error('❌ [AuthContext] Failed to load account codes:', error);
          // Non-blocking: service has static fallback
        }

        // Initialize AI Provider Service with keys from Firebase
        // ⚠️ CRITICAL: Only admins can access AI API keys - skip for regular users
        if (appUserData.app_role !== 'user') {
          try {
            logger.debug('🤖 [AuthContext] Loading AI API keys from Firebase...');
            await aiProviderService.loadFromFirebase(clubId);
            logger.debug('✅ [AuthContext] AI Provider Service initialized');
          } catch (error) {
            logger.error('❌ [AuthContext] Failed to load AI API keys:', error);
            // Non-blocking: continue even if AI keys fail to load
          }
        } else {
          logger.debug('⏸️ [AuthContext] User role cannot access AI API keys, skipping');
        }

        setAppUser(appUserData);

        const userSession: UserSession = {
          user: appUserData,
          permissions: PermissionService.getUserPermissions(appUserData),
          isEmulator: isEmulator
        };
        setSession(userSession);
        setInitializing(false);  // Initialization complete - permissions and user data ready

        // Notify App.tsx that initialization is complete
        onInitialized?.();

        // Log successful login to audit trail (with debounce to prevent duplicates)
        // Skip audit log for membre-only accounts — they get blocked by LoginForm
        // and should not appear as successful CalyCompta logins
        const now = Date.now();
        const isSameUser = lastLoginUserId === firebaseUser.uid;
        const isWithinDebounce = now - lastLoginLogTime < LOGIN_LOG_DEBOUNCE_MS;
        const isCalyComptaUser = canAccessCalyCompta(appUserData);

        if (isCalyComptaUser && (!isSameUser || !isWithinDebounce)) {
          lastLoginLogTime = now;
          lastLoginUserId = firebaseUser.uid;
          UserService.logLogin(
            clubId,
            firebaseUser.uid,
            firebaseUser.email || 'unknown',
            appUserData.displayName,
            true
          ).catch(err => logger.error('Failed to log login:', err));
        }

        // Save web device info for debugging
        SessionService.saveDeviceInfoToMember(clubId, firebaseUser.uid)
          .then(() => {
            logger.debug('✅ Browser info saved, triggering user list reload');
            // Dispatch custom event to trigger UserManagement reload
            window.dispatchEvent(new CustomEvent('user-data-updated'));
          })
          .catch(err => logger.warn('Failed to save web device info:', err));

        // Check browser compatibility warning from sessionStorage
        const warningData = sessionStorage.getItem('browserCompatibilityWarning');
        if (warningData) {
          try {
            setCompatibilityWarning(JSON.parse(warningData));
          } catch (e) {
            logger.warn('Failed to parse compatibility warning:', e);
          }
        }

        // 🚨 MODE DEBUG: Système de session désactivé
        if (!DISABLE_SESSION_SYSTEM) {
          // Vérifier si une session existe déjà et si elle est valide
          try {
            const sessionExists = await SessionService.validateSession(clubId, firebaseUser.uid);

            if (!sessionExists) {
              // Pas de session ou session invalide → En créer une nouvelle
              logger.debug('🔐 Création nouvelle session Firestore');
              await SessionService.createSession(firebaseUser.uid, clubId);
            } else {
              // Session valide existe déjà → Mettre à jour l'activité
              logger.debug('✅ Session Firestore existante valide, mise à jour activité');
              await SessionService.updateSessionActivity(clubId, firebaseUser.uid);
            }
          } catch (error) {
            logger.error('❌ Erreur gestion session Firestore:', error);
            // En cas d'erreur, créer quand même une session pour ne pas bloquer l'utilisateur
            try {
              await SessionService.createSession(firebaseUser.uid, clubId);
            } catch (createError) {
              logger.error('❌ Erreur création session de secours:', createError);
            }
          }

          // NOTE: Vérification périodique désactivée temporairement
          // Le hook useIdleTimer gère déjà la déconnexion pour inactivité
          // La vérification périodique sera réactivée après tests

          // const cleanupPeriodicCheck = SessionValidator.startPeriodicSessionCheck(clubId, 30);

          // Cleanup au démontage
          // return () => {
          //   cleanupPeriodicCheck();
          // };
        } else {
          logger.warn('⚠️ MODE DEBUG: Système de session DÉSACTIVÉ - Pas de timeout automatique');
        }
      } else {
        // User logged out, reset
        setAppUser(null);
        setSession(null);
        setInitializing(false);  // No user = not initializing
        SessionService.resetSessionId();

        // Notify App.tsx that initialization is complete (no user case)
        onInitialized?.();
      }
    };

    initializeUser();
  }, [value?.user, isEmulator, onInitialized]);

  const hasPermission = (permission: Permission): boolean => {
    if (!appUser) return false;
    return PermissionService.hasPermission(appUser, permission);
  };

  const hasAnyPermission = (permissions: Permission[]): boolean => {
    if (!appUser) return false;
    return PermissionService.hasAnyPermission(appUser, permissions);
  };

  const hasAllPermissions = (permissions: Permission[]): boolean => {
    if (!appUser) return false;
    return PermissionService.hasAllPermissions(appUser, permissions);
  };

  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!appUser) return false;

    if (Array.isArray(role)) {
      return role.includes(appUser.app_role);
    }
    return appUser.app_role === role;
  };

  const canManageUser = (targetRole: UserRole): boolean => {
    if (!appUser) return false;
    return PermissionService.canManageUser(appUser, targetRole);
  };


  const refreshUserData = async (): Promise<void> => {
    if (value?.user) {
      await value.user.reload();
      const idTokenResult = await value.user.getIdTokenResult(true);
      const customClaims = idTokenResult.claims;

      // Fetch latest Firestore data
      const clubId = customClaims.clubId || appUser?.clubId || 'calypso';
      let firestoreUserData: Partial<Membre> & Record<string, unknown> | null = null;
      try {
        const userDocPath = `clubs/${clubId}/members/${value.user.uid}`;
        const userDocRef = doc(db, userDocPath);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          firestoreUserData = userDocSnap.data();
        }
      } catch (error) {
        logger.error('❌ Error loading user from Firestore during refresh:', error);
      }

      // ✅ CRITICAL: Custom claims take precedence, fallback to Firestore, then existing appUser data
      // This prevents role reversion when token refreshes
      // Use Field Mapper for consistent field access
      const effectiveRole = resolveSessionRole({
        tokenRole: customClaims.app_role,
        firestoreRole: firestoreUserData?.app_role ?? firestoreUserData?.role ?? appUser?.app_role ?? appUser?.role,
        firestoreHasAppAccess: firestoreUserData?.has_app_access ?? appUser?.has_app_access,
      });
      const combinedRefreshData = {
        ...firestoreUserData,
        ...appUser,
        // Custom claims from Firebase Auth (highest priority)
        app_role: effectiveRole,
        role: effectiveRole,
        // Only override status fields if claims actually have them
        ...(customClaims.status != null ? { app_status: customClaims.status, status: customClaims.status } : {}),
      };

      const updatedUser: Membre = {
        ...appUser!,
        has_app_access: firestoreUserData?.has_app_access !== false,
        app_role: getRole(combinedRefreshData),
        app_status: getStatus(combinedRefreshData),
        role: getRole(combinedRefreshData),
        status: getStatus(combinedRefreshData),
        isActive: isUserActive(combinedRefreshData),
        customPermissions: customClaims.customPermissions as Permission[] || appUser?.customPermissions,
        lastLogin: new Date()
      };

      logger.debug('🔄 User data refreshed. Role:', updatedUser.app_role, 'Status:', updatedUser.app_status);

      setAppUser(updatedUser);

      const updatedSession: UserSession = {
        user: updatedUser,
        permissions: PermissionService.getUserPermissions(updatedUser),
        isEmulator: isEmulator
      };
      setSession(updatedSession);
    }
  };

  const contextValue: AuthContextType = {
    user: value?.user || null,
    appUser,
    loading: value?.loading || initializing,  // Combined: true if either Firebase or user data is loading
    initializing,  // Specifically tracks initializeUser() completion
    clubId: appUser?.clubId || 'calypso',
    isEmulator,
    session,
    compatibilityWarning,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    canManageUser,
    refreshUserData
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider');
  }
  return context;
}
