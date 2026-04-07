import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { logger } from '@/utils/logger';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  BarChart3,
  CreditCard,
  Calendar,
  Receipt,
  LogOut,
  Menu,
  X,
  User,
  Users,
  Settings,
  FileText,
  Waves,
  Warehouse,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { signOut, isTestEnvironment } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { PermissionService } from '@/services/permissionService';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { useCarnetFormationGuard } from '@/hooks/useFeatureFlags';
import { IdleWarningModal } from '@/components/auth/IdleWarningModal';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { SessionService } from '@/services/sessionService';
import { UserService } from '@/services/userService';
import { DarkModeToggle } from './DarkModeToggle';
import { ArchiveBanner } from './ArchiveBanner';
import { FiscalYearFilterWarningBanner } from './FiscalYearFilterWarningBanner';
import PasswordChangeModal from '@/components/auth/PasswordChangeModal';
import { requiresPasswordChange, getRole, isAdmin } from '@/utils/fieldMapper';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { ForceRefreshModal } from '@/components/commun/ForceRefreshModal';
import { BugReportProvider, useBugReport } from '@/components/commun/BugReportOverlay';
import { Bug } from 'lucide-react';

// Bug Report Button — utilise le context BugReportProvider
function BugReportButton({ collapsed }: { collapsed: boolean }) {
  const { activate } = useBugReport();
  if (collapsed) {
    return (
      <button
        onClick={activate}
        title="Signaler un bug"
        className="w-full flex justify-center py-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
      >
        <Bug className="h-4 w-4" />
      </button>
    );
  }
  return (
    <button
      onClick={activate}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
    >
      <Bug className="h-4 w-4" />
      Signaler un bug
    </button>
  );
}

// Calypso Logo Component
const CalypsoLogo = ({ variant = 'horizontal', className = '' }: { variant?: 'horizontal' | 'icon', className?: string }) => {
  const [imageError, setImageError] = React.useState(false);

  if (imageError) {
    // Fallback to text version
    return (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-calypso-blue rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">C</span>
        </div>
        {variant === 'horizontal' && (
          <span className="text-xl font-bold text-gray-900 dark:text-dark-text-primary">Calypso</span>
        )}
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <img
        src="/logo-vertical.svg"
        alt="Calypso Diving Club"
        className={cn("h-12 w-auto", className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <img
      src="/logo-horizontal.svg"
      alt="Calypso Diving Club"
      className={cn("w-full h-auto", className)}
      onError={() => setImageError(true)}
    />
  );
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, appUser, hasPermission, clubId, compatibilityWarning } = useAuth();
  const { visible: showFormation } = useCarnetFormationGuard(clubId);
  const { isArchiveMode } = useFiscalYear();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(() => {
    try { return localStorage.getItem('calypso-sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [showPasswordChange, setShowPasswordChange] = React.useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    autoLogoutEnabled: true,
    idleTimeoutMinutes: 15,       // 15 minutes par défaut
    warningBeforeMinutes: 2       // 2 minutes d'avertissement
  });

  // Version check - simple one-time Firestore read
  const { needsRefresh, message, currentVersion, refreshApp } = useVersionCheck();

  // Titel aanpassen in testomgeving
  useEffect(() => {
    if (isTestEnvironment) {
      document.title = '⚠️ TEST - CalyCompta';
    } else {
      document.title = 'CalyCompta - Comptabilité Calypso DC';
    }
  }, []);

  // Vérifier si le changement de mot de passe est requis
  useEffect(() => {
    const needsPasswordChange = requiresPasswordChange(appUser);

    logger.debug('🔍 [LAYOUT] Checking requirePasswordChange:', {
      appUser: appUser?.email,
      hasSecurityField: !!appUser?.security,
      securityField: appUser?.security,
      requirePasswordChangeFromSecurity: appUser?.security?.requirePasswordChange,
      requirePasswordChangeDirect: appUser?.requirePasswordChange,
      needsPasswordChange,
      showPasswordChange
    });

    if (needsPasswordChange) {
      logger.debug('⚠️ [LAYOUT] SHOWING PASSWORD CHANGE MODAL for:', appUser?.email);
      setShowPasswordChange(true);
    } else {
      logger.debug('✓ [LAYOUT] No password change required');
      if (appUser) {
        logger.debug('🔍 [LAYOUT] Full appUser.security object:', JSON.stringify(appUser.security, null, 2));
      }
    }
  }, [appUser, showPasswordChange]);

  // Charger les paramètres de sécurité
  useEffect(() => {
    const loadSettings = async () => {
      logger.debug('🔐 [LAYOUT] Chargement des paramètres de sécurité pour clubId:', clubId);
      const settings = await FirebaseSettingsService.loadSecuritySettings(clubId);
      logger.debug('✅ [LAYOUT] Paramètres de sécurité chargés depuis Firestore:', settings);
      setSecuritySettings(settings);
    };
    loadSettings();
  }, [clubId]);

  // 🔒 USER ISOLATION: Simplified navigation for 'user' role
  // Memoized to prevent unnecessary re-renders
  // NOTE: App.tsx now waits for AuthContext initialization before rendering Layout,
  // so we can trust that appUser and permissions are fully loaded here
  const navigation = useMemo(() => {
    const userRole = getRole(appUser);
    const userIsAdmin = isAdmin(appUser);

    // User role gets simplified menu with Membres visible but disabled
    if (userRole === 'user') {
      return [
        { name: 'Accueil', href: '/accueil', icon: Home },
        { name: 'Mes Activités', href: '/operations', icon: Calendar },
        { name: 'Mes Dépenses', href: '/depenses', icon: Receipt },
        { name: 'Membres', href: '/membres', icon: Users, disabled: true },
      ];
    }

    // Admin/validateur: Full menu with permission checks
    return [
      { name: 'Accueil', href: '/accueil', icon: Home },
      ...(hasPermission('dashboard.view') ? [{ name: 'Tableau de bord', href: '/tableau-bord', icon: BarChart3 }] : []),
      { name: 'Transactions', href: '/transactions', icon: CreditCard },
      { name: 'Dépenses', href: '/depenses', icon: Receipt },
      { name: 'Activités', href: '/operations', icon: Calendar },
      ...(userIsAdmin ? [{ name: 'Piscine', href: '/piscine', icon: Waves }] : []),
      ...(showFormation ? [{ name: 'Formation', href: '/formation', icon: GraduationCap }] : []),
      { name: 'Membres', href: '/membres', icon: Users, disabled: !userIsAdmin },
      ...(userIsAdmin ? [{ name: 'Stock', href: '/stock', icon: Warehouse }] : []),
      ...(hasPermission('settings.view') ? [{ name: 'Paramètres', href: '/parametres', icon: Settings }] : []),
    ];
  }, [appUser, hasPermission, showFormation]);

  const handleLogout = async () => {
    try {
      // Log logout to audit trail
      if (appUser && user) {
        await UserService.logLogout(
          clubId,
          user.uid,
          user.email || 'unknown',
          appUser.displayName || 'Unknown',
          'manual'
        );
      }

      // Terminer la session Firestore
      await SessionService.terminateSession(clubId);

      // Déconnexion Firebase
      await signOut();

      toast.success('Déconnexion réussie');
      window.location.href = 'https://caly.club/';
    } catch (error) {
      toast.error('Erreur lors de la déconnexion');
    }
  };

  // Gestionnaire de déconnexion pour inactivité (useCallback pour stabiliser la référence)
  const handleIdleLogout = useCallback(async () => {
    try {
      // Log logout to audit trail (timeout reason)
      if (appUser && user) {
        await UserService.logLogout(
          clubId,
          user.uid,
          user.email || 'unknown',
          appUser.displayName || 'Unknown',
          'timeout'
        );
      }

      // Terminer la session Firestore
      await SessionService.terminateSession(clubId);

      // Déconnexion Firebase
      await signOut();

      toast.error('Déconnecté pour inactivité');
      window.location.href = 'https://caly.club/';
    } catch (error) {
      logger.error('Error during idle logout:', error);
    }
  }, [appUser, user, clubId, navigate]);

  // Mémoriser les options du idle timer pour éviter les re-renders inutiles
  // NOTE: handleIdleLogout n'est PAS dans les dépendances car il est déjà stabilisé par useCallback
  // L'ajouter ici causerait des re-créations inutiles de l'objet options
  const idleTimerOptions = useMemo(() => ({
    clubId: clubId,
    userId: user?.uid,
    timeoutMinutes: securitySettings.idleTimeoutMinutes,
    warningBeforeMinutes: securitySettings.warningBeforeMinutes,
    onIdle: handleIdleLogout,
    enabled: securitySettings.autoLogoutEnabled
  }), [clubId, user?.uid, securitySettings.idleTimeoutMinutes, securitySettings.warningBeforeMinutes, securitySettings.autoLogoutEnabled]);

  // Hook de détection d'inactivité
  const { isWarning, remainingSeconds, reset } = useIdleTimer(idleTimerOptions);

  // Toggle sidebar collapsed state
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('calypso-sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  }, []);

  // Log quand isWarning change
  useEffect(() => {
    if (isWarning) {
      logger.debug('🚨 [LAYOUT] ⚠️ AVERTISSEMENT ACTIF - remainingSeconds:', remainingSeconds);
    }
  }, [isWarning, remainingSeconds]);

  return (
    <BugReportProvider>
    <>
      {/* Force Refresh Modal */}
      <ForceRefreshModal
        isOpen={needsRefresh}
        currentVersion={currentVersion}
        latestVersion={null}
        message={message}
        onRefresh={refreshApp}
      />

      {/* TEST ENVIRONMENT BANNER */}
      {isTestEnvironment && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-500 text-white text-center py-2 px-4 font-bold shadow-lg">
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">⚠️</span>
            <span className="text-lg uppercase tracking-wide">TESTOMGEVING - GEEN ECHTE DATA</span>
            <span className="text-2xl">⚠️</span>
          </div>
        </div>
      )}

    <div className={cn(
      "min-h-screen bg-gray-50 dark:bg-dark-bg-tertiary dark:bg-dark-bg-primary transition-colors",
      isTestEnvironment && "pt-12" // Extra padding voor de banner
    )}>
      {/* Sidebar mobile */}
      <div className={cn(
        "fixed inset-0 z-50 lg:hidden",
        sidebarOpen ? "block" : "hidden"
      )}>
        <div className="fixed inset-0 bg-gray-900/80 dark:bg-black/90" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white dark:bg-dark-bg-secondary">
          <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-dark-border">
            <CalypsoLogo variant="horizontal" />
            <button onClick={() => setSidebarOpen(false)}>
              <X className="h-6 w-6 text-gray-400 dark:text-dark-text-muted" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              const isDisabled = 'disabled' in item && item.disabled;

              if (isDisabled) {
                return (
                  <div
                    key={item.name}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium mb-1 text-gray-400 dark:text-dark-text-muted cursor-not-allowed"
                    title="Accès réservé aux administrateurs"
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
                    isActive
                      ? "bg-calypso-blue dark:bg-calypso-aqua text-white"
                      : "text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Sidebar desktop */}
      <div className={cn(
        "hidden lg:fixed lg:inset-y-0 lg:flex lg:flex-col transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "lg:w-[72px]" : "lg:w-64"
      )}>
        <div className="flex flex-col flex-1 bg-white dark:bg-dark-bg-secondary border-r border-gray-200 dark:border-dark-border">
          <div className={cn(
            "flex items-center border-b border-gray-200 dark:border-dark-border",
            sidebarCollapsed ? "justify-center px-2 pt-4 pb-2" : "px-6 pt-4 pb-2"
          )}>
            {sidebarCollapsed ? (
              <CalypsoLogo variant="icon" className="h-8" />
            ) : (
              <CalypsoLogo variant="horizontal" />
            )}
          </div>
          <nav className={cn("flex-1 py-4", sidebarCollapsed ? "px-2" : "px-4")}>
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              const isDisabled = 'disabled' in item && item.disabled;

              if (isDisabled) {
                return (
                  <div
                    key={item.name}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium mb-1 text-gray-400 dark:text-dark-text-muted cursor-not-allowed",
                      sidebarCollapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
                    )}
                    title={sidebarCollapsed ? item.name : "Accès réservé aux administrateurs"}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {!sidebarCollapsed && <span>{item.name}</span>}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  title={sidebarCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-lg text-sm font-medium transition-colors mb-1",
                    sidebarCollapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-calypso-blue dark:bg-calypso-aqua text-white"
                      : "text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary"
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!sidebarCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          {/* Profil utilisateur */}
          <div className={cn("border-t border-gray-200 dark:border-dark-border space-y-3", sidebarCollapsed ? "p-2" : "p-4")}>
            {sidebarCollapsed ? (
              <>
                <div className="flex justify-center" title={appUser?.displayName || user?.email || ''}>
                  <div className="w-10 h-10 bg-gray-200 dark:bg-dark-bg-tertiary rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                </div>
                <BugReportButton collapsed />
                <button
                  onClick={handleLogout}
                  title="Déconnexion"
                  className="w-full flex justify-center py-2 text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 dark:bg-dark-bg-tertiary rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                      {appUser?.displayName || user?.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                      {appUser ? (PermissionService.getRoleConfig(getRole(appUser))?.label || 'Utilisateur') : 'Utilisateur'}
                    </p>
                  </div>
                </div>

                {/* Thème */}
                <DarkModeToggle />

                {/* Signaler un bug */}
                <BugReportButton collapsed={false} />

                {/* Déconnexion */}
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Déconnexion
                </button>
              </>
            )}

            {/* Toggle sidebar button */}
            <button
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Menu uitklappen" : "Menu inklappen"}
              className={cn(
                "w-full flex items-center py-2 text-gray-500 dark:text-dark-text-muted hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors text-sm",
                sidebarCollapsed ? "justify-center" : "gap-2 px-3"
              )}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <>
                  <PanelLeftClose className="h-4 w-4" />
                  <span>Réduire</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className={cn("transition-all duration-300 ease-in-out", sidebarCollapsed ? "lg:pl-[72px]" : "lg:pl-64")}>
        {/* Header mobile */}
        <div className="sticky top-0 z-40 flex h-16 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border lg:hidden">
          <button
            type="button"
            className="px-4 text-gray-500 dark:text-dark-text-muted hover:text-gray-900 dark:text-dark-text-primary dark:hover:text-dark-text-primary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex flex-1 items-center justify-center px-4">
            <CalypsoLogo variant="horizontal" />
          </div>
        </div>

        {/* Fiscal Year Filter Warning Banner */}
        <div className="px-6 pt-4">
          <FiscalYearFilterWarningBanner />
        </div>

        {/* Archive Banner */}
        {isArchiveMode && (
          <div className="px-6 pt-4">
            <ArchiveBanner />
          </div>
        )}

        {/* Browser Compatibility Warning */}
        {compatibilityWarning && compatibilityWarning.warningLevel !== 'none' && (
          <div className="px-6 pt-4">
            <div className={cn(
              "rounded-lg p-4 flex items-start gap-3",
              compatibilityWarning.warningLevel === 'error' && "bg-red-50 border border-red-200",
              compatibilityWarning.warningLevel === 'warning' && "bg-orange-50 border border-orange-200",
              compatibilityWarning.warningLevel === 'info' && "bg-blue-50 border border-blue-200"
            )}>
              <div className={cn(
                "text-sm flex-1",
                compatibilityWarning.warningLevel === 'error' && "text-red-800",
                compatibilityWarning.warningLevel === 'warning' && "text-orange-800",
                compatibilityWarning.warningLevel === 'info' && "text-blue-800"
              )}>
                {compatibilityWarning.message}
              </div>
            </div>
          </div>
        )}

        {/* Contenu de la page */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Modal de changement de mot de passe obligatoire */}
      {(() => {
        logger.debug('🎭 [LAYOUT] Rendering password change modal check:', {
          showPasswordChange,
          hasUser: !!user,
          hasAppUser: !!appUser,
          willRender: showPasswordChange && user && appUser
        });
        return null;
      })()}
      {showPasswordChange && user && appUser && (
        <PasswordChangeModal
          userId={user.uid}
          clubId={clubId}
          userEmail={user.email || ''}
          onComplete={() => {
            setShowPasswordChange(false);
            toast.success('Vous pouvez maintenant utiliser l\'application');
            // Reload appUser data to get updated requirePasswordChange flag
            window.location.reload();
          }}
        />
      )}

      {/* Modal d'avertissement d'inactivité */}
      <IdleWarningModal
        isOpen={isWarning}
        remainingSeconds={remainingSeconds}
        onStayConnected={reset}
        timeoutMinutes={securitySettings.idleTimeoutMinutes}
      />
    </div>
    </>
    </BugReportProvider>
  );
}
