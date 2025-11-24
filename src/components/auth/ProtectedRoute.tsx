import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Permission, UserRole } from '@/types/user.types';
import { AlertCircle } from 'lucide-react';
import { signOut } from '@/lib/firebase';
import toast from 'react-hot-toast';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole | UserRole[];
  requiredPermission?: Permission | Permission[];
}

export function ProtectedRoute({ children, requiredRole, requiredPermission }: ProtectedRouteProps) {
  const { user, appUser, loading, hasPermission, hasAnyPermission, hasRole } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-tertiary">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-calypso-blue border-t-transparent"></div>
      </div>
    );
  }

  // Rediriger vers la page de connexion si non authentifié
  if (!user) {
    return <Navigate to="/connexion" replace />;
  }

  // Vérifier si l'utilisateur est actif
  if (appUser && !appUser.isActive) {
    const handleReturnToLogin = async () => {
      try {
        await signOut();
        toast.success('Vous avez été déconnecté');
        navigate('/connexion', { replace: true });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
        toast.error('Erreur lors de la déconnexion');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-tertiary">
        <div className="max-w-md w-full bg-white dark:bg-dark-bg-secondary shadow-lg rounded-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">Compte non activé</h2>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            Votre compte n'est pas encore activé. Veuillez contacter un administrateur.
          </p>
          <button
            onClick={handleReturnToLogin}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  // Vérifier le rôle si nécessaire
  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-tertiary">
        <div className="max-w-md w-full bg-white dark:bg-dark-bg-secondary shadow-lg rounded-lg p-8 text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">Accès refusé</h2>
          <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
            Vous n'avez pas le rôle requis pour accéder à cette page.
          </p>
          <button
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  // Vérifier la permission si nécessaire
  if (requiredPermission) {
    const hasRequiredPermission = Array.isArray(requiredPermission)
      ? hasAnyPermission(requiredPermission)
      : hasPermission(requiredPermission);

    if (!hasRequiredPermission) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-bg-tertiary">
          <div className="max-w-md w-full bg-white dark:bg-dark-bg-secondary shadow-lg rounded-lg p-8 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary mb-2">Accès refusé</h2>
            <p className="text-gray-600 dark:text-dark-text-secondary mb-4">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
            <button
              onClick={() => window.history.back()}
              className="px-4 py-2 bg-calypso-blue text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Retour
            </button>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}