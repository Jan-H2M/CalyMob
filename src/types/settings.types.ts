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

/**
 * Paramètres de compatibilité pour CalyMob et CalyCompta
 */
export interface CompatibilitySettings {
  calymob: {
    ios: {
      minSupported: string;      // minimum iOS versie
      minRecommended: string;    // aanbevolen iOS versie
      currentTested: string;     // laatst geteste iOS versie
    };
    android: {
      minSupported: number;      // minimum Android API level
      minRecommended: number;    // aanbevolen Android API level
      currentTested: number;     // laatst geteste Android API level
    };
  };
  calycompta: {
    browsers: {
      [browserName: string]: {
        minSupported: number | null;    // null = niet ondersteund
        minRecommended: number | null;
        status: 'supported' | 'untested' | 'unsupported';
      };
    };
  };
  messages: {
    unsupported: string;     // "Votre navigateur n'est pas pris en charge"
    warning: string;         // "Une version plus récente est disponible"
    browserUntested: string; // "Ce navigateur n'a pas été testé"
  };
  updatedAt?: Timestamp;
  updatedBy?: string;
}

/**
 * Paramètres de catégorisation automatique des transactions
 */
export interface CategorizationSettings {
  /**
   * Seuil de score pour la catégorisation automatique (0-100)
   * Au-dessus de ce seuil, la transaction est catégorisée automatiquement
   * @default 95
   */
  autoCategorizeThreshold: number;

  /**
   * Seuil de score pour afficher une suggestion (0-100)
   * Au-dessus de ce seuil, la suggestion est affichée à l'utilisateur
   * @default 70
   */
  suggestThreshold: number;

  /**
   * Seuil de score nécessitant une révision manuelle (0-100)
   * En dessous de ce seuil, la transaction nécessite une catégorisation manuelle
   * @default 50
   */
  requireConfirmationThreshold: number;

  /**
   * Activer la catégorisation automatique
   * Si false, toutes les transactions nécessitent une confirmation manuelle
   * @default false
   */
  autoCategorizeEnabled: boolean;

  /**
   * Afficher les scores de confiance aux utilisateurs
   * @default true
   */
  showConfidenceScores: boolean;

  /**
   * Afficher les explications des suggestions
   * @default true
   */
  showExplanations: boolean;

  /**
   * Notifier lors de transactions à faible confiance
   * @default false
   */
  notifyOnLowConfidence: boolean;

  /**
   * Notifier lors de la détection d'anomalies
   * @default false
   */
  notifyOnAnomaly: boolean;

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
 * Paramètres de catégorisation par défaut
 */
export const DEFAULT_CATEGORIZATION_SETTINGS: CategorizationSettings = {
  autoCategorizeThreshold: 95,           // 95%+ = catégorisation auto
  suggestThreshold: 70,                  // 70%+ = suggestion affichée
  requireConfirmationThreshold: 50,      // <50% = révision manuelle requise
  autoCategorizeEnabled: false,          // Désactivé par défaut (prudent)
  showConfidenceScores: true,            // Afficher les scores
  showExplanations: true,                // Afficher les raisons
  notifyOnLowConfidence: false,          // Pas de notification par défaut
  notifyOnAnomaly: false                 // Pas de notification par défaut
};

/**
 * IBAN connu pour catégorisation automatique
 *
 * Permet de pré-configurer des IBANs pour catégorisation automatique
 * sans apprentissage (assurances, fournisseurs réguliers, etc.)
 */
export interface KnownIban {
  /**
   * ID du document Firebase
   */
  id?: string;

  /**
   * IBAN normalisé (sans espaces, majuscules)
   */
  iban: string;

  /**
   * Nom du bénéficiaire/payeur
   */
  name: string;

  /**
   * Catégorie associée
   */
  category: string;

  /**
   * Code comptable à appliquer automatiquement
   */
  accountCode: string;

  /**
   * Catégoriser automatiquement sans confirmation
   * @default true
   */
  autoCategorize: boolean;

  /**
   * Nombre de transactions vues avec cet IBAN
   */
  transactionCount: number;

  /**
   * Date de dernière transaction
   */
  lastSeen?: Timestamp;

  /**
   * Notes optionnelles (ex: "Prime annuelle", "Location mensuelle")
   */
  notes?: string;

  /**
   * Créé par (userId)
   */
  createdBy?: string;

  /**
   * Date de création
   */
  createdAt?: Timestamp;

  /**
   * Dernière mise à jour
   */
  updatedAt?: Timestamp;
}

// ============================================================================
// LIFRAS RULES SETTINGS — Règles de composition des palanquées (MIL 2026)
// ============================================================================

/**
 * Paramètres complets pour les règles LIFRAS de composition de palanquées.
 * Stocké dans Firestore: clubs/{clubId}/settings/lifras_rules
 */
export interface LifrasRulesSettings {
  /**
   * Matrice de profondeur symétrique.
   * Clé1 = niveau A, Clé2 = niveau B, valeur = profondeur max (m) ou null si interdit.
   * Niveaux: NB, 1, 2, 3, 4, AM, MC, MF, MN
   */
  depthMatrix: Record<string, Record<string, number | null>>;

  /**
   * Règles spécifiques NB — §8 Plongée Découverte
   */
  nbRules: {
    /** Max NB par moniteur dans une palanquée (défaut: 1) */
    maxNbPerMoniteur: number;
    /** Taille max d'une palanquée avec NB (défaut: 3) */
    maxPalanqueeSizeWithNb: number;
    /** Profondeur max pour NB (défaut: 15m) */
    maxDepthNb: number;
    /** NB ne peut plonger qu'avec MC/MF/MN (défaut: true) */
    requireMoniteur: boolean;
  };

  /**
   * Règles spécifiques 1★ — §1.7.3
   */
  oneStarRules: {
    /** Max plongeurs 1★ par palanquée (défaut: 4) */
    max1StarPerPalanquee: number;
    /** Chef de palanquée obligatoire min 3★ (défaut: true) */
    requireCP: boolean;
    /** No Deco obligatoire (défaut: true) */
    noDecoRequired: boolean;
    /** Profondeur max pour 1★ (défaut: 20m) */
    maxDepth1Star: number;
  };

  /**
   * Règles spécifiques 2★ — §25.1.2
   */
  twoStarRules: {
    /** 2★+2★ doivent avoir 18 ans (défaut: true) */
    requireAge18WithPeer: boolean;
  };

  /**
   * Règles Zélande — §5.1
   */
  zealandRules: {
    /** Taille max d'une palanquée en Zélande (défaut: 3) */
    maxPalanqueeSize: number;
    /** Max palanquées de 3 autorisées (défaut: 1) */
    maxPalanqueesOf3: number;
    /** Lampe de plongée obligatoire (défaut: true) */
    requireLamp: boolean;
    /** Dragonne obligatoire (défaut: true) */
    requireDragonne: boolean;
    /** Palanquée de 3 = No Deco (défaut: true) */
    palanqueeOf3NoDeco: boolean;
  };

  /**
   * Recommandations de profondeur — §1.7.4
   */
  depthRecommendations: {
    /** Profondeur max recommandée en lacs/carrières (défaut: 40m) */
    maxDepthLakeQuarry: number;
    /** Profondeur max recommandée sur air (défaut: 60m) */
    maxDepthAir: number;
  };

  /** Référence source (ex: "MIL LIFRAS 2026") */
  sourceReference: string;

  updatedAt?: Timestamp;
  updatedBy?: string;
}

/**
 * Valeurs par défaut pour les règles LIFRAS MIL 2026
 */
export const DEFAULT_LIFRAS_RULES: Omit<LifrasRulesSettings, 'updatedAt' | 'updatedBy'> = {
  depthMatrix: {
    'NB': { 'NB': null, '1': null, '2': null, '3': null, '4': null, 'AM': 15, 'MC': 15, 'MF': 15, 'MN': 15 },
    '1':  { 'NB': null, '1': null, '2': null, '3': 20, '4': 20, 'AM': 20, 'MC': 20, 'MF': 20, 'MN': 20 },
    '2':  { 'NB': null, '1': null, '2': 20, '3': 30, '4': 40, 'AM': 40, 'MC': 40, 'MF': 40, 'MN': 40 },
    '3':  { 'NB': null, '1': 20, '2': 30, '3': 40, '4': 40, 'AM': 40, 'MC': 40, 'MF': 40, 'MN': 40 },
    '4':  { 'NB': null, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60 },
    'AM': { 'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60 },
    'MC': { 'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60 },
    'MF': { 'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60 },
    'MN': { 'NB': 15, '1': 20, '2': 40, '3': 40, '4': 60, 'AM': 60, 'MC': 60, 'MF': 60, 'MN': 60 },
  },
  nbRules: {
    maxNbPerMoniteur: 1,
    maxPalanqueeSizeWithNb: 3,
    maxDepthNb: 15,
    requireMoniteur: true,
  },
  oneStarRules: {
    max1StarPerPalanquee: 4,
    requireCP: true,
    noDecoRequired: true,
    maxDepth1Star: 20,
  },
  twoStarRules: {
    requireAge18WithPeer: true,
  },
  zealandRules: {
    maxPalanqueeSize: 3,
    maxPalanqueesOf3: 1,
    requireLamp: true,
    requireDragonne: true,
    palanqueeOf3NoDeco: true,
  },
  depthRecommendations: {
    maxDepthLakeQuarry: 40,
    maxDepthAir: 60,
  },
  sourceReference: 'MIL LIFRAS 2026',
}
