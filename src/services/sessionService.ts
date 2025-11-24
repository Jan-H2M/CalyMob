import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FirebaseSettingsService } from './firebaseSettingsService';

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
  private static updateDebounceMs: number = 60000; // 1 minute
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
        console.log('⚠️ Auto-logout désactivé, pas de création de session');
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
      console.log('✅ Session créée:', sessionId, 'Expire à:', expiresAt.toDate());

      return sessionId;
    } catch (error) {
      console.error('❌ Erreur création session:', error);
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
        console.warn('⚠️ Pas de sessionId, impossible de mettre à jour l\'activité');
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

      console.log('🔄 Session activité mise à jour (debounced 1 min)');
    } catch (error) {
      console.error('❌ Erreur mise à jour session:', error);
      // Ne pas bloquer l'application si l'update échoue
    }
  }

  /**
   * Valider si la session est toujours active
   * Retourne true si valide, false si expirée
   */
  static async validateSession(
    clubId: string,
    sessionId?: string
  ): Promise<boolean> {
    try {
      const sid = sessionId || this.sessionId || localStorage.getItem('sessionId');
      if (!sid) {
        console.log('⚠️ Pas de sessionId pour validation');
        return false;
      }

      // Vérification rapide localStorage d'abord (0ms latence)
      const localLastActivity = localStorage.getItem('lastActivity');
      if (localLastActivity) {
        const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);

        if (!securitySettings.autoLogoutEnabled) {
          return true; // Si auto-logout désactivé, toujours valide
        }

        const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;
        const now = Date.now();
        const lastActivity = parseInt(localLastActivity, 10);

        if (now - lastActivity > timeoutMs) {
          console.log('❌ Session expirée (vérification localStorage)');
          return false;
        }
      }

      // Vérification Firestore (source de vérité)
      const sessionRef = doc(db, 'clubs', clubId, 'sessions', sid);
      const sessionSnap = await getDoc(sessionRef);

      if (!sessionSnap.exists()) {
        console.log('❌ Session introuvable dans Firestore');
        return false;
      }

      const sessionData = sessionSnap.data() as UserSessionData;

      if (!sessionData.isActive) {
        console.log('❌ Session inactive');
        return false;
      }

      const now = Timestamp.now();
      const lastActivity = sessionData.lastActivityAt;

      // Charger le timeout depuis settings
      const securitySettings = await FirebaseSettingsService.loadSecuritySettings(clubId);
      const timeoutMs = securitySettings.idleTimeoutMinutes * 60 * 1000;

      const timeSinceActivity = now.toMillis() - lastActivity.toMillis();

      if (timeSinceActivity > timeoutMs) {
        console.log(`❌ Session expirée: ${Math.round(timeSinceActivity / 60000)} min depuis dernière activité (max: ${securitySettings.idleTimeoutMinutes} min)`);
        return false;
      }

      console.log(`✅ Session valide: ${Math.round(timeSinceActivity / 60000)} min depuis dernière activité`);
      return true;
    } catch (error) {
      console.error('❌ Erreur validation session:', error);
      // En cas d'erreur, considérer la session comme invalide (sécurité)
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
        console.log('⚠️ Pas de sessionId pour terminer');
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

      console.log('🚪 Session terminée:', sid);
    } catch (error) {
      console.error('❌ Erreur terminaison session:', error);
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
        console.log(`🧹 ${cleanedCount} sessions expirées nettoyées`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('❌ Erreur nettoyage sessions:', error);
      return 0;
    }
  }

  /**
   * Obtenir les informations sur l'appareil
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
