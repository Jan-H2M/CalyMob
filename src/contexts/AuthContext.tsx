import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Membre, UserRole, UserStatus } from '@/types';
import { Permission, UserSession } from '@/types/user.types';
import { PermissionService } from '@/services/permissionService';
import { SessionService } from '@/services/sessionService';
import { SessionValidator } from '@/utils/sessionValidator';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { UserService } from '@/services/userService';
import { aiProviderService } from '@/services/aiProviderService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// 🚨 MODE DEBUG: Désactiver complètement le système de session
// IMPORTANT: Remettre à false après résolution du problème de déconnexion
const DISABLE_SESSION_SYSTEM = false;

// Global promise to track permission initialization
let permissionsInitialized: Promise<void> | null = null;

interface AuthContextType {
  user: FirebaseUser | null;
  appUser: Membre | null;  // Changed from AppUser to Membre (unified type)
  loading: boolean;
  clubId: string;
  isEmulator: boolean;
  session: UserSession | null;
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
}

export function AuthProvider({ children, value }: AuthProviderProps) {
  const [appUser, setAppUser] = useState<Membre | null>(null);  // Changed from AppUser to Membre
  const [session, setSession] = useState<UserSession | null>(null);
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
        const firebaseUser = value.user;

        // ✅ CRITICAL FIX: Must call getIdTokenResult() to get custom claims
        // Custom claims are NOT available directly on the user object
        await firebaseUser.getIdToken(true); // Force refresh token
        const tokenResult = await firebaseUser.getIdTokenResult();
        const customClaims = tokenResult.claims;

        console.log('🔐 Custom claims loaded:', customClaims);

        // Try to get clubId from custom claims first, fallback to 'calypso'
        const clubId = customClaims.clubId || 'calypso';

        // Fetch user data from Firestore
        let firestoreUserData: any = null;
        try {
          const userDocPath = `clubs/${clubId}/members/${firebaseUser.uid}`;
          console.log('🔍 Looking for user document at:', userDocPath);
          console.log('🔍 User UID:', firebaseUser.uid);
          console.log('🔍 User email:', firebaseUser.email);

          const userDocRef = doc(db, userDocPath);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            firestoreUserData = userDocSnap.data();
            console.log('✅ Loaded user data from Firestore:', firestoreUserData);
            console.log('🔍 [AuthContext] security field:', firestoreUserData.security);
            console.log('🔍 [AuthContext] security.requirePasswordChange:', firestoreUserData?.security?.requirePasswordChange);
          } else {
            console.warn('⚠️ User document not found in Firestore at path:', userDocPath);
            console.warn('⚠️ This user needs to be created in Firestore with role assignment');
          }
        } catch (error) {
          console.error('❌ Error loading user from Firestore:', error);
        }

        // 🔥 CRITICAL: Custom claims from Firebase Auth take precedence over Firestore
        // This prevents the bug where role reverts to 'user' after token refresh
        // when custom claims are missing/outdated in Firebase Auth

        // Priority order for role/status:
        // 1. Custom claims (Firebase Auth token) - most reliable, included in every request
        // 2. Firestore data - can be outdated if not synced with custom claims
        // 3. Default fallback - 'user' role

        const appUserData: Membre = {
          // Identification
          id: firebaseUser.uid,
          email: firebaseUser.email || '',

          // Identité
          nom: firestoreUserData?.nom || firestoreUserData?.lastName || firestoreUserData?.['Last Name'] || '',
          prenom: firestoreUserData?.prenom || firestoreUserData?.firstName || firestoreUserData?.['First Name'] || '',
          displayName: firestoreUserData?.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Utilisateur',

          // Contact
          telephone: firestoreUserData?.telephone || firestoreUserData?.phoneNumber || firebaseUser.phoneNumber,
          phoneNumber: firestoreUserData?.phoneNumber || firestoreUserData?.telephone || firebaseUser.phoneNumber,
          photoURL: firestoreUserData?.photoURL || firebaseUser.photoURL,

          // Plongée (optionnel - champs du membre club)
          lifras_id: firestoreUserData?.lifras_id,
          nr_febras: firestoreUserData?.nr_febras,
          niveau_plongee: firestoreUserData?.niveau_plongee,

          // Accès application (nouveaux champs unifiés)
          // ✅ FIXED: Custom claims take precedence to prevent role reversion bug
          has_app_access: true,  // Si utilisateur connecté, a forcément accès app
          app_role: (customClaims.role || firestoreUserData?.app_role || firestoreUserData?.role || 'user') as UserRole,
          app_status: (customClaims.status || firestoreUserData?.app_status || firestoreUserData?.status || 'active') as UserStatus,
          lastLogin: new Date(firebaseUser.metadata.lastSignInTime || Date.now()),
          customPermissions: customClaims.customPermissions,

          // Statut membre club (nouveaux champs unifiés)
          member_status: firestoreUserData?.member_status || 'active',
          is_diver: firestoreUserData?.is_diver || false,
          has_lifras: firestoreUserData?.has_lifras || !!firestoreUserData?.lifras_id,

          // Métadonnées
          createdAt: firestoreUserData?.createdAt?.toDate?.() || new Date(firebaseUser.metadata.creationTime || Date.now()),
          updatedAt: firestoreUserData?.updatedAt?.toDate?.() || new Date(firebaseUser.metadata.lastSignInTime || Date.now()),

          // Legacy fields (backward compatibility)
          // ✅ FIXED: Custom claims take precedence for isActive status
          isActive: customClaims.isActive !== false && firestoreUserData?.isActive !== false && firestoreUserData?.actif !== false,
          actif: firestoreUserData?.actif !== false,
          role: customClaims.role || firestoreUserData?.role,
          status: customClaims.status || firestoreUserData?.status,
          clubId: clubId,

          // Password management
          requirePasswordChange: firestoreUserData?.security?.requirePasswordChange === true,

          // Security metadata
          security: firestoreUserData?.security,
        };

        // Initialize permissions from Firebase if not already done
        if (!PermissionService.isReady() && !permissionsInitialized) {
          console.log('🔄 Initializing permissions for clubId:', clubId);
          permissionsInitialized = PermissionService.initialize(clubId);
        }

        // Wait for permissions to be initialized
        if (permissionsInitialized) {
          await permissionsInitialized;
        }

        // Initialize AI Provider Service with keys from Firebase
        try {
          console.log('🤖 [AuthContext] Loading AI API keys from Firebase...');
          await aiProviderService.loadFromFirebase(clubId);
          console.log('✅ [AuthContext] AI Provider Service initialized');
        } catch (error) {
          console.error('❌ [AuthContext] Failed to load AI API keys:', error);
          // Non-blocking: continue even if AI keys fail to load
        }

        setAppUser(appUserData);

        const userSession: UserSession = {
          user: appUserData,
          permissions: PermissionService.getUserPermissions(appUserData),
          isEmulator: isEmulator
        };
        setSession(userSession);

        // Log successful login to audit trail
        UserService.logLogin(
          clubId,
          firebaseUser.uid,
          firebaseUser.email || 'unknown',
          appUserData.displayName,
          true
        ).catch(err => console.error('Failed to log login:', err));

        // 🚨 MODE DEBUG: Système de session désactivé
        if (!DISABLE_SESSION_SYSTEM) {
          // Vérifier si une session existe déjà et si elle est valide
          try {
            const sessionExists = await SessionService.validateSession(clubId, firebaseUser.uid);

            if (!sessionExists) {
              // Pas de session ou session invalide → En créer une nouvelle
              console.log('🔐 Création nouvelle session Firestore');
              await SessionService.createSession(firebaseUser.uid, clubId);
            } else {
              // Session valide existe déjà → Mettre à jour l'activité
              console.log('✅ Session Firestore existante valide, mise à jour activité');
              await SessionService.updateSessionActivity(clubId, firebaseUser.uid);
            }
          } catch (error) {
            console.error('❌ Erreur gestion session Firestore:', error);
            // En cas d'erreur, créer quand même une session pour ne pas bloquer l'utilisateur
            try {
              await SessionService.createSession(firebaseUser.uid, clubId);
            } catch (createError) {
              console.error('❌ Erreur création session de secours:', createError);
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
          console.warn('⚠️ MODE DEBUG: Système de session DÉSACTIVÉ - Pas de timeout automatique');
        }
      } else {
        // User logged out, reset
        setAppUser(null);
        setSession(null);
        SessionService.resetSessionId();
      }
    };

    initializeUser();
  }, [value?.user, isEmulator]);

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
      let firestoreUserData: any = null;
      try {
        const userDocPath = `clubs/${clubId}/members/${value.user.uid}`;
        const userDocRef = doc(db, userDocPath);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          firestoreUserData = userDocSnap.data();
        }
      } catch (error) {
        console.error('❌ Error loading user from Firestore during refresh:', error);
      }

      // ✅ CRITICAL: Custom claims take precedence, fallback to Firestore, then existing appUser data
      // This prevents role reversion when token refreshes
      const updatedUser: Membre = {
        ...appUser!,
        app_role: (customClaims.role || firestoreUserData?.app_role || appUser?.app_role || 'user') as UserRole,
        app_status: (customClaims.status || firestoreUserData?.app_status || appUser?.app_status || 'active') as UserStatus,
        role: customClaims.role || firestoreUserData?.role || appUser?.role,
        status: customClaims.status || firestoreUserData?.status || appUser?.status,
        isActive: customClaims.isActive !== false && (firestoreUserData?.isActive !== false || appUser?.isActive !== false),
        customPermissions: customClaims.customPermissions as Permission[] || appUser?.customPermissions,
        lastLogin: new Date()
      };

      console.log('🔄 User data refreshed. Role:', updatedUser.app_role, 'Status:', updatedUser.app_status);

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
    loading: value?.loading || false,
    clubId: appUser?.clubId || 'calypso',
    isEmulator,
    session,
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