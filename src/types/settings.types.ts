import { Timestamp } from 'firebase/firestore';

/**
 * Durées de timeout d'inactivité disponibles (en minutes)
 */
export type IdleTimeoutDuration = 15 | 30 | 60 | 120 | 240 | 480;

/**
 * Paramètres de sécurité du club
 */
export interface SecuritySettings {
  /**
   * Activer la déconnexion automatique après inactivité
   */
  autoLogoutEnabled: boolean;

  /**
   * Durée d'inactivité avant déconnexion (en minutes)
   * @default 30
   */
  idleTimeoutMinutes: IdleTimeoutDuration;

  /**
   * Durée d'avertissement avant déconnexion (en minutes)
   * @default 2
   */
  warningBeforeMinutes: number;

  /**
   * Date de dernière mise à jour
   */
  updatedAt?: Timestamp;

  /**
   * ID de l'utilisateur qui a mis à jour les paramètres
   */
  updatedBy?: string;
}

/**
 * Paramètres généraux du club
 */
export interface GeneralSettings {
  /**
   * Seuil de montant pour la double approbation (en euros)
   */
  doubleApprovalThreshold: number;

  /**
   * Activer la double approbation
   */
  enableDoubleApproval: boolean;

  /**
   * Nom du club
   */
  clubName: string;

  /**
   * Année fiscale en cours
   */
  fiscalYear: number;

  /**
   * Devise utilisée
   * @default 'EUR'
   */
  currency: string;

  /**
   * Date de dernière mise à jour
   */
  updatedAt?: Timestamp;

  /**
   * ID de l'utilisateur qui a mis à jour les paramètres
   */
  updatedBy?: string;
}

/**
 * Options de durée d'inactivité pour l'interface utilisateur
 */
export interface IdleTimeoutOption {
  value: IdleTimeoutDuration;
  label: string;
  description: string;
}

/**
 * Options de durée d'inactivité disponibles
 */
export const IDLE_TIMEOUT_OPTIONS: IdleTimeoutOption[] = [
  {
    value: 15,
    label: '15 minutes',
    description: 'Pour les tests et environnements à haute sécurité'
  },
  {
    value: 30,
    label: '30 minutes',
    description: 'Recommandé - Équilibre entre sécurité et confort'
  },
  {
    value: 60,
    label: '1 heure',
    description: 'Pour les sessions de travail prolongées'
  },
  {
    value: 120,
    label: '2 heures',
    description: 'Sessions longues avec pauses occasionnelles'
  },
  {
    value: 240,
    label: '4 heures',
    description: 'Journée de travail complète'
  },
  {
    value: 480,
    label: '8 heures',
    description: 'Journée de travail étendue'
  }
];

/**
 * Paramètres de sécurité par défaut
 */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  autoLogoutEnabled: true,
  idleTimeoutMinutes: 15,       // 15 minutes par défaut
  warningBeforeMinutes: 2       // 2 minutes d'avertissement
};

/**
 * Paramètres de téléchargement des justificatifs
 */
export interface DownloadSettings {
  /**
   * Activer/désactiver le renommage automatique des fichiers
   * @default true
   */
  autoRenameFiles: boolean;

  /**
   * Pattern du nom de fichier
   * Variables disponibles: {ANNÉE}, {NUMÉRO}, {DATE}, {DESCRIPTION}, {ext}
   * @default "{ANNÉE}-{NUMÉRO} - {DATE} {DESCRIPTION}.{ext}"
   */
  filenamePattern: string;

  /**
   * Utiliser le numéro de séquence de la transaction bancaire liée (si disponible)
   * Sinon, utilise '00000' par défaut
   * @default false
   */
  useTransactionNumber: boolean;

  /**
   * Date de dernière mise à jour
   */
  updatedAt?: Timestamp;

  /**
   * ID de l'utilisateur qui a mis à jour les paramètres
   */
  updatedBy?: string;
}

/**
 * Paramètres de téléchargement par défaut
 */
export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  autoRenameFiles: true,          // Renommage activé par défaut
  filenamePattern: '{ANNÉE}-{NUMÉRO} - {DATE} {DESCRIPTION}.{ext}',
  useTransactionNumber: false     // Utiliser '00000' par défaut
};
