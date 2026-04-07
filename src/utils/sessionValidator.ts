import { SessionService } from '@/services/sessionService';
import { signOut } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { logger } from '@/utils/logger';

/**
 * Utilitaire de validation de session au chargement de l'application
 *
 * Fournit une double vérification:
 * 1. localStorage (instantané, 0ms latence)
 * 2. Firestore (source de vérité, sécurisé)
 */
export class SessionValidator {
  /**
   * Vérifier la validité de la session au chargement de l'application
   * Retourne true si la session est valide, false si expirée
   *
   * @param clubId - ID du club
   * @param timeoutMinutes - Durée du timeout en minutes (depuis settings)
   * @param autoLogoutEnabled - Si la déconnexion automatique est activée
   */
  static async checkSessionOnLoad(
    clubId: string,
    timeoutMinutes: number,
    autoLogoutEnabled: boolean
  ): Promise<boolean> {
    // Si auto-logout désactivé, toujours valide
    if (!autoLogoutEnabled) {
      return true;
    }

    try {
      // Étape 1: Vérification rapide localStorage (0ms)
      const isLocalValid = SessionService.isLocalStorageSessionValid(timeoutMinutes);

      if (!isLocalValid) {
        logger.debug('❌ Session expirée (localStorage check)');
        await this.forceLogoutWithMessage(
          `Session expirée après ${timeoutMinutes} minutes d'inactivité`
        );
        return false;
      }

      // Étape 2: Vérification Firestore (source de vérité)
      const isFirestoreValid = await SessionService.validateSession(clubId);

      if (!isFirestoreValid) {
        logger.debug('❌ Session expirée (Firestore check)');
        await this.forceLogoutWithMessage(
          `Session expirée. Veuillez vous reconnecter.`
        );
        return false;
      }

      logger.debug('✅ Session valide (localStorage + Firestore)');
      return true;
    } catch (error) {
      logger.error('❌ Erreur validation session:', error);
      // En cas d'erreur, déconnecter par sécurité
      await this.forceLogoutWithMessage(
        'Erreur de validation de session. Veuillez vous reconnecter.'
      );
      return false;
    }
  }

  /**
   * Forcer la déconnexion avec un message explicite
   */
  private static async forceLogoutWithMessage(message: string): Promise<void> {
    try {
      // Nettoyer localStorage
      localStorage.removeItem('sessionId');
      localStorage.removeItem('lastActivity');

      // Réinitialiser le sessionId en mémoire
      SessionService.resetSessionId();

      // Déconnexion Firebase
      await signOut();

      // Afficher le message
      toast.error(message, {
        duration: 5000,
        position: 'top-center'
      });

      // Rediriger vers la page de connexion
      if (typeof window !== 'undefined') {
        window.location.href = '/connexion';
      }
    } catch (error) {
      logger.error('❌ Erreur lors de la déconnexion forcée:', error);

      // Forcer le rechargement pour nettoyer l'état
      if (typeof window !== 'undefined') {
        window.location.href = '/connexion';
      }
    }
  }

  /**
   * Vérifier périodiquement la session (toutes les X secondes)
   * Utilisé pour détecter l'expiration pendant que l'utilisateur est inactif
   *
   * @param clubId - ID du club
   * @param intervalSeconds - Intervalle de vérification en secondes (défaut: 30s)
   * @returns Fonction de cleanup pour arrêter la vérification périodique
   */
  static startPeriodicSessionCheck(
    clubId: string,
    intervalSeconds: number = 30
  ): () => void {
    const intervalId = setInterval(async () => {
      const isValid = await SessionService.validateSession(clubId);

      if (!isValid) {
        logger.debug('⏰ Vérification périodique: session expirée');
        await this.forceLogoutWithMessage(
          'Votre session a expiré pour des raisons de sécurité.'
        );
      }
    }, intervalSeconds * 1000);

    // Retourner la fonction de cleanup
    return () => clearInterval(intervalId);
  }

  /**
   * Rafraîchir la session (appelé quand l'utilisateur clique "Rester connecté")
   */
  static async refreshSession(clubId: string): Promise<boolean> {
    try {
      await SessionService.updateSessionActivity(clubId);

      // Mettre à jour localStorage immédiatement
      localStorage.setItem('lastActivity', Date.now().toString());

      logger.debug('🔄 Session rafraîchie');
      return true;
    } catch (error) {
      logger.error('❌ Erreur rafraîchissement session:', error);
      return false;
    }
  }
}
