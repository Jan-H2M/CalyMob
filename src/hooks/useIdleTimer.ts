import { useEffect, useRef, useState, useCallback } from 'react';
import { SessionService } from '@/services/sessionService';
import { logger } from '@/utils/logger';

export interface IdleTimerOptions {
  /**
   * ID du club (pour mettre à jour la session Firestore)
   */
  clubId?: string;

  /**
   * ID de l'utilisateur (pour mettre à jour la session Firestore)
   */
  userId?: string;

  /**
   * Durée d'inactivité avant déconnexion (en minutes)
   */
  timeoutMinutes: number;

  /**
   * Durée d'avertissement avant déconnexion (en minutes)
   */
  warningBeforeMinutes: number;

  /**
   * Callback appelé quand le timer d'avertissement commence
   */
  onWarning?: () => void;

  /**
   * Callback appelé quand l'utilisateur est inactif trop longtemps
   */
  onIdle: () => void;

  /**
   * Si false, le timer ne démarre pas
   */
  enabled?: boolean;
}

export interface IdleTimerState {
  /**
   * Le timer est-il en mode avertissement?
   */
  isWarning: boolean;

  /**
   * Temps restant avant déconnexion (en secondes)
   */
  remainingSeconds: number;

  /**
   * Réinitialise le timer (appelé quand l'utilisateur clique "Rester connecté")
   */
  reset: () => void;
}

/**
 * Hook personnalisé pour détecter l'inactivité de l'utilisateur
 * et déclencher une déconnexion automatique après un certain temps
 */
export function useIdleTimer(options: IdleTimerOptions): IdleTimerState {
  const {
    clubId,
    userId,
    timeoutMinutes,
    warningBeforeMinutes,
    onWarning,
    onIdle,
    enabled = true
  } = options;

  const [isWarning, setIsWarning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isIdleLogoutTriggeredRef = useRef<boolean>(false); // Flag pour savoir si la déconnexion a été déclenchée

  /**
   * Nettoie tous les timers
   */
  const clearTimers = useCallback(() => {
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  /**
   * Démarre le compte à rebours de l'avertissement
   */
  const startWarningCountdown = useCallback(() => {
    const warningSeconds = warningBeforeMinutes * 60;
    setRemainingSeconds(warningSeconds);

    // Mettre à jour le compteur chaque seconde
    countdownIntervalRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [warningBeforeMinutes]);

  /**
   * Démarre les timers d'inactivité
   */
  const startTimers = useCallback(() => {
    if (!enabled) {
      return;
    }

    const now = Date.now();

    clearTimers();
    setIsWarning(false);
    lastActivityRef.current = now;

    // Timer pour l'avertissement
    const warningMs = (timeoutMinutes - warningBeforeMinutes) * 60 * 1000;

    warningTimeoutRef.current = setTimeout(() => {
      logger.debug(`⏰ [IDLE TIMER] AVERTISSEMENT - Déconnexion dans ${warningBeforeMinutes} min si aucune activité`);
      setIsWarning(true);
      startWarningCountdown();
      onWarning?.();
    }, warningMs);

    // Timer pour la déconnexion
    const idleMs = timeoutMinutes * 60 * 1000;

    idleTimeoutRef.current = setTimeout(() => {
      logger.debug(`🚪 [IDLE TIMER] DÉCONNEXION - Inactivité détectée`);
      isIdleLogoutTriggeredRef.current = true; // Marquer que la déconnexion est légitime
      clearTimers();
      onIdle();
    }, idleMs);
  }, [enabled, timeoutMinutes, warningBeforeMinutes, onWarning, onIdle, clearTimers, startWarningCountdown]);

  /**
   * Réinitialise le timer (appelé lors d'une activité utilisateur)
   */
  const reset = useCallback(() => {
    isIdleLogoutTriggeredRef.current = false; // Réinitialiser le flag
    startTimers();
  }, [startTimers]);

  /**
   * Gère les événements d'activité utilisateur
   */
  const handleActivity = useCallback(() => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityRef.current;

    // Éviter de traiter l'activité trop souvent (debounce de 1 seconde)
    if (timeSinceLastActivity < 1000) return;

    lastActivityRef.current = now;

    // Mettre à jour localStorage immédiatement (gratuit, instantané)
    localStorage.setItem('lastActivity', now.toString());

    // Mettre à jour la session Firestore (debounced dans le service)
    if (clubId && userId) {
      SessionService.updateSessionActivity(clubId, userId).catch((error) => {
        logger.error('❌ Erreur update session activity:', error);
      });
    }

    // ✅ TOUJOURS reset le timer lors d'une activité utilisateur
    // C'est le comportement attendu d'un idle timeout: tant que l'utilisateur est actif, il reste connecté
    // Le debounce de 1 seconde évite les resets trop fréquents

    // Only log during warning mode to avoid console spam
    if (isWarning) {
      logger.debug('✅ [IDLE TIMER] Activité détectée pendant avertissement - Reset du timer');
    }
    reset();
  }, [isWarning, reset, clubId, userId]);

  // Démarrer les timers au montage et lors des changements de config
  useEffect(() => {
    // Réinitialiser le flag au montage
    isIdleLogoutTriggeredRef.current = false;

    if (enabled) {
      startTimers();
    } else {
      clearTimers();
    }

    return () => {
      // Ne pas déclencher la déconnexion si c'est juste un unmount (HMR reload, navigation, etc.)
      // La déconnexion ne doit se produire que si le timer idle a expiré
      clearTimers();
    };
  }, [enabled, startTimers, clearTimers]);

  // Écouter les événements d'activité utilisateur
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const events = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click'
    ];

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, handleActivity]);

  return {
    isWarning,
    remainingSeconds,
    reset
  };
}
