import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logger } from '@/utils/logger';
import { FirebaseSettingsService } from './firebaseSettingsService';
import { checkBrowserCompatibility } from './compatibilityService';

/**
 * Interface pour une session utilisateur
 */
export interface UserSessionData {
  userId: string;
  clubId: string;
  loginAt: Timestamp;
  lastActivityAt: Timestamp;
  expiresAt: Timestamp;
  deviceInfo: string;
  isActive: boolean;
  userAgent?: string;
}

/**
 * Service de gestion des sessions utilisateur avec timeout configurable
 *
 * Ce service gère les sessions côté Firestore pour permettre:
 * - Validation de session même si l'onglet est fermé
 * - Timeout basé sur les settings Firebase (idleTimeoutMinutes)
 * - Multi-appareils (une session par appareil)
 * - Audit trail des connexions
 */
export class SessionService {
  private static lastUpdateTime: number = 0;
  private static updateDebounceMs: number = 10000; // 10 seconds - reduced from 60s to prevent session sync issues
  private static sessionId: string | null = null;

  /**
   * Créer une nouvelle session au login
   */
  static async createSession(
    userId: string,
    clubId: string
  ): Promise<string> {
    try {
      // Charger les settings de timeout depuis Firebase
      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);

      if (!securitySettings.autoLogoutEnabled) {
        // Even with auto-logout disabled, we need to ensure any existing session
        // has isActive: true to pass Firestore security rules
        logger.debug('⚠️ Auto-logout désactivé, vérification session existante');
        const sessionRef = doc(db, 'clubs', clubId, 'sessions', userId);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists()) {
          const sessionData = sessionSnap.data();
          if (!sessionData.isActive) {
            // Reactivate the session so Firestore rules pass
            logger.debug('🔄 Réactivation session existante (auto-logout désactivé)');
            await updateDoc(sessionRef, {
              isActive: true,
              lastActivityAt: Timestamp.now()
            });
          }
        }
        return '';
      }

      // Générer un ID de session unique (basé sur userId pour simplifier)
      // Note: Pour multi-appareils, utiliser userId + deviceId
      const sessionId = userId;
      const now = Timestamp.now();
      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
      const expiresAt = Timestamp.fromMillis(now.toMillis() + timeoutMs);

      // Informations sur l'appareil
      const deviceInfo = this.getDeviceInfo();

      const sessionData: UserSessionData = {
        userId,
        clubId,
        loginAt: now,
        lastActivityAt: now,
        expiresAt,
        deviceInfo,
        isActive: true,
        userAgent: navigator.userAgent
      };

      const sessionRef = doc(db, 'clubs', clubId, 'sessions', sessionId);
      await setDoc(sessionRef, sessionData);

      // Sauvegarder dans localStorage pour vérification rapide
      localStorage.setItem('sessionId', sessionId);
      localStorage.setItem('lastActivity', now.toMillis().toString());

      this.sessionId = sessionId;
      logger.debug('✅ Session créée:', { sessionId, expiresAt: expiresAt.toDate() });

      return sessionId;
    } catch (error) {
      logger.error('❌ Erreur création session:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour l'activité de la session (debounced)
   * Appelé à chaque activité utilisateur détectée
   */
  static async updateSessionActivity(
    clubId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const sid = sessionId || this.sessionId || localStorage.getItem('sessionId');
      if (!sid) {
        logger.warn('⚠️ Pas de sessionId, impossible de mettre à jour l\'activité');
        return;
      }

      const now = Date.now();

      // Debouncing: ne pas mettre à jour Firestore trop souvent
      if (now - this.lastUpdateTime < this.updateDebounceMs) {
        // Mettre à jour seulement localStorage (gratuit, instantané)
        localStorage.setItem('lastActivity', now.toString());
        return;
      }

      this.lastUpdateTime = now;

      // Charger les settings pour recalculer expiresAt
      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);

      if (!securitySettings.autoLogoutEnabled) {
        return;
      }

      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
      const timestamp = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(timestamp.toMillis() + timeoutMs);

      const sessionRef = doc(db, 'clubs', clubId, 'sessions', sid);

      await updateDoc(sessionRef, {
        lastActivityAt: timestamp,
        expiresAt: expiresAt
      });

      // Mettre à jour localStorage
      localStorage.setItem('lastActivity', timestamp.toMillis().toString());

      logger.debug('🔄 Session activité mise à jour (debounced 10s)');
    } catch (error) {
      logger.error('❌ Erreur mise à jour session:', error);
      // Ne pas bloquer l'application si l'update échoue
    }
  }

  /**
   * Valider si la session est toujours active
   * Retourne true si valide, false si expirée
   *
   * Note: Returns false (not an error) if session doesn't exist yet.
   * This allows AuthContext to create a new session on first login.
   */
  static async validateSession(
    clubId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const sid = sessionId || this.sessionId || localStorage.getItem('sessionId');
      if (!sid) {
        logger.debug('⚠️ Pas de sessionId pour validation');
        return false;
      }

      // Charger les settings
      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);

      // Vérification rapide localStorage d'abord (0ms latence) - only if auto-logout enabled
      if (securitySettings.autoLogoutEnabled) {
        const localLastActivity = localStorage.getItem('lastActivity');
        if (localLastActivity) {
          const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
          const now = Date.now();
          const lastActivity = parseInt(localLastActivity, 10);

          if (now - lastActivity > timeoutMs) {
            logger.debug('❌ Session expirée (vérification localStorage)');
            return false;
          }
        }
      }

      // Vérification Firestore (source de vérité)
      let sessionSnap;
      try {
        const sessionRef = doc(db, 'clubs', clubId, 'sessions', sid);
        sessionSnap = await getDoc(sessionRef);
      } catch (firestoreError: any) {
        // Handle permission errors gracefully - session doesn't exist yet
        if (firestoreError?.code === 'permission-denied' ||
            firestoreError?.message?.includes('permission')) {
          logger.debug('⚠️ Session non trouvée (permission error = session inexistante)');
          return false;
        }
        throw firestoreError;
      }

      if (!sessionSnap.exists()) {
        logger.debug('❌ Session introuvable dans Firestore');
        return false;
      }

      const sessionData = sessionSnap.data() as UserSessionData;

      if (!sessionData.isActive) {
        logger.debug('❌ Session inactive');
        return false;
      }

      const now = Timestamp.now();
      const lastActivity = sessionData.lastActivityAt;

      // Timeout check (only if auto-logout enabled)
      if (!securitySettings.autoLogoutEnabled) {
        logger.debug('✅ Session valide (auto-logout désactivé)');
        return true;
      }

      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;

      const timeSinceActivity = now.toMillis() - lastActivity.toMillis();

      if (timeSinceActivity > timeoutMs) {
        logger.debug(`❌ Session expirée: ${Math.round(timeSinceActivity / 60000)} min depuis dernière activité (max: ${securitySettings.idleTimeoutMinutes} min)`);
        return false;
      }

      logger.debug(`✅ Session valide: ${Math.round(timeSinceActivity / 60000)} min depuis dernière activité`);
      return true;
    } catch (error) {
      logger.error('❌ Erreur validation session:', error);
      // En cas d'erreur, considérer la session comme invalide (sécurité)
      return false;
    }
  }

  /**
   * Assurer qu'une session valide existe avant une opération critique.
   * Si la session est expirée ou proche de l'expiration, force un refresh immédiat.
   *
   * Utiliser cette méthode AVANT toute écriture Firestore importante pour éviter
   * les erreurs permission-denied dues à un délai de synchronisation session.
   *
   * @returns true si la session est prête, false si impossible de valider
   */
  static async ensureValidSession(
    clubId: string,
    userId: string
  ): Promise<boolean> {
    try {
      const sid = userId || this.sessionId || localStorage.getItem('sessionId');
      if (!sid) {
        logger.warn('⚠️ ensureValidSession: pas de sessionId');
        return false;
      }

      // Charger les settings
      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);

      // Si auto-logout désactivé, la session est toujours valide
      if (!securitySettings.autoLogoutEnabled) {
        return true;
      }

      // Forcer un refresh immédiat de la session (bypass debounce)
      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
      const timestamp = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(timestamp.toMillis() + timeoutMs);

      const sessionRef = doc(db, 'clubs', clubId, 'sessions', sid);

      await updateDoc(sessionRef, {
        lastActivityAt: timestamp,
        expiresAt: expiresAt,
        isActive: true
      });

      // Mettre à jour localStorage et reset debounce timer
      localStorage.setItem('lastActivity', timestamp.toMillis().toString());
      this.lastUpdateTime = Date.now();

      logger.debug('✅ ensureValidSession: session rafraîchie avec succès');

      // Petit délai pour s'assurer que Firestore a bien propagé la mise à jour
      await new Promise(resolve => setTimeout(resolve, 200));

      return true;
    } catch (error) {
      logger.error('❌ ensureValidSession: erreur', error);
      return false;
    }
  }

  /**
   * Terminer une session (logout)
   */
  static async terminateSession(
    clubId: string,
    sessionId?: string
  ): Promise<void> {
    try {
      const sid = sessionId || this.sessionId || localStorage.getItem('sessionId');
      if (!sid) {
        logger.debug('⚠️ Pas de sessionId pour terminer');
        return;
      }

      const sessionRef = doc(db, 'clubs', clubId, 'sessions', sid);

      // Marquer comme inactive plutôt que supprimer (audit trail)
      await updateDoc(sessionRef, {
        isActive: false,
        logoutAt: serverTimestamp()
      });

      // Nettoyer localStorage
      localStorage.removeItem('sessionId');
      localStorage.removeItem('lastActivity');

      this.sessionId = null;

      logger.debug('🚪 Session terminée:', sid);
    } catch (error) {
      logger.error('❌ Erreur terminaison session:', error);
      // Nettoyer localStorage même en cas d'erreur
      localStorage.removeItem('sessionId');
      localStorage.removeItem('lastActivity');
    }
  }

  /**
   * Nettoyer les sessions expirées (appel périodique)
   * À exécuter par un Cloud Function ou périodiquement côté client
   */
  static async cleanupExpiredSessions(clubId: string): Promise<number> {
    try {
      const sessionsRef = collection(db, 'clubs', clubId, 'sessions');
      const q = query(sessionsRef, where('isActive', '==', true));
      const snapshot = await getDocs(q);

      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);
      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
      const now = Timestamp.now();

      let cleanedCount = 0;

      const promises = snapshot.docs.map(async (docSnap) => {
        const sessionData = docSnap.data() as UserSessionData;
        const timeSinceActivity = now.toMillis() - sessionData.lastActivityAt.toMillis();

        if (timeSinceActivity > timeoutMs) {
          await updateDoc(docSnap.ref, {
            isActive: false,
            expiredAt: serverTimestamp()
          });
          cleanedCount++;
        }
      });

      await Promise.all(promises);

      if (cleanedCount > 0) {
        logger.debug(`🧹 ${cleanedCount} sessions expirées nettoyées`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('❌ Erreur nettoyage sessions:', error);
      return 0;
    }
  }

  /**
   * Obtenir les informations sur l'appareil (type basique)
   */
  private static getDeviceInfo(): string {
    const ua = navigator.userAgent;

    // Détection basique du type d'appareil
    if (/mobile/i.test(ua)) {
      return 'Mobile';
    } else if (/tablet|ipad/i.test(ua)) {
      return 'Tablet';
    } else {
      return 'Desktop';
    }
  }

  /**
   * Parser le browser name et version depuis userAgent
   */
  private static getBrowserInfo(): { name: string; version: string } {
    const ua = navigator.userAgent;
    let name = 'Unknown';
    let version = '';

    // Ordre important: plus spécifique d'abord
    if (ua.includes('Edg/')) {
      name = 'Edge';
      version = ua.match(/Edg\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.includes('OPR/') || ua.includes('Opera')) {
      name = 'Opera';
      version = ua.match(/(?:OPR|Opera)\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.includes('Chrome/')) {
      name = 'Chrome';
      version = ua.match(/Chrome\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
      name = 'Safari';
      version = ua.match(/Version\/(\d+\.\d+)/)?.[1] || '';
    } else if (ua.includes('Firefox/')) {
      name = 'Firefox';
      version = ua.match(/Firefox\/(\d+\.\d+)/)?.[1] || '';
    }

    return { name, version };
  }

  /**
   * Sauvegarder les informations de l'appareil web dans le membre
   * Appelé lors du login pour tracking debugging
   */
  static async saveDeviceInfoToMember(
    clubId: string,
    userId: string
  ): Promise<void> {
    try {
      const browserInfo = this.getBrowserInfo();
      const deviceType = this.getDeviceInfo();

      const deviceData = {
        // Platform web
        device_platform: 'web',
        device_type: deviceType,
        // Browser info
        browser_name: browserInfo.name,
        browser_version: browserInfo.version,
        // Locale & timezone
        device_locale: navigator.language || 'unknown',
        device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
        // Screen info
        device_screen_width: screen.width,
        device_screen_height: screen.height,
        device_pixel_ratio: window.devicePixelRatio || 1,
        // Timestamp
        web_last_login: serverTimestamp(),
      };

      const memberRef = doc(db, 'clubs', clubId, 'members', userId);
      await updateDoc(memberRef, deviceData);

      logger.debug('✅ Web device info sauvegardé:', {
        browser: `${browserInfo.name} ${browserInfo.version}`,
        device: deviceType,
        locale: deviceData.device_locale,
        timezone: deviceData.device_timezone,
      });

      // Check browser compatibility (non-blocking warning)
      FirebaseSettingsService.getCompatibilitySettings(clubId)
        .then(settings => {
          const status = checkBrowserCompatibility(browserInfo.name, browserInfo.version, settings);
          if (status.warningLevel !== 'none') {
            // Store in sessionStorage voor gebruik in UI
            sessionStorage.setItem('browserCompatibilityWarning', JSON.stringify(status));
          }
        })
        .catch(err => logger.warn('Failed to check browser compatibility:', err));
    } catch (error) {
      // Ne pas bloquer le login si ça échoue
      logger.warn('⚠️ Erreur sauvegarde web device info:', error);
    }
  }

  /**
   * Vérifier rapidement le localStorage (sans appel Firestore)
   * Utilisé pour une vérification ultra-rapide au chargement
   */
  static isLocalStorageSessionValid(timeoutMinutes: number): boolean {
    const localLastActivity = localStorage.getItem('lastActivity');
    if (!localLastActivity) {
      return false;
    }

    const now = Date.now();
    const lastActivity = parseInt(localLastActivity, 10);
    const timeoutMs = timeoutMinutes * 60 * 1000;

    return (now - lastActivity) <= timeoutMs;
  }

  /**
   * Réinitialiser le sessionId en mémoire
   */
  static resetSessionId(): void {
    this.sessionId = null;
  }
}
