import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Settings,
  FileText,
  Package
} from 'lucide-react';
import { signOut } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useFiscalYear } from '@/contexts/FiscalYearContext';
import toast from 'react-hot-toast';
import { cn } from '@/utils/utils';
import { PermissionService } from '@/services/permissionService';
import { useIdleTimer } from '@/hooks/useIdleTimer';
import { IdleWarningModal } from '@/components/auth/IdleWarningModal';
import { FirebaseSettingsService } from '@/services/firebaseSettingsService';
import { SessionService } from '@/services/sessionService';
import { UserService } from '@/services/userService';
import { DarkModeToggle } from './DarkModeToggle';
import { ArchiveBanner } from './ArchiveBanner';
import PasswordChangeModal from '@/components/auth/PasswordChangeModal';

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
          <span className="text-xl font-bold text-gray-900">Calypso</span>
        )}
      </div>
    );
  }

  if (variant === 'icon') {
    return (
      <img
        src="/logo-vertical.png"
        alt="Calypso Diving Club"
        className={cn("h-12 w-auto", className)}
        onError={() => setImageError(true)}
      />
    );
  }

  return (
    <img
      src="/logo-horizontal.jpg"
      alt="Calypso Diving Club"
      className={cn("w-full h-auto", className)}
      onError={() => setImageError(true)}
    />
  );
};

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, appUser, hasPermission, clubId } = useAuth();
  const { isArchiveMode } = useFiscalYear();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [showPasswordChange, setShowPasswordChange] = React.useState(false);
  const [securitySettings, setSecuritySettings] = useState({
    autoLogoutEnabled: true,
    idleTimeoutMinutes: 15,       // 15 minutes par défaut
    warningBeforeMinutes: 2       // 2 minutes d'avertissement
  });

  // Vérifier si le changement de mot de passe est requis
  useEffect(() => {
    console.log('🔍 [LAYOUT] Checking requirePasswordChange:', {
      appUser: appUser?.email,
      hasSecurityField: !!appUser?.security,
      securityField: appUser?.security,
      requirePasswordChangeFromSecurity: appUser?.security?.requirePasswordChange,
      requirePasswordChangeDirect: appUser?.requirePasswordChange,
      showPasswordChange
    });

    if (appUser?.security?.requirePasswordChange) {
      console.log('⚠️ [LAYOUT] SHOWING PASSWORD CHANGE MODAL for:', appUser.email);
      setShowPasswordChange(true);
    } else {
      console.log('✓ [LAYOUT] No password change required');
      if (appUser) {
        console.log('🔍 [LAYOUT] Full appUser.security object:', JSON.stringify(appUser.security, null, 2));
      }
    }
  }, [appUser, showPasswordChange]);

  // Charger les paramètres de sécurité
  useEffect(() => {
    const loadSettings = async () => {
      console.log('🔐 [LAYOUT] Chargement des paramètres de sécurité pour clubId:', clubId);
      const settings = await FirebaseSettingsService.loadSecuritySettings(clubId);
      console.log('✅ [LAYOUT] Paramètres de sécurité chargés depuis Firestore:', settings);
      setSecuritySettings(settings);
    };
    loadSettings();
  }, [clubId]);

  // 🔒 USER ISOLATION: Simplified navigation for 'user' role
  const navigation = appUser?.role === 'user' ? [
    { name: 'Accueil', href: '/accueil', icon: Home },
    { name: 'Mes Activités', href: '/operations', icon: Calendar },
    { name: 'Mes Dépenses', href: '/depenses', icon: Receipt },
  ] : [
    { name: 'Accueil', href: '/accueil', icon: Home },
    ...(hasPermission('dashboard.view') ? [{ name: 'Tableau de bord', href: '/tableau-bord', icon: BarChart3 }] : []),
    { name: 'Transactions', href: '/transactions', icon: CreditCard },
    { name: 'Activités', href: '/operations', icon: Calendar },
    { name: 'Dépenses', href: '/depenses', icon: Receipt },
    ...(hasPermission('reports.view') ? [{ name: 'Rapports', href: '/rapports', icon: FileText }] : []),
    ...(appUser?.role === 'superadmin' ? [{ name: 'Inventaire', href: '/inventaire', icon: Package }] : []),
    ...(hasPermission('settings.view') ? [{ name: 'Paramètres', href: '/parametres', icon: Settings }] : []),
  ];

  const handleLogout = async () => {
    try {
      // Log logout to audit trail
      if (appUser && user) {
        await UserService.logLogout(
          clubId,
          user.uid,
          user.email || 'unknown',
          appUser.displayName,
          'manual'
        );
      }

      // Terminer la session Firestore
      await SessionService.terminateSession(clubId);

      // Déconnexion Firebase
      await signOut();

      toast.success('Déconnexion réussie');
      navigate('/connexion');
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
          appUser.displayName,
          'timeout'
        );
      }

      // Terminer la session Firestore
      await SessionService.terminateSession(clubId);

      // Déconnexion Firebase
      await signOut();

      toast.error('Déconnecté pour inactivité');
      navigate('/connexion');
    } catch (error) {
      console.error('Error during idle logout:', error);
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

  // Log quand isWarning change
  useEffect(() => {
    if (isWarning) {
      console.log('🚨 [LAYOUT] ⚠️ AVERTISSEMENT ACTIF - remainingSeconds:', remainingSeconds);
    }
  }, [isWarning, remainingSeconds]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg-primary transition-colors">
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
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
                    isActive
                      ? "bg-calypso-blue dark:bg-calypso-aqua text-white"
                      : "text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
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
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-1 bg-white dark:bg-dark-bg-secondary border-r border-gray-200 dark:border-dark-border">
          <div className="flex items-center px-6 pt-4 pb-2 border-b border-gray-200 dark:border-dark-border">
            <CalypsoLogo variant="horizontal" />
          </div>
          <nav className="flex-1 px-4 py-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mb-1",
                    isActive
                      ? "bg-calypso-blue dark:bg-calypso-aqua text-white"
                      : "text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Profil utilisateur */}
          <div className="border-t border-gray-200 dark:border-dark-border p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 dark:bg-dark-bg-tertiary rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-gray-600 dark:text-dark-text-secondary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-dark-text-primary truncate">
                  {appUser?.displayName || user?.email}
                </p>
                <p className="text-xs text-gray-500 dark:text-dark-text-muted">
                  {appUser ? (PermissionService.getRoleConfig(appUser.app_role)?.label || 'Utilisateur') : 'Utilisateur'}
                </p>
              </div>
            </div>

            {/* Thème */}
            <DarkModeToggle />

            {/* Déconnexion */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-dark-text-primary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="lg:pl-64">
        {/* Header mobile */}
        <div className="sticky top-0 z-40 flex h-16 bg-white dark:bg-dark-bg-secondary border-b border-gray-200 dark:border-dark-border lg:hidden">
          <button
            type="button"
            className="px-4 text-gray-500 dark:text-dark-text-muted hover:text-gray-900 dark:hover:text-dark-text-primary"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex flex-1 items-center justify-center px-4">
            <CalypsoLogo variant="horizontal" />
          </div>
        </div>

        {/* Archive Banner */}
        {isArchiveMode && (
          <div className="px-6 pt-4">
            <ArchiveBanner />
          </div>
        )}

        {/* Contenu de la page */}
        <main className="flex-1">
          <Outlet />
        </main>
      </div>

      {/* Modal de changement de mot de passe obligatoire */}
      {(() => {
        console.log('🎭 [LAYOUT] Rendering password change modal check:', {
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
  );
}