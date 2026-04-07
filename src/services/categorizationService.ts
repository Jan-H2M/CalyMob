import { TransactionBancaire, AccountCode, Categorie } from '@/types';
import accountMappings from '@/config/account-mappings.json';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes, getCalypsoAccountCodesByType } from '@/config/calypso-accounts';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, increment, serverTimestamp, orderBy, limit, writeBatch } from 'firebase/firestore';
import { FirebaseSettingsService } from './firebaseSettingsService';
import { logger } from '@/utils/logger';

interface CategorizationRule {
  keywords: string[];
  category: string;
  accountCode: string;
  confidence: number;
}

interface CategorizationPattern {
  id?: string;
  contrepartie_normalized: string;
  keywords: string[];
  categorie: string;
  code_comptable: string;
  use_count: number;
  last_used: Date;
  created_at: Date;
}

/**
 * Seasonal boost configuration for categories
 * Certain categories are more likely during specific months
 */
interface SeasonalBoost {
  category: string;       // Category ID (must match DEFAULT_CATEGORIES)
  months: number[];       // 1-12 (January = 1)
  boost: number;          // Points to add (10-30)
  keywords?: string[];    // Optional: extra keywords that reinforce this season
  description: string;    // For admin UI/debugging
}

/**
 * Anti-pattern learned from corrections
 * When users correct a categorization, we record what was wrong to avoid repeating the same mistake
 */
interface AntiPattern {
  id?: string;
  wrong_code: string;                 // The code that was incorrectly suggested
  correct_code: string;               // The code the user corrected it to
  contrepartie_normalized?: string;   // Counterparty name (normalized)
  keyword?: string;                   // Primary keyword that led to wrong suggestion
  iban?: string;                      // IBAN if applicable
  correction_count: number;           // How many times this correction was made
  last_corrected: Date;               // Last time this was corrected
  created_at: Date;
}

const DEFAULT_CATEGORIES: Categorie[] = [
  // Category IDs must match the 'categories' field in calypso-accounts.ts
  // isFrequent: true = shown at top of filter list with star

  // ═══════════════════════════════════════════════════════════
  // REVENUS (type: 'revenu')
  // ═══════════════════════════════════════════════════════════
  { id: 'cotisations_revenu', nom: 'Cotisations', label_court: 'Cotis', type: 'revenu', couleur: '#10b981', isFrequent: true },
  { id: 'sorties_revenu', nom: 'Sorties plongées', label_court: 'Sorties', type: 'revenu', couleur: '#06b6d4', isFrequent: true },
  { id: 'evenements_revenu', nom: 'Événements', label_court: 'Events', type: 'revenu', couleur: '#3b82f6', isFrequent: false },
  { id: 'piscine_revenu', nom: 'Piscine', label_court: 'Piscine', type: 'revenu', couleur: '#f59e0b', isFrequent: false },
  { id: 'boutique_revenu', nom: 'Boutique', label_court: 'Boutique', type: 'revenu', couleur: '#ec4899', isFrequent: false },
  { id: 'activites_revenu', nom: 'Activités', label_court: 'Activités', type: 'revenu', couleur: '#8b5cf6', isFrequent: false },
  { id: 'frais_bancaires_revenu', nom: 'Intérêts bancaires', label_court: 'Banque', type: 'revenu', couleur: '#64748b', isFrequent: false },
  { id: 'divers_revenu', nom: 'Divers', label_court: 'Divers', type: 'revenu', couleur: '#94a3b8', isFrequent: false },
  { id: 'subsides', nom: 'Subsides', label_court: 'Subsides', type: 'revenu', couleur: '#14b8a6', isFrequent: false },

  // ═══════════════════════════════════════════════════════════
  // DÉPENSES (type: 'depense')
  // ═══════════════════════════════════════════════════════════
  { id: 'cotisations_depense', nom: 'Cotisations', label_court: 'Cotis', type: 'depense', couleur: '#10b981', isFrequent: true },
  { id: 'sorties_depense', nom: 'Sorties plongées', label_court: 'Sorties', type: 'depense', couleur: '#0891b2', isFrequent: true },
  { id: 'piscine_depense', nom: 'Piscine', label_court: 'Piscine', type: 'depense', couleur: '#f59e0b', isFrequent: true },
  { id: 'materiel', nom: 'Matériel', label_court: 'Matériel', type: 'depense', couleur: '#ef4444', isFrequent: true },
  { id: 'evenements_depense', nom: 'Événements', label_court: 'Events', type: 'depense', couleur: '#3b82f6', isFrequent: false },
  { id: 'boutique_depense', nom: 'Boutique', label_court: 'Boutique', type: 'depense', couleur: '#ec4899', isFrequent: false },
  { id: 'activites_depense', nom: 'Activités', label_court: 'Activités', type: 'depense', couleur: '#8b5cf6', isFrequent: false },
  { id: 'frais_bancaires_depense', nom: 'Frais bancaires', label_court: 'Banque', type: 'depense', couleur: '#64748b', isFrequent: false },
  { id: 'divers_depense', nom: 'Divers', label_court: 'Divers', type: 'depense', couleur: '#94a3b8', isFrequent: false },
  { id: 'reunions', nom: 'Réunions', label_court: 'Réunions', type: 'depense', couleur: '#8b5cf6', isFrequent: false },
  { id: 'formation', nom: 'Formation', label_court: 'Formation', type: 'depense', couleur: '#a855f7', isFrequent: false },
  { id: 'administration', nom: 'Administration', label_court: 'Admin', type: 'depense', couleur: '#6366f1', isFrequent: false },
  { id: 'assurances', nom: 'Assurances', label_court: 'Assur.', type: 'depense', couleur: '#ec4899', isFrequent: false }
];

/**
 * Seasonal boosts: boost category scores based on time of year
 * Based on typical diving club activity patterns
 */
const SEASONAL_BOOSTS: SeasonalBoost[] = [
  // Cotisations: peak during inscription periods (Sep-Oct for new season, Jan-Feb for renewals)
  {
    category: 'cotisations_revenu',
    months: [1, 2, 9, 10],
    boost: 20,
    keywords: ['inscription', 'renouvellement', 'adhesion', 'affiliation'],
    description: "Période d'inscription"
  },
  {
    category: 'cotisations_depense',
    months: [1, 2, 9, 10],
    boost: 20,
    keywords: ['lifras', 'affiliation', 'cotisation club'],
    description: "Période d'affiliation Lifras"
  },

  // Sorties/voyages: peak during summer (June-August) and spring breaks
  {
    category: 'sorties_revenu',
    months: [4, 5, 6, 7, 8],
    boost: 25,
    keywords: ['hurghada', 'malte', 'egypte', 'mer rouge', 'croatie', 'zeeland'],
    description: 'Saison des voyages plongée'
  },
  {
    category: 'sorties_depense',
    months: [4, 5, 6, 7, 8],
    boost: 25,
    keywords: ['hurghada', 'malte', 'egypte', 'mer rouge', 'croatie', 'hotel', 'vol'],
    description: 'Saison des voyages plongée'
  },

  // Événements: peak during holiday season (Nov-Dec for annual party)
  {
    category: 'evenements_revenu',
    months: [11, 12],
    boost: 20,
    keywords: ['calyfiesta', 'soiree', 'fete', 'annuel', 'noel'],
    description: 'Période des événements'
  },
  {
    category: 'evenements_depense',
    months: [11, 12],
    boost: 20,
    keywords: ['calyfiesta', 'soiree', 'fete', 'traiteur', 'salle'],
    description: 'Période des événements'
  },

  // Piscine: pool season (school year: Sep-May)
  {
    category: 'piscine_depense',
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5],
    boost: 15,
    keywords: ['piscine', 'bassin', 'woluwe', 'poseidon'],
    description: 'Saison piscine'
  },
  {
    category: 'piscine_revenu',
    months: [9, 10, 11, 12, 1, 2, 3, 4, 5],
    boost: 15,
    keywords: ['entree', 'bassin', 'vacances'],
    description: 'Saison piscine'
  },

  // Assurances: typically renewed at start of year
  {
    category: 'assurances',
    months: [1, 2, 3],
    boost: 15,
    keywords: ['assurance', 'ethias', 'prime'],
    description: 'Renouvellement assurances'
  },

  // Formation: peak during pool season when courses happen
  {
    category: 'formation',
    months: [10, 11, 12, 1, 2, 3, 4],
    boost: 12,
    keywords: ['formation', 'brevet', 'cours', 'moniteur', 'stage'],
    description: 'Saison des formations'
  }
];

export class CategorizationService {
  private static rules: CategorizationRule[] = [
    // ===== COTISATIONS ET AFFILIATIONS =====
    {
      keywords: ['cotisation membre', 'cotisation annuelle', 'adhesion', 'inscription membre', 'inscription club'],
      category: 'cotisation',
      accountCode: '730-00-712',
      confidence: 95
    },
    {
      keywords: ['lifras cotisation', 'lifras club', 'cotisation lifras'],
      category: 'cotisation',
      accountCode: '730-00-610',
      confidence: 98
    },
    {
      keywords: ['lifras membre', 'licence lifras', 'febras', 'affiliation lifras', 'reaffiliation'],
      category: 'cotisation',
      accountCode: '730-00-611',
      confidence: 95
    },
    // Règle plus générique pour les inscriptions avec montants typiques
    {
      keywords: ['inscription', 'cotisation'],
      category: 'cotisation',
      accountCode: '730-00-712',
      confidence: 70 // Plus bas car plus générique
    },

    // ===== PISCINE =====
    {
      keywords: ['piscine', 'location piscine', 'woluwe sport', 'poseidon', 'entrainement piscine', 'seance piscine'],
      category: 'piscine',
      accountCode: '610-00-621',
      confidence: 95
    },

    // ===== MATÉRIEL =====
    {
      keywords: ['compresseur', 'gonflage', 'air comprime', 'bloc', 'bouteille'],
      category: 'materiel',
      accountCode: '612-00-623',
      confidence: 90
    },
    {
      keywords: ['materiel plongee', 'detendeur', 'palmes', 'masque', 'combinaison', 'stab', 'gilet', 'phare', 'lampe'],
      category: 'materiel',
      accountCode: '612-00-624',
      confidence: 85
    },
    {
      keywords: ['materiel', 'equipement'],
      category: 'materiel',
      accountCode: '612-00-624',
      confidence: 60 // Plus générique
    },

    // ===== ÉVÉNEMENTS ET SORTIES =====
    {
      keywords: ['calyfiesta', 'soiree annuelle', 'fete du club', 'soiree calypso'],
      category: 'evenement',
      accountCode: '',  // Dépend si c'est une entrée ou sortie
      confidence: 95
    },
    {
      keywords: ['sortie mer', 'ecole de mer', 'zeeland', 'zelande', 'oostende', 'nieuport'],
      category: 'evenement',
      accountCode: '',
      confidence: 90
    },
    {
      keywords: ['hurghada', 'egypte', 'malte', 'croatie', 'espagne', 'portugal', 'grece', 'croisette'],
      category: 'evenement',
      accountCode: '',
      confidence: 92
    },
    {
      keywords: ['sortie plongee', 'week-end plongee', 'voyage plongee', 'sortie', 'excursion'],
      category: 'evenement',
      accountCode: '',
      confidence: 85
    },

    // ===== FORMATION =====
    {
      keywords: ['formation', 'brevet', 'cours', 'stage', 'examen'],
      category: 'formation',
      accountCode: '616-00-645',
      confidence: 90
    },
    {
      keywords: ['moniteur', 'instructeur', 'encadrement'],
      category: 'formation',
      accountCode: '616-00-645',
      confidence: 85
    },
    {
      keywords: ['bapteme', 'decouverte', 'initiation'],
      category: 'formation',
      accountCode: '616-00-645',
      confidence: 88
    },

    // ===== ADMINISTRATION =====
    {
      keywords: ['ovh', 'site web', 'hebergement', 'domaine', 'hosting', 'internet'],
      category: 'administration',
      accountCode: '614-00-643',
      confidence: 98
    },
    {
      keywords: ['papeterie', 'fourniture', 'bureau', 'impression', 'photocopie'],
      category: 'administration',
      accountCode: '614-00-641',
      confidence: 85
    },
    {
      keywords: ['poste', 'timbre', 'envoi', 'colis'],
      category: 'administration',
      accountCode: '614-00-642',
      confidence: 85
    },

    // ===== FRAIS BANCAIRES =====
    {
      keywords: ['banque', 'frais bancaire', 'commission', 'frais de compte', 'frais carte', 'interet'],
      category: 'frais_bancaires',
      accountCode: '657-00-660',
      confidence: 95
    },

    // ===== ASSURANCE =====
    {
      keywords: ['assurance', 'ethias', 'rc', 'responsabilite civile', 'police', 'prime'],
      category: 'assurance',
      accountCode: '611-00-616',
      confidence: 95
    },

    // ===== RÉUNIONS =====
    {
      keywords: ['reunion', 'ag', 'assemblee', 'comite', 'conseil'],
      category: 'reunions',
      accountCode: '613-00-631',
      confidence: 85
    },
    {
      keywords: ['restaurant', 'repas', 'catering', 'traiteur'],
      category: 'reunions',
      accountCode: '613-00-632',
      confidence: 75
    },

    // ===== SUBSIDES =====
    {
      keywords: ['subside', 'subsidie', 'subvention'],
      category: 'subside',
      accountCode: '15-000-770',
      confidence: 95
    },
    {
      keywords: ['commune', 'communal', 'adeps', 'region', 'provincial'],
      category: 'subside',
      accountCode: '15-000-770',
      confidence: 85
    }
  ];

  /**
   * Obtient tous les codes comptables disponibles
   */
  static getAllAccountCodes(): AccountCode[] {
    // Use AccountCodeService if ready, otherwise fallback to static codes
    if (AccountCodeService.isReady()) {
      return AccountCodeService.getActiveCodes();
    }
    return calypsoAccountCodes;
  }

  /**
   * Récupère un code comptable par son code
   */
  static getAccountCodeByCode(code: string): AccountCode | undefined {
    // Use AccountCodeService if ready, otherwise fallback to static codes
    if (AccountCodeService.isReady()) {
      return AccountCodeService.getByCode(code);
    }
    return calypsoAccountCodes.find((c: AccountCode) => c.code === code);
  }

  /**
   * Filtre les codes comptables par type (revenu/dépense)
   */
  static getAccountCodesByType(isExpense: boolean): AccountCode[] {
    // Use AccountCodeService if ready, otherwise fallback to static codes
    if (AccountCodeService.isReady()) {
      const type = isExpense ? 'expense' : 'revenue';
      return AccountCodeService.getByType(type);
    }
    return getCalypsoAccountCodesByType(isExpense);
  }

  /**
   * Extrait les mots-clés pour l'apprentissage (version publique)
   * Retourne tous les mots-clés détectés avec leur catégorie
   */
  static extractKeywordsForLearning(communication: string): { keyword: string; weight: number; category?: string }[] {
    return this.extractAllKeywords(communication);
  }

  /**
   * Filtre les codes comptables selon la catégorie sélectionnée
   *
   * NOUVEAU: Priorise selectedCodes (liste explicite) si défini.
   * LEGACY: Utilise compte_comptable (filtrage par préfixe) en fallback.
   *
   * Gère 3 types de filtres par préfixe (compte_comptable de la catégorie):
   * 1. Code complet exact: '618-00-732' → ne retourne QUE ce code
   * 2. Préfixe avec tiret: '618-00' → codes commençant par '618-00-'
   * 3. Préfixe court: '613' → codes commençant par '613' ou '613-'
   *
   * Les codes sont triés avec les fréquents en premier.
   *
   * @param categoryId - ID de la catégorie sélectionnée
   * @param isExpense - true pour dépenses, false pour revenus
   * @returns Liste de codes comptables filtrés et triés
   */
  static getAccountCodesForCategory(categoryId: string, isExpense: boolean): AccountCode[] {
    const category = this.getAllCategories().find(c => c.id === categoryId);
    const allCodes = this.getAccountCodesByType(isExpense);

    // NOUVEAU: Si selectedCodes existe et n'est pas vide, l'utiliser en priorité
    if (category?.selectedCodes && category.selectedCodes.length > 0) {
      const selectedSet = new Set(category.selectedCodes);
      const filtered = allCodes.filter(code => selectedSet.has(code.code));
      return this.sortAccountCodes(filtered);
    }

    // LEGACY: Fallback sur le filtrage par préfixe (compte_comptable)
    // Si pas de filtre défini dans la catégorie, retourner tous les codes
    if (!category?.compte_comptable) {
      return this.sortAccountCodes(allCodes);
    }

    const filter = category.compte_comptable;

    // Filtrer selon le type de filtre (avec déduplication via Set)
    const matchedCodes = new Set<string>();
    const filtered: AccountCode[] = [];

    for (const code of allCodes) {
      // Éviter les doublons
      if (matchedCodes.has(code.code)) continue;

      // 1. Correspondance exacte (code complet)
      if (code.code === filter) {
        matchedCodes.add(code.code);
        filtered.push(code);
        continue;
      }

      // 2. Préfixe avec tiret suivi d'un autre tiret (ex: '730-00' → '730-00-XXX')
      if (filter.includes('-') && code.code.startsWith(filter + '-')) {
        matchedCodes.add(code.code);
        filtered.push(code);
        continue;
      }

      // 3. Préfixe avec tiret qui continue directement (ex: '730-00-61' → '730-00-610', '730-00-611')
      // Cette stratégie gère le cas où le préfixe se termine par un chiffre et les codes continuent
      if (filter.includes('-') && code.code.startsWith(filter) && code.code !== filter) {
        matchedCodes.add(code.code);
        filtered.push(code);
        continue;
      }

      // 4. Préfixe court sans tiret (ex: '613')
      // Match '613' ou '613-XXX-XXX'
      if (!filter.includes('-') && (code.code === filter || code.code.startsWith(filter + '-'))) {
        matchedCodes.add(code.code);
        filtered.push(code);
        continue;
      }

      // 5. Correspondance par catégorie dans les métadonnées
      if (code.categories?.includes(categoryId)) {
        matchedCodes.add(code.code);
        filtered.push(code);
        continue;
      }
    }

    // Si aucun code trouvé avec le filtre, retourner tous les codes (fallback)
    const result = filtered.length > 0 ? filtered : allCodes;

    // Trier avec fréquents en premier
    return this.sortAccountCodes(result);
  }

  /**
   * Trie les codes comptables par code
   */
  private static sortAccountCodes(codes: AccountCode[]): AccountCode[] {
    return codes.sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * Obtient toutes les catégories
   * NOTE: Cette méthode est synchrone et utilise un cache.
   * Utilisez FirebaseSettingsService.loadCategories() pour charger depuis Firebase.
   */
  static getAllCategories(): Categorie[] {
    // Essayer de charger les catégories depuis le cache (sessionStorage pour la session en cours)
    const cachedCategories = sessionStorage.getItem('appCategories_cache');
    if (cachedCategories) {
      try {
        return JSON.parse(cachedCategories);
      } catch (e) {
        logger.error('Erreur lors du chargement du cache des catégories:', e);
      }
    }

    // Fallback sur localStorage pour compatibilité
    const savedCategories = localStorage.getItem('appCategories');
    if (savedCategories) {
      try {
        const cats = JSON.parse(savedCategories);
        // Mettre en cache pour la session
        sessionStorage.setItem('appCategories_cache', savedCategories);
        return cats;
      } catch (e) {
        logger.error('Erreur lors du chargement des catégories:', e);
      }
    }

    // Utiliser les catégories par défaut si aucune sauvegarde
    return DEFAULT_CATEGORIES;
  }

  /**
   * Met à jour le cache des catégories
   */
  static updateCategoriesCache(categories: Categorie[]): void {
    sessionStorage.setItem('appCategories_cache', JSON.stringify(categories));
  }

  /**
   * Obtient les catégories filtrées par type, triées avec fréquentes en premier
   */
  static getCategoriesByType(isExpense: boolean): Categorie[] {
    const type = isExpense ? 'depense' : 'revenu';
    const allCategories = this.getAllCategories();
    const filtered = allCategories.filter(cat => cat.type === type);

    // Trier: fréquentes d'abord, puis autres par nom
    return filtered.sort((a, b) => {
      // Les fréquentes avant les non-fréquentes
      if (a.isFrequent && !b.isFrequent) return -1;
      if (!a.isFrequent && b.isFrequent) return 1;

      // Sinon, tri alphabétique par nom
      return a.nom.localeCompare(b.nom);
    });
  }

  /**
   * Sauvegarde les catégories (legacy - pour compatibilité)
   * @deprecated Utilisez FirebaseSettingsService.saveCategory() à la place
   */
  static saveCategories(categories: Categorie[]): void {
    localStorage.setItem('appCategories', JSON.stringify(categories));
    sessionStorage.setItem('appCategories_cache', JSON.stringify(categories));
  }

  /**
   * Catégorise automatiquement une transaction
   */
  static categorizeTransaction(transaction: TransactionBancaire): {
    category?: string;
    accountCode?: string;
    confidence: number;
    reason?: string;
  } {
    const isExpense = transaction.montant < 0;
    const searchText = `${transaction.contrepartie_nom} ${transaction.communication} ${transaction.details || ''}`.toLowerCase();

    let bestMatch: {
      category?: string;
      accountCode?: string;
      confidence: number;
      reason?: string;
    } = { confidence: 0 };

    // Parcourir les règles pour trouver la meilleure correspondance
    for (const rule of this.rules) {
      for (const keyword of rule.keywords) {
        if (searchText.includes(keyword.toLowerCase())) {
          let accountCode = rule.accountCode;

          // Ajuster le code comptable pour les événements selon entrée/sortie
          if (rule.category === 'evenement' && !accountCode) {
            if (searchText.includes('calyfiesta')) {
              accountCode = isExpense ? '664-00-650' : '664-00-750';
            } else if (searchText.includes('mer')) {
              accountCode = isExpense ? '617-00-630' : '617-00-730';
            } else {
              accountCode = isExpense ? '618-00-632' : '618-00-732';
            }
          }

          // Si c'est une meilleure correspondance, la garder
          if (rule.confidence > bestMatch.confidence) {
            bestMatch = {
              category: rule.category,
              accountCode: accountCode,
              confidence: rule.confidence,
              reason: `Mot-clé détecté: "${keyword}"`
            };
          }
        }
      }
    }

    // Analyse basée sur les contreparties connues
    const counterpartyAnalysis = this.analyzeCounterparty(transaction.contrepartie_nom, isExpense);
    if (counterpartyAnalysis.confidence > bestMatch.confidence) {
      bestMatch = counterpartyAnalysis;
    }

    // Analyse basée sur les montants typiques
    const amountAnalysis = this.analyzeAmount(transaction.montant);
    if (amountAnalysis.confidence > bestMatch.confidence) {
      bestMatch = amountAnalysis;
    }

    return bestMatch;
  }

  /**
   * Analyse la contrepartie pour deviner la catégorie
   */
  private static analyzeCounterparty(counterpartyName: string, isExpense: boolean): {
    category?: string;
    accountCode?: string;
    confidence: number;
    reason?: string;
  } {
    const name = counterpartyName.toLowerCase();

    // Fournisseurs connus
    const knownSuppliers: Record<string, { category: string; accountCode: string }> = {
      'ovh': { category: 'administration', accountCode: '614-00-643' },
      'ethias': { category: 'assurance', accountCode: '611-00-616' },
      'woluwe sport': { category: 'piscine', accountCode: '610-00-621' },
      'poseidon': { category: 'piscine', accountCode: '610-00-621' },
      'commune': { category: 'subside', accountCode: '15-000-770' },
      'lifras': { category: 'cotisation', accountCode: isExpense ? '730-00-610' : '730-00-711' }
    };

    for (const [supplier, info] of Object.entries(knownSuppliers)) {
      if (name.includes(supplier)) {
        return {
          category: info.category,
          accountCode: info.accountCode,
          confidence: 90,
          reason: `Contrepartie connue: ${supplier}`
        };
      }
    }

    return { confidence: 0 };
  }

  /**
   * Analyse le montant pour deviner la catégorie
   */
  private static analyzeAmount(amount: number): {
    category?: string;
    accountCode?: string;
    confidence: number;
    reason?: string;
  } {
    const absAmount = Math.abs(amount);

    // Montants typiques de cotisations
    if (absAmount === 195 || absAmount === 160 || absAmount === 180 || absAmount === 70) {
      return {
        category: 'cotisation',
        accountCode: amount > 0 ? '730-00-712' : '730-00-612',
        confidence: 70,
        reason: `Montant typique de cotisation: ${absAmount}€`
      };
    }

    // Montants typiques de location piscine
    if (absAmount >= 500 && absAmount <= 600 && amount < 0) {
      return {
        category: 'piscine',
        accountCode: '610-00-621',
        confidence: 60,
        reason: `Montant typique de location piscine: ${absAmount}€`
      };
    }

    return { confidence: 0 };
  }

  /**
   * Normalise un texte pour la recherche (lowercase, sans accents, sans espaces multiples)
   */
  private static normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Retirer les accents
      .replace(/\s+/g, ' ') // Espaces multiples → 1 espace
      .trim();
  }

  /**
   * Calculate seasonal boost for a category based on transaction date
   * Returns bonus points (0-30) if the category matches the current season
   */
  private static calculateSeasonalBoost(
    category: string,
    transactionDate: Date | undefined,
    communication?: string
  ): { boost: number; reason?: string } {
    if (!transactionDate) return { boost: 0 };

    const month = transactionDate.getMonth() + 1; // JavaScript months are 0-indexed
    const normalizedComm = communication ? this.normalizeText(communication) : '';

    // Find matching seasonal boosts for this category
    const matchingBoosts = SEASONAL_BOOSTS.filter(sb =>
      sb.category === category && sb.months.includes(month)
    );

    if (matchingBoosts.length === 0) return { boost: 0 };

    // Take the best matching boost
    let bestBoost = 0;
    let bestReason: string | undefined;

    for (const sb of matchingBoosts) {
      let boost = sb.boost;

      // Extra boost if seasonal keywords are found in communication
      if (sb.keywords && normalizedComm) {
        const keywordMatch = sb.keywords.some(kw => normalizedComm.includes(kw));
        if (keywordMatch) {
          boost += 5; // +5 bonus for keyword match in season
        }
      }

      if (boost > bestBoost) {
        bestBoost = boost;
        bestReason = `📅 ${sb.description}`;
      }
    }

    return { boost: bestBoost, reason: bestReason };
  }

  /**
   * Extrait des mots-clés de la communication
   */
  private static extractKeywords(communication: string): string[] {
    if (!communication) return [];

    const normalized = this.normalizeText(communication);
    // Garder les mots de plus de 3 caractères
    return normalized
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5); // Max 5 mots-clés
  }

  /**
   * Liste des mots-clés prioritaires pour la catégorisation
   * Organisés par catégorie pour faciliter la maintenance
   * Le poids détermine la priorité (100 = max)
   */
  private static readonly PRIORITY_KEYWORDS: { keyword: string; weight: number; category?: string }[] = [
    // ===== ÉVÉNEMENTS SPÉCIFIQUES (poids élevé car très distinctifs) =====
    { keyword: 'calyfiesta', weight: 100, category: 'evenement' },
    { keyword: 'croisette', weight: 100, category: 'evenement' },
    { keyword: 'zeeland', weight: 95, category: 'evenement' },
    { keyword: 'zelande', weight: 95, category: 'evenement' },
    { keyword: 'hurghada', weight: 98, category: 'evenement' },
    { keyword: 'malte', weight: 95, category: 'evenement' },
    { keyword: 'egypte', weight: 95, category: 'evenement' },
    { keyword: 'croatie', weight: 95, category: 'evenement' },
    { keyword: 'espagne', weight: 90, category: 'evenement' },
    { keyword: 'portugal', weight: 90, category: 'evenement' },
    { keyword: 'grece', weight: 90, category: 'evenement' },
    { keyword: 'oostende', weight: 88, category: 'evenement' },
    { keyword: 'nieuport', weight: 88, category: 'evenement' },

    // ===== COTISATIONS ET AFFILIATIONS =====
    { keyword: 'inscription', weight: 85, category: 'cotisation' },
    { keyword: 'cotisation', weight: 90, category: 'cotisation' },
    { keyword: 'affiliation', weight: 88, category: 'cotisation' },
    { keyword: 'reaffiliation', weight: 88, category: 'cotisation' },
    { keyword: 'adhesion', weight: 85, category: 'cotisation' },
    { keyword: 'membre', weight: 70, category: 'cotisation' },

    // ===== ORGANISATIONS =====
    { keyword: 'lifras', weight: 92, category: 'cotisation' },
    { keyword: 'febras', weight: 92, category: 'cotisation' },
    { keyword: 'calypso', weight: 60, category: undefined }, // Nom du club, pas de catégorie spécifique

    // ===== FORMATION =====
    { keyword: 'formation', weight: 80, category: 'formation' },
    { keyword: 'bapteme', weight: 85, category: 'formation' },
    { keyword: 'brevet', weight: 82, category: 'formation' },
    { keyword: 'cours', weight: 75, category: 'formation' },
    { keyword: 'stage', weight: 78, category: 'formation' },
    { keyword: 'examen', weight: 80, category: 'formation' },
    { keyword: 'moniteur', weight: 78, category: 'formation' },
    { keyword: 'instructeur', weight: 78, category: 'formation' },
    { keyword: 'decouverte', weight: 75, category: 'formation' },
    { keyword: 'initiation', weight: 75, category: 'formation' },

    // ===== SORTIES ET ACTIVITÉS =====
    { keyword: 'sortie', weight: 75, category: 'evenement' },
    { keyword: 'excursion', weight: 75, category: 'evenement' },
    { keyword: 'voyage', weight: 72, category: 'evenement' },
    { keyword: 'weekend', weight: 70, category: 'evenement' },
    { keyword: 'plongee', weight: 65, category: undefined }, // Trop générique

    // ===== PISCINE =====
    { keyword: 'piscine', weight: 88, category: 'piscine' },
    { keyword: 'woluwe', weight: 85, category: 'piscine' },
    { keyword: 'poseidon', weight: 85, category: 'piscine' },
    { keyword: 'entrainement', weight: 70, category: 'piscine' },

    // ===== MATÉRIEL =====
    { keyword: 'materiel', weight: 75, category: 'materiel' },
    { keyword: 'equipement', weight: 72, category: 'materiel' },
    { keyword: 'gonflage', weight: 82, category: 'materiel' },
    { keyword: 'compresseur', weight: 85, category: 'materiel' },
    { keyword: 'detendeur', weight: 80, category: 'materiel' },
    { keyword: 'bloc', weight: 75, category: 'materiel' },
    { keyword: 'bouteille', weight: 75, category: 'materiel' },
    { keyword: 'combinaison', weight: 78, category: 'materiel' },
    { keyword: 'stab', weight: 80, category: 'materiel' },
    { keyword: 'gilet', weight: 75, category: 'materiel' },
    { keyword: 'palmes', weight: 78, category: 'materiel' },
    { keyword: 'masque', weight: 75, category: 'materiel' },

    // ===== ADMINISTRATION =====
    { keyword: 'ovh', weight: 95, category: 'administration' },
    { keyword: 'hosting', weight: 85, category: 'administration' },
    { keyword: 'hebergement', weight: 82, category: 'administration' },
    { keyword: 'domaine', weight: 80, category: 'administration' },
    { keyword: 'internet', weight: 75, category: 'administration' },
    { keyword: 'papeterie', weight: 75, category: 'administration' },
    { keyword: 'fourniture', weight: 72, category: 'administration' },

    // ===== ASSURANCE =====
    { keyword: 'assurance', weight: 88, category: 'assurance' },
    { keyword: 'ethias', weight: 95, category: 'assurance' },
    { keyword: 'police', weight: 70, category: 'assurance' },
    { keyword: 'prime', weight: 68, category: 'assurance' },

    // ===== FRAIS BANCAIRES =====
    { keyword: 'frais', weight: 65, category: 'frais_bancaires' },
    { keyword: 'commission', weight: 75, category: 'frais_bancaires' },
    { keyword: 'bancaire', weight: 80, category: 'frais_bancaires' },
    { keyword: 'interet', weight: 72, category: 'frais_bancaires' },

    // ===== RÉUNIONS =====
    { keyword: 'reunion', weight: 80, category: 'reunions' },
    { keyword: 'assemblee', weight: 85, category: 'reunions' },
    { keyword: 'comite', weight: 78, category: 'reunions' },
    { keyword: 'conseil', weight: 75, category: 'reunions' },
    { keyword: 'restaurant', weight: 70, category: 'reunions' },
    { keyword: 'repas', weight: 68, category: 'reunions' },

    // ===== SUBSIDES =====
    { keyword: 'subside', weight: 92, category: 'subside' },
    { keyword: 'subsidie', weight: 92, category: 'subside' },
    { keyword: 'subvention', weight: 90, category: 'subside' },
    { keyword: 'commune', weight: 78, category: 'subside' },
    { keyword: 'communal', weight: 78, category: 'subside' },
    { keyword: 'adeps', weight: 88, category: 'subside' },
    { keyword: 'regional', weight: 75, category: 'subside' },
  ];

  /**
   * Extrait TOUS les mots-clés pertinents de la communication
   * Retourne un tableau trié par poids décroissant
   */
  private static extractAllKeywords(communication: string): { keyword: string; weight: number; category?: string }[] {
    if (!communication) return [];

    const normalized = this.normalizeText(communication);
    const foundKeywords: { keyword: string; weight: number; category?: string }[] = [];

    // Chercher tous les mots-clés prioritaires présents
    for (const kw of this.PRIORITY_KEYWORDS) {
      if (normalized.includes(kw.keyword)) {
        foundKeywords.push(kw);
      }
    }

    // Trier par poids décroissant
    return foundKeywords.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Extrait le mot-clé principal de la communication
   * Priorise les mots importants comme "Inscription", "Cotisation", "Sortie", etc.
   */
  private static extractPrimaryKeyword(communication: string): string {
    const allKeywords = this.extractAllKeywords(communication);

    if (allKeywords.length > 0) {
      return allKeywords[0].keyword;
    }

    // Fallback: prendre le premier mot significatif (> 3 caractères)
    if (!communication) return 'inconnu';
    const normalized = this.normalizeText(communication);
    const words = normalized.split(/\s+/).filter(word => word.length > 3);
    return words.length > 0 ? words[0] : 'inconnu';
  }

  /**
   * Plages de montants typiques pour les cotisations Calypso
   * Permet un matching plus précis des types de cotisations
   */
  private static readonly AMOUNT_RANGES: { min: number; max: number; label: string; typical?: string }[] = [
    // Cotisations enfants/jeunes
    { min: 65, max: 75, label: '70', typical: 'cotisation_enfant' },
    { min: 85, max: 95, label: '90', typical: 'cotisation_jeune' },

    // Cotisations adultes (différents types)
    { min: 155, max: 165, label: '160', typical: 'cotisation_adulte_reduit' },
    { min: 175, max: 185, label: '180', typical: 'cotisation_adulte' },
    { min: 190, max: 200, label: '195', typical: 'cotisation_adulte_complet' },
    { min: 215, max: 225, label: '220', typical: 'cotisation_famille' },

    // Sorties/événements typiques
    { min: 45, max: 55, label: '50', typical: 'sortie_journee' },
    { min: 95, max: 105, label: '100', typical: 'sortie_weekend' },
    { min: 145, max: 155, label: '150', typical: 'sortie_weekend_loin' },

    // Piscine
    { min: 495, max: 550, label: '520', typical: 'location_piscine' },
    { min: 550, max: 605, label: '575', typical: 'location_piscine' },
  ];

  /**
   * Arrondit un montant pour créer des groupes de montants similaires
   * AMÉLIORÉ: Utilise des plages précises pour les montants courants
   * Ex: 199.00, 195.50, 193.00 → tous deviennent "195" (cotisation adulte)
   */
  private static roundAmount(amount: number): string {
    const absAmount = Math.abs(amount);

    // Chercher dans les plages typiques
    for (const range of this.AMOUNT_RANGES) {
      if (absAmount >= range.min && absAmount <= range.max) {
        return range.label;
      }
    }

    // Fallback: arrondi intelligent selon la taille du montant
    // Pour les petits montants < 30€, arrondir à l'unité
    if (absAmount < 30) {
      return Math.round(absAmount).toString();
    }

    // Pour les montants 30-100€, arrondir à 5€
    if (absAmount < 100) {
      return (Math.round(absAmount / 5) * 5).toString();
    }

    // Pour les montants 100-300€, arrondir à 10€
    if (absAmount < 300) {
      return (Math.round(absAmount / 10) * 10).toString();
    }

    // Pour les montants > 300€, arrondir à 25€
    return (Math.round(absAmount / 25) * 25).toString();
  }

  /**
   * Obtient le type de montant typique (pour enrichir les suggestions)
   */
  private static getAmountType(amount: number): string | undefined {
    const absAmount = Math.abs(amount);
    for (const range of this.AMOUNT_RANGES) {
      if (absAmount >= range.min && absAmount <= range.max) {
        return range.typical;
      }
    }
    return undefined;
  }

  /**
   * Normalise le nom d'une contrepartie pour le matching
   * Retire les prénoms/noms composés et garde l'essentiel
   */
  private static normalizeCounterparty(name: string): string {
    if (!name) return '';

    let normalized = this.normalizeText(name);

    // Retirer les mots très courts (initiales, etc.)
    const words = normalized.split(/\s+/).filter(w => w.length > 2);

    // Pour les noms de personnes (2-3 mots), garder le nom de famille (dernier mot généralement)
    // Pour les entreprises, garder tout
    if (words.length >= 2 && words.length <= 3) {
      // Heuristique: si tous les mots commencent par une majuscule dans l'original,
      // c'est probablement un nom de personne
      const originalWords = name.trim().split(/\s+/);
      const allCapitalized = originalWords.every(w => w[0] === w[0].toUpperCase());

      if (allCapitalized && !name.includes('SPRL') && !name.includes('SA') && !name.includes('ASBL')) {
        // Garder le nom de famille (dernier mot) pour les personnes
        return words[words.length - 1];
      }
    }

    // Pour les entreprises ou noms longs, garder les 2 premiers mots significatifs
    return words.slice(0, 2).join(' ');
  }

  /**
   * Apprend d'une catégorisation manuelle et stocke dans Firestore
   * AMÉLIORÉ: Stocke 2 types de patterns:
   * 1. Pattern par keyword + montant (pour les transactions avec communication structurée)
   * 2. Pattern par contrepartie (pour les paiements récurrents de mêmes personnes/entreprises)
   */
  static async learnFromUserInput(
    clubId: string,
    transaction: TransactionBancaire,
    category: string,
    accountCode: string
  ): Promise<void> {
    if (!category || !accountCode) {
      logger.warn('[CategorizationService] Missing required fields for learning');
      return;
    }

    try {
      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');

      // === PATTERN 1: Keyword + Montant ===
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const allKeywords = this.extractAllKeywords(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);
      const amountType = this.getAmountType(transaction.montant);

      if (primaryKeyword !== 'inconnu') {
        const keywordPatternId = `kw_${primaryKeyword}_${roundedAmount}_${accountCode.replace(/[^a-z0-9]/gi, '_')}`;
        const keywordPatternRef = doc(patternsRef, keywordPatternId);

        const existingKeywordDoc = await getDocs(query(patternsRef, where('__name__', '==', keywordPatternId)));

        if (existingKeywordDoc.empty) {
          await setDoc(keywordPatternRef, {
            pattern_type: 'keyword',
            primary_keyword: primaryKeyword,
            all_keywords: allKeywords.map(k => k.keyword),
            montant_arrondi: parseFloat(roundedAmount),
            amount_type: amountType || null,
            categorie: category,
            code_comptable: accountCode,
            use_count: 1,
            last_used: serverTimestamp(),
            created_at: serverTimestamp()
          });
          logger.debug('[CategorizationService] ✨ Created keyword pattern:', keywordPatternId);
        } else {
          await updateDoc(keywordPatternRef, {
            use_count: increment(1),
            last_used: serverTimestamp(),
            all_keywords: allKeywords.map(k => k.keyword)
          });
        }
      }

      // === PATTERN 2: Contrepartie ===
      if (transaction.contrepartie_nom) {
        const normalizedCounterparty = this.normalizeCounterparty(transaction.contrepartie_nom);

        if (normalizedCounterparty.length >= 3) {
          const counterpartyPatternId = `cp_${normalizedCounterparty.replace(/[^a-z0-9]/gi, '_')}_${accountCode.replace(/[^a-z0-9]/gi, '_')}`;
          const counterpartyPatternRef = doc(patternsRef, counterpartyPatternId);

          const existingCpDoc = await getDocs(query(patternsRef, where('__name__', '==', counterpartyPatternId)));

          if (existingCpDoc.empty) {
            await setDoc(counterpartyPatternRef, {
              pattern_type: 'counterparty',
              contrepartie_normalized: normalizedCounterparty,
              contrepartie_original: transaction.contrepartie_nom,
              categorie: category,
              code_comptable: accountCode,
              use_count: 1,
              last_used: serverTimestamp(),
              created_at: serverTimestamp()
            });
            logger.debug('[CategorizationService] ✨ Created counterparty pattern:', counterpartyPatternId);
          } else {
            await updateDoc(counterpartyPatternRef, {
              use_count: increment(1),
              last_used: serverTimestamp()
            });
          }
        }
      }
    } catch (error) {
      logger.error('[CategorizationService] Error learning from user input:', error);
    }
  }

  /**
   * Learn from a correction - creates an anti-pattern to avoid repeating the same mistake
   * Called when a user changes a code_comptable from previousCode to newCode
   */
  static async learnFromCorrection(
    clubId: string,
    transaction: TransactionBancaire,
    previousCode: string,
    newCode: string,
    newCategory: string
  ): Promise<void> {
    if (!previousCode || !newCode || previousCode === newCode) {
      return; // Not a correction
    }

    try {
      const antiPatternsRef = collection(db, 'clubs', clubId, 'anti_patterns');

      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const normalizedCounterparty = this.normalizeCounterparty(transaction.contrepartie_nom || '');

      // Create anti-pattern ID based on context + wrong_code
      // This allows tracking different contexts that led to the same wrong code
      const contextKey = normalizedCounterparty || primaryKeyword || 'unknown';
      const antiPatternId = `ap_${contextKey.replace(/[^a-z0-9]/gi, '_')}_${previousCode.replace(/[^a-z0-9]/gi, '_')}`;
      const antiPatternRef = doc(antiPatternsRef, antiPatternId);

      // Check if anti-pattern already exists
      const existingDoc = await getDocs(query(antiPatternsRef, where('__name__', '==', antiPatternId)));

      if (existingDoc.empty) {
        // Create new anti-pattern
        await setDoc(antiPatternRef, {
          wrong_code: previousCode,
          correct_code: newCode,
          correct_category: newCategory,
          contrepartie_normalized: normalizedCounterparty || null,
          keyword: primaryKeyword !== 'inconnu' ? primaryKeyword : null,
          iban: transaction.contrepartie_iban || null,
          correction_count: 1,
          last_corrected: serverTimestamp(),
          created_at: serverTimestamp()
        });
        logger.debug(`[CategorizationService] ⚠️ Created anti-pattern: ${previousCode} → ${newCode} for "${contextKey}"`);
      } else {
        // Update existing anti-pattern
        await updateDoc(antiPatternRef, {
          correction_count: increment(1),
          last_corrected: serverTimestamp(),
          // Update to latest correct code if different
          correct_code: newCode,
          correct_category: newCategory
        });
        logger.debug(`[CategorizationService] ⚠️ Updated anti-pattern: ${previousCode} → ${newCode} (count+1)`);
      }

      // Also learn the correct pattern
      await this.learnFromUserInput(clubId, transaction, newCategory, newCode);
    } catch (error) {
      logger.error('[CategorizationService] Error creating anti-pattern:', error);
    }
  }

  /**
   * Check if a suggestion has been corrected before
   * Returns penalty points to subtract from score
   */
  static async checkAntiPatterns(
    clubId: string,
    accountCode: string,
    contrepartieNormalized?: string,
    keyword?: string,
    iban?: string
  ): Promise<{ penalty: number; correctCode?: string; reason?: string }> {
    try {
      const antiPatternsRef = collection(db, 'clubs', clubId, 'anti_patterns');

      // Query for anti-patterns matching this wrong_code
      const q = query(
        antiPatternsRef,
        where('wrong_code', '==', accountCode),
        limit(10)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return { penalty: 0 };
      }

      // Check for matching context
      let maxPenalty = 0;
      let bestMatch: { correctCode?: string; reason?: string } = {};

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();

        // Calculate match score based on context similarity
        let contextMatch = false;

        // IBAN match is strongest
        if (iban && data.iban === iban) {
          contextMatch = true;
          maxPenalty = Math.max(maxPenalty, 35); // High penalty for IBAN match
          bestMatch = {
            correctCode: data.correct_code,
            reason: `⚠️ Code corrigé avant (IBAN connu)`
          };
        }
        // Counterparty match
        else if (contrepartieNormalized && data.contrepartie_normalized === contrepartieNormalized) {
          contextMatch = true;
          maxPenalty = Math.max(maxPenalty, 30); // High penalty for counterparty match
          bestMatch = {
            correctCode: data.correct_code,
            reason: `⚠️ Code corrigé avant (contrepartie)`
          };
        }
        // Keyword match
        else if (keyword && data.keyword === keyword) {
          contextMatch = true;
          maxPenalty = Math.max(maxPenalty, 20); // Medium penalty for keyword match
          bestMatch = {
            correctCode: data.correct_code,
            reason: `⚠️ Code corrigé avant (mot-clé "${keyword}")`
          };
        }

        // Apply correction_count bonus (more corrections = higher penalty)
        if (contextMatch && data.correction_count > 1) {
          maxPenalty = Math.min(maxPenalty + Math.min(data.correction_count * 2, 10), 45);
        }
      }

      return { penalty: maxPenalty, ...bestMatch };
    } catch (error) {
      logger.error('[CategorizationService] Error checking anti-patterns:', error);
      return { penalty: 0 };
    }
  }

  /**
   * Obtient les catégories suggérées basées sur l'historique Firestore
   * AMÉLIORÉ: Scoring combiné de plusieurs signaux:
   * - Keyword match (40 pts) + montant match bonus (20 pts)
   * - Contrepartie match (30 pts)
   * - Use count bonus (jusqu'à 10 pts)
   */
  static async getSuggestionsFromHistory(
    clubId: string,
    transaction: TransactionBancaire
  ): Promise<{ category: string; accountCode: string; count: number; score: number; categoryLabel?: string; codeLabel?: string; matchReason?: string }[]> {
    if (!transaction.communication && !transaction.montant && !transaction.contrepartie_nom) return [];

    try {
      // === SIGNAL -1 (HIGHEST PRIORITY): Known IBANs ===
      if (transaction.contrepartie_iban && transaction.contrepartie_iban.length >= 10) {
        const knownIban = await FirebaseSettingsService.findKnownIban(clubId, transaction.contrepartie_iban);

        if (knownIban && knownIban.autoCategorize) {
          logger.debug(`[CategorizationService] ✅ Known IBAN match: ${knownIban.name} → ${knownIban.accountCode}`);

          const accountCode = this.getAccountCodeByCode(knownIban.accountCode);
          const category = DEFAULT_CATEGORIES.find(c => c.id === knownIban.category);

          if (knownIban.id) {
            FirebaseSettingsService.incrementIbanTransactionCount(clubId, knownIban.id).catch(() => {});
          }

          return [{
            category: knownIban.category,
            accountCode: knownIban.accountCode,
            count: knownIban.transactionCount + 1,
            score: 100,
            categoryLabel: category?.nom || knownIban.category,
            codeLabel: accountCode?.label || knownIban.accountCode,
            matchReason: `🏦 IBAN connu: ${knownIban.name}${knownIban.notes ? ` (${knownIban.notes})` : ''}`
          }];
        }
      }

      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
      const scoredSuggestions = new Map<string, { accountCode: string; category: string; score: number; useCount: number; matchReasons: string[] }>();

      // === Extraire les caractéristiques de la transaction ===
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const allKeywords = this.extractAllKeywords(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);
      const normalizedCounterparty = this.normalizeCounterparty(transaction.contrepartie_nom || '');

      logger.debug(`[CategorizationService] 🔍 Analyzing: keyword="${primaryKeyword}", amount=${roundedAmount}€, counterparty="${normalizedCounterparty}"`);

      // === SIGNAL 1: Keyword patterns (nouveaux avec préfixe kw_) ===
      if (primaryKeyword !== 'inconnu') {
        // Match exact keyword + montant (score: 60)
        const exactKwQuery = query(
          patternsRef,
          where('pattern_type', '==', 'keyword'),
          where('primary_keyword', '==', primaryKeyword),
          where('montant_arrondi', '==', parseFloat(roundedAmount)),
          limit(5)
        );

        const exactKwSnapshot = await getDocs(exactKwQuery);
        for (const doc of exactKwSnapshot.docs) {
          const data = doc.data();
          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min(data.use_count || 1, 10);

          if (existing) {
            existing.score += 60 + useCountBonus;
            existing.useCount += data.use_count || 1;
            existing.matchReasons.push(`🎯 "${primaryKeyword}" + ${roundedAmount}€`);
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 60 + useCountBonus,
              useCount: data.use_count || 1,
              matchReasons: [`🎯 "${primaryKeyword}" + ${roundedAmount}€`]
            });
          }
        }

        // Match keyword seul (score: 40)
        const kwOnlyQuery = query(
          patternsRef,
          where('pattern_type', '==', 'keyword'),
          where('primary_keyword', '==', primaryKeyword),
          limit(10)
        );

        const kwOnlySnapshot = await getDocs(kwOnlyQuery);
        for (const doc of kwOnlySnapshot.docs) {
          const data = doc.data();
          // Skip si déjà matché avec montant exact
          if (data.montant_arrondi === parseFloat(roundedAmount)) continue;

          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min((data.use_count || 1) / 2, 5);

          if (existing) {
            existing.score += 40 + useCountBonus;
            existing.useCount += data.use_count || 1;
            if (!existing.matchReasons.some(r => r.includes(primaryKeyword))) {
              existing.matchReasons.push(`🔑 "${primaryKeyword}"`);
            }
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 40 + useCountBonus,
              useCount: data.use_count || 1,
              matchReasons: [`🔑 "${primaryKeyword}"`]
            });
          }
        }
      }

      // === SIGNAL 2: Counterparty patterns (nouveaux avec préfixe cp_) ===
      if (normalizedCounterparty.length >= 3) {
        const cpQuery = query(
          patternsRef,
          where('pattern_type', '==', 'counterparty'),
          where('contrepartie_normalized', '==', normalizedCounterparty),
          limit(5)
        );

        const cpSnapshot = await getDocs(cpQuery);
        for (const doc of cpSnapshot.docs) {
          const data = doc.data();
          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min(data.use_count || 1, 10);

          if (existing) {
            existing.score += 30 + useCountBonus;
            existing.useCount += data.use_count || 1;
            existing.matchReasons.push(`👤 "${transaction.contrepartie_nom}"`);
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 30 + useCountBonus,
              useCount: data.use_count || 1,
              matchReasons: [`👤 "${transaction.contrepartie_nom}"`]
            });
          }
        }
      }

      // === SIGNAL 3: Legacy patterns (anciens sans préfixe, pour rétrocompatibilité) ===
      if (primaryKeyword !== 'inconnu') {
        const legacyQuery = query(
          patternsRef,
          where('primary_keyword', '==', primaryKeyword),
          orderBy('use_count', 'desc'),
          limit(5)
        );

        try {
          const legacySnapshot = await getDocs(legacyQuery);
          for (const doc of legacySnapshot.docs) {
            const data = doc.data();
            // Ignorer les nouveaux patterns (déjà traités)
            if (data.pattern_type) continue;

            const key = data.code_comptable;
            const existing = scoredSuggestions.get(key);
            const amountMatch = data.montant_arrondi === parseFloat(roundedAmount);
            const baseScore = amountMatch ? 50 : 35;
            const useCountBonus = Math.min((data.use_count || 1) / 2, 5);

            if (existing) {
              existing.score += baseScore + useCountBonus;
              existing.useCount += data.use_count || 1;
            } else {
              scoredSuggestions.set(key, {
                accountCode: data.code_comptable,
                category: data.categorie,
                score: baseScore + useCountBonus,
                useCount: data.use_count || 1,
                matchReasons: [amountMatch ? `📋 "${primaryKeyword}" + ${roundedAmount}€` : `📋 "${primaryKeyword}"`]
              });
            }
          }
        } catch {
          // Index might not exist for legacy queries, ignore
        }
      }

      // === Appliquer le boost saisonnier ===
      const transactionDate = transaction.date_comptable
        ? (transaction.date_comptable instanceof Date ? transaction.date_comptable : new Date(transaction.date_comptable))
        : undefined;

      for (const [_key, suggestion] of scoredSuggestions.entries()) {
        const { boost, reason } = this.calculateSeasonalBoost(
          suggestion.category,
          transactionDate,
          transaction.communication
        );

        if (boost > 0) {
          suggestion.score += boost;
          if (reason) {
            suggestion.matchReasons.push(reason);
          }
        }
      }

      // === Appliquer les pénalités anti-patterns ===
      // Note: primaryKeyword and normalizedCounterparty are already declared above
      for (const [_key, suggestion] of scoredSuggestions.entries()) {
        const { penalty, reason: penaltyReason } = await this.checkAntiPatterns(
          clubId,
          suggestion.accountCode,
          normalizedCounterparty,
          primaryKeyword !== 'inconnu' ? primaryKeyword : undefined,
          transaction.contrepartie_iban
        );

        if (penalty > 0) {
          suggestion.score -= penalty;
          if (penaltyReason) {
            suggestion.matchReasons.push(penaltyReason);
          }
        }
      }

      // === Trier et formater les résultats ===
      const sortedSuggestions = Array.from(scoredSuggestions.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5); // Top 5

      if (sortedSuggestions.length > 0) {
        logger.debug(`[CategorizationService] ✅ Found ${sortedSuggestions.length} suggestions (top score: ${sortedSuggestions[0].score})`);
      } else {
        logger.debug(`[CategorizationService] ❌ No suggestions found`);
      }

      // Enrichir avec les labels
      return sortedSuggestions.map(s => {
        const categoryObj = this.getAllCategories().find(c => c.id === s.category);
        const codeObj = this.getAllAccountCodes().find(ac => ac.code === s.accountCode);

        return {
          category: s.category,
          accountCode: s.accountCode,
          count: s.useCount,
          score: s.score,
          categoryLabel: categoryObj?.nom,
          codeLabel: codeObj?.label,
          matchReason: s.matchReasons.join(' + ')
        };
      });
    } catch (error) {
      logger.error('[CategorizationService] Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * Sanitize a string to be used as a Firestore document ID
   * Firestore document IDs cannot contain: / (forward slash)
   * Also removes other problematic characters and limits length
   */
  private static sanitizeDocumentId(str: string): string {
    return str
      .replace(/[^a-z0-9_-]/gi, '_')  // Replace any non-alphanumeric (except _ and -) with _
      .replace(/_+/g, '_')             // Collapse multiple underscores
      .replace(/^_|_$/g, '')           // Remove leading/trailing underscores
      .substring(0, 100);              // Limit length for safety
  }

  /**
   * Importer les patterns depuis les transactions existantes
   * VERSION OPTIMISÉE: Utilise batching, ajoute patterns IBAN, et réduit les requêtes
   */
  static async importPatternsFromTransactions(
    clubId: string,
    transactions: TransactionBancaire[]
  ): Promise<{ imported: number; skipped: number; errors: number; details: { keyword: number; counterparty: number; iban: number } }> {
    const stats = {
      imported: 0,
      skipped: 0,
      errors: 0,
      details: { keyword: 0, counterparty: 0, iban: 0 }
    };

    logger.debug(`[CategorizationService] 🔄 Importing patterns from ${transactions.length} transactions...`);

    // Filtrer les transactions valides
    const validTransactions = transactions.filter(t =>
      t.code_comptable && !t.is_parent
    );

    logger.debug(`[CategorizationService] 📊 ${validTransactions.length} transactions valides (avec code comptable)`);

    if (validTransactions.length === 0) {
      return stats;
    }

    // Charger les patterns existants pour éviter les requêtes de vérification
    const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
    const existingPatternsSnapshot = await getDocs(patternsRef);
    const existingPatternIds = new Set<string>();
    const existingPatternCounts = new Map<string, number>();

    existingPatternsSnapshot.forEach(doc => {
      existingPatternIds.add(doc.id);
      existingPatternCounts.set(doc.id, doc.data().use_count || 1);
    });

    logger.debug(`[CategorizationService] 📋 ${existingPatternIds.size} patterns existants chargés`);

    // Préparer les patterns à créer/mettre à jour
    const patternsToCreate = new Map<string, object>();
    const patternsToUpdate = new Map<string, number>(); // patternId -> new use_count

    for (const transaction of validTransactions) {
      const codeComptable = transaction.code_comptable!;
      const categorie = transaction.categorie || 'autre';
      const sanitizedCode = this.sanitizeDocumentId(codeComptable);

      // === PATTERN 1: IBAN (le plus fiable) ===
      if (transaction.contrepartie_iban && transaction.contrepartie_iban.length >= 10) {
        const sanitizedIban = this.sanitizeDocumentId(transaction.contrepartie_iban);
        const ibanPatternId = `iban_${sanitizedIban}_${sanitizedCode}`;

        if (existingPatternIds.has(ibanPatternId)) {
          // Incrémenter le compteur
          const currentCount = patternsToUpdate.get(ibanPatternId) || existingPatternCounts.get(ibanPatternId) || 1;
          patternsToUpdate.set(ibanPatternId, currentCount + 1);
        } else if (!patternsToCreate.has(ibanPatternId)) {
          patternsToCreate.set(ibanPatternId, {
            pattern_type: 'iban',
            iban: transaction.contrepartie_iban,
            contrepartie_nom: transaction.contrepartie_nom || '',
            categorie: categorie,
            code_comptable: codeComptable,
            use_count: 1,
            last_used: serverTimestamp(),
            created_at: serverTimestamp(),
            imported_from: 'historical_transactions'
          });
          stats.details.iban++;
        } else {
          // Pattern déjà dans la liste à créer, incrémenter le use_count
          const existing = patternsToCreate.get(ibanPatternId) as { use_count: number };
          existing.use_count++;
        }
      }

      // === PATTERN 2: Keyword + Montant ===
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const allKeywords = this.extractAllKeywords(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);

      if (primaryKeyword !== 'inconnu') {
        const sanitizedKeyword = this.sanitizeDocumentId(primaryKeyword);
        const sanitizedAmount = this.sanitizeDocumentId(roundedAmount);
        const keywordPatternId = `kw_${sanitizedKeyword}_${sanitizedAmount}_${sanitizedCode}`;

        if (existingPatternIds.has(keywordPatternId)) {
          const currentCount = patternsToUpdate.get(keywordPatternId) || existingPatternCounts.get(keywordPatternId) || 1;
          patternsToUpdate.set(keywordPatternId, currentCount + 1);
        } else if (!patternsToCreate.has(keywordPatternId)) {
          patternsToCreate.set(keywordPatternId, {
            pattern_type: 'keyword',
            primary_keyword: primaryKeyword,
            all_keywords: allKeywords.map(k => k.keyword),
            montant_arrondi: parseFloat(roundedAmount),
            categorie: categorie,
            code_comptable: codeComptable,
            use_count: 1,
            last_used: serverTimestamp(),
            created_at: serverTimestamp(),
            imported_from: 'historical_transactions'
          });
          stats.details.keyword++;
        } else {
          const existing = patternsToCreate.get(keywordPatternId) as { use_count: number };
          existing.use_count++;
        }
      }

      // === PATTERN 3: Contrepartie ===
      if (transaction.contrepartie_nom) {
        const normalizedCounterparty = this.normalizeCounterparty(transaction.contrepartie_nom);

        if (normalizedCounterparty.length >= 3) {
          const sanitizedCounterparty = this.sanitizeDocumentId(normalizedCounterparty);
          const counterpartyPatternId = `cp_${sanitizedCounterparty}_${sanitizedCode}`;

          if (existingPatternIds.has(counterpartyPatternId)) {
            const currentCount = patternsToUpdate.get(counterpartyPatternId) || existingPatternCounts.get(counterpartyPatternId) || 1;
            patternsToUpdate.set(counterpartyPatternId, currentCount + 1);
          } else if (!patternsToCreate.has(counterpartyPatternId)) {
            patternsToCreate.set(counterpartyPatternId, {
              pattern_type: 'counterparty',
              contrepartie_normalized: normalizedCounterparty,
              contrepartie_original: transaction.contrepartie_nom,
              categorie: categorie,
              code_comptable: codeComptable,
              use_count: 1,
              last_used: serverTimestamp(),
              created_at: serverTimestamp(),
              imported_from: 'historical_transactions'
            });
            stats.details.counterparty++;
          } else {
            const existing = patternsToCreate.get(counterpartyPatternId) as { use_count: number };
            existing.use_count++;
          }
        }
      }
    }

    logger.debug(`[CategorizationService] 📝 Patterns à créer: ${patternsToCreate.size}, à mettre à jour: ${patternsToUpdate.size}`);

    // Écrire en batches (max 500 opérations par batch)
    const BATCH_SIZE = 450; // Marge de sécurité
    let batchCount = 0;
    let currentBatch = writeBatch(db);
    let operationsInBatch = 0;

    // Créer les nouveaux patterns
    for (const [patternId, patternData] of patternsToCreate) {
      const patternRef = doc(patternsRef, patternId);
      currentBatch.set(patternRef, patternData);
      operationsInBatch++;
      stats.imported++;

      if (operationsInBatch >= BATCH_SIZE) {
        await currentBatch.commit();
        batchCount++;
        logger.debug(`[CategorizationService] ✅ Batch ${batchCount} committed (${operationsInBatch} ops)`);
        currentBatch = writeBatch(db);
        operationsInBatch = 0;
      }
    }

    // Mettre à jour les patterns existants
    for (const [patternId, newCount] of patternsToUpdate) {
      const patternRef = doc(patternsRef, patternId);
      currentBatch.update(patternRef, {
        use_count: newCount,
        last_used: serverTimestamp()
      });
      operationsInBatch++;

      if (operationsInBatch >= BATCH_SIZE) {
        await currentBatch.commit();
        batchCount++;
        logger.debug(`[CategorizationService] ✅ Batch ${batchCount} committed (${operationsInBatch} ops)`);
        currentBatch = writeBatch(db);
        operationsInBatch = 0;
      }
    }

    // Commit le dernier batch
    if (operationsInBatch > 0) {
      await currentBatch.commit();
      batchCount++;
      logger.debug(`[CategorizationService] ✅ Final batch ${batchCount} committed (${operationsInBatch} ops)`);
    }

    stats.skipped = transactions.length - validTransactions.length;

    logger.debug('[CategorizationService] ✅ Import complete:', {
      ...stats,
      totalPatterns: patternsToCreate.size,
      updatedPatterns: patternsToUpdate.size,
      batches: batchCount
    });

    return stats;
  }

  /**
   * Obtient les catégories suggérées basées sur les transactions existantes (fallback)
   * Utilisé si Firestore patterns n'existent pas encore
   */
  static getSuggestionsFromTransactions(
    counterpartyName: string,
    transactions: TransactionBancaire[]
  ): { category: string; accountCode: string; count: number }[] {
    const suggestions = new Map<string, { category: string; accountCode: string; count: number }>();

    // Chercher des transactions similaires
    for (const tx of transactions) {
      if (tx.contrepartie_nom.toLowerCase().includes(counterpartyName.toLowerCase()) ||
          counterpartyName.toLowerCase().includes(tx.contrepartie_nom.toLowerCase())) {
        if (tx.categorie && tx.code_comptable) {
          const key = `${tx.categorie}-${tx.code_comptable}`;
          const existing = suggestions.get(key);
          if (existing) {
            existing.count++;
          } else {
            suggestions.set(key, {
              category: tx.categorie,
              accountCode: tx.code_comptable,
              count: 1
            });
          }
        }
      }
    }

    return Array.from(suggestions.values()).sort((a, b) => b.count - a.count);
  }

  // ============================================================
  // NOUVELLES FONCTIONS : Auto-catégorisation avec IBAN et AI
  // ============================================================

  /**
   * Calcule la distance de Levenshtein entre deux chaînes
   * (nombre minimal d'opérations pour transformer l'une en l'autre)
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Créer une matrice de distances
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    // Initialiser la première colonne et première ligne
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    // Remplir la matrice
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(
            dp[i - 1][j],     // suppression
            dp[i][j - 1],     // insertion
            dp[i - 1][j - 1]  // substitution
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Calcule la similarité entre deux textes (0-100%)
   * Utilise la distance de Levenshtein normalisée
   */
  static calculateTextSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;

    const normalized1 = this.normalizeText(text1);
    const normalized2 = this.normalizeText(text2);

    if (normalized1 === normalized2) return 100;
    if (normalized1.length === 0 || normalized2.length === 0) return 0;

    const distance = this.levenshteinDistance(normalized1, normalized2);
    const maxLength = Math.max(normalized1.length, normalized2.length);

    // Similarité = 100% - (distance / longueur max) * 100
    return Math.round((1 - distance / maxLength) * 100);
  }

  /**
   * Recherche l'historique des transactions par IBAN
   * Retourne les codes comptables utilisés avec le nombre d'occurrences et exemples de communications
   */
  static async getHistoryByIban(
    clubId: string,
    iban: string
  ): Promise<{ code_comptable: string; count: number; communications: string[]; categorie?: string }[]> {
    if (!iban || iban.length < 10) return [];

    try {
      const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

      // Query transactions avec cet IBAN qui ont un code comptable
      const ibanQuery = query(
        transactionsRef,
        where('contrepartie_iban', '==', iban),
        limit(100) // Limiter pour performance
      );

      const snapshot = await getDocs(ibanQuery);

      // Grouper par code comptable
      const codeMap = new Map<string, { count: number; communications: string[]; categorie?: string }>();

      for (const doc of snapshot.docs) {
        const data = doc.data();
        const codeComptable = data.code_comptable;

        // Ignorer les transactions sans code comptable ou les parents ventilés
        if (!codeComptable || data.is_parent) continue;

        const existing = codeMap.get(codeComptable);
        if (existing) {
          existing.count++;
          // Garder max 3 exemples de communications
          if (existing.communications.length < 3 && data.communication) {
            existing.communications.push(data.communication);
          }
        } else {
          codeMap.set(codeComptable, {
            count: 1,
            communications: data.communication ? [data.communication] : [],
            categorie: data.categorie
          });
        }
      }

      // Convertir en array et trier par count décroissant
      const results = Array.from(codeMap.entries())
        .map(([code_comptable, data]) => ({
          code_comptable,
          ...data
        }))
        .sort((a, b) => b.count - a.count);

      if (results.length > 0) {
        logger.debug(`[CategorizationService] 📧 IBAN ${iban.substring(0, 8)}... : ${results.length} codes comptables trouvés`);
      }

      return results;
    } catch (error) {
      logger.error('[CategorizationService] Error getting history by IBAN:', error);
      return [];
    }
  }

  /**
   * Auto-catégorise une seule transaction
   * Retourne le code comptable suggéré avec le score de confiance
   *
   * AMÉLIORÉ: Combine plusieurs sources de matching dans l'ordre:
   * 1. Patterns Firestore (IBAN, keyword, contrepartie)
   * 2. Règles statiques (mots-clés hardcodés)
   * 3. Analyse de contrepartie connue
   * 4. Analyse de montant typique
   */
  static async autoCategorizeTransaction(
    clubId: string,
    transaction: TransactionBancaire
  ): Promise<{
    accountCode: string | null;
    category: string | null;
    confidence: number;
    reason: string;
    source: 'rules' | 'ai' | null;
  }> {
    // Étape 1: Essayer les patterns Firestore (IBAN, keyword, contrepartie)
    const suggestions = await this.getSuggestionsFromHistoryWithIban(clubId, transaction);

    if (suggestions.length > 0 && suggestions[0].score >= 50) {
      return {
        accountCode: suggestions[0].accountCode,
        category: suggestions[0].category,
        confidence: Math.min(suggestions[0].score, 100),
        reason: suggestions[0].matchReason || 'Pattern Firestore',
        source: 'rules'
      };
    }

    // Étape 2: Essayer les règles statiques hardcodées
    const staticMatch = this.categorizeTransaction(transaction);
    if (staticMatch.confidence >= 50 && staticMatch.accountCode) {
      return {
        accountCode: staticMatch.accountCode,
        category: staticMatch.category || null,
        confidence: staticMatch.confidence,
        reason: staticMatch.reason || 'Règle statique',
        source: 'rules'
      };
    }

    // Étape 3: Si on a une suggestion Firestore faible, la retourner quand même
    if (suggestions.length > 0) {
      return {
        accountCode: suggestions[0].accountCode,
        category: suggestions[0].category,
        confidence: suggestions[0].score,
        reason: suggestions[0].matchReason || 'Suggestion faible',
        source: 'rules'
      };
    }

    // Étape 4: Fallback sur règle statique même faible
    if (staticMatch.confidence > 0 && staticMatch.accountCode) {
      return {
        accountCode: staticMatch.accountCode,
        category: staticMatch.category || null,
        confidence: staticMatch.confidence,
        reason: staticMatch.reason || 'Règle statique (faible)',
        source: 'rules'
      };
    }

    // Pas de suggestion trouvée
    return {
      accountCode: null,
      category: null,
      confidence: 0,
      reason: 'Aucune correspondance trouvée',
      source: null
    };
  }

  /**
   * Version enrichie de getSuggestionsFromHistory avec signal IBAN prioritaire
   *
   * AMÉLIORÉ:
   * - Matching multi-keywords (cherche tous les mots-clés, pas juste le principal)
   * - Matching par sous-chaîne pour les contreparties
   * - Matching par similarité de texte sur la communication
   * - Scores plus granulaires
   */
  static async getSuggestionsFromHistoryWithIban(
    clubId: string,
    transaction: TransactionBancaire
  ): Promise<{ category: string; accountCode: string; count: number; score: number; categoryLabel?: string; codeLabel?: string; matchReason?: string }[]> {
    if (!transaction.communication && !transaction.montant && !transaction.contrepartie_nom && !transaction.contrepartie_iban) {
      return [];
    }

    try {
      // === SIGNAL -1 (HIGHEST PRIORITY): Known IBANs ===
      // Check if this IBAN is in our known_ibans collection for instant categorization
      if (transaction.contrepartie_iban && transaction.contrepartie_iban.length >= 10) {
        const knownIban = await FirebaseSettingsService.findKnownIban(clubId, transaction.contrepartie_iban);

        if (knownIban && knownIban.autoCategorize) {
          logger.debug(`[CategorizationService] ✅ Known IBAN match: ${knownIban.name} → ${knownIban.accountCode}`);

          // Get category and code labels
          const accountCode = this.getAccountCodeByCode(knownIban.accountCode);
          const category = DEFAULT_CATEGORIES.find(c => c.id === knownIban.category);

          // Increment transaction count (async, don't wait)
          if (knownIban.id) {
            FirebaseSettingsService.incrementIbanTransactionCount(clubId, knownIban.id).catch(() => {});
          }

          // Return immediately with 100% confidence
          return [{
            category: knownIban.category,
            accountCode: knownIban.accountCode,
            count: knownIban.transactionCount + 1,
            score: 100,
            categoryLabel: category?.nom || knownIban.category,
            codeLabel: accountCode?.label || knownIban.accountCode,
            matchReason: `🏦 IBAN connu: ${knownIban.name}${knownIban.notes ? ` (${knownIban.notes})` : ''}`
          }];
        }
      }

      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
      const scoredSuggestions = new Map<string, { accountCode: string; category: string; score: number; useCount: number; matchReasons: string[] }>();

      // === Extraire les caractéristiques de la transaction ===
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const allKeywords = this.extractAllKeywords(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);
      const normalizedCounterparty = this.normalizeCounterparty(transaction.contrepartie_nom || '');
      const normalizedCommunication = this.normalizeText(transaction.communication || '');

      logger.debug(`[CategorizationService] 🔍 Analyzing: keywords=[${allKeywords.map(k => k.keyword).join(', ')}], amount=${roundedAmount}€, counterparty="${normalizedCounterparty}", iban="${transaction.contrepartie_iban?.substring(0, 8) || 'N/A'}..."`);

      // === SIGNAL 0 (PRIORITAIRE): Patterns IBAN ===
      if (transaction.contrepartie_iban && transaction.contrepartie_iban.length >= 10) {
        // D'abord chercher dans les patterns IBAN (plus rapide)
        const ibanPatternQuery = query(
          patternsRef,
          where('pattern_type', '==', 'iban'),
          where('iban', '==', transaction.contrepartie_iban),
          limit(10)
        );

        const ibanPatternSnapshot = await getDocs(ibanPatternQuery);
        for (const docSnap of ibanPatternSnapshot.docs) {
          const data = docSnap.data();
          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);

          // Score de base: 60 pts pour match IBAN pattern (augmenté)
          const ibanScore = 60;
          const useCountBonus = Math.min(data.use_count || 1, 15);
          const totalScore = ibanScore + useCountBonus;

          if (existing) {
            existing.score += totalScore;
            existing.useCount += data.use_count || 1;
            existing.matchReasons.push(`📧 IBAN pattern (${data.use_count || 1}x)`);
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie || 'autre',
              score: totalScore,
              useCount: data.use_count || 1,
              matchReasons: [`📧 IBAN pattern (${data.use_count || 1}x)`]
            });
          }
        }

        // Si pas de pattern IBAN, fallback sur l'historique des transactions
        if (ibanPatternSnapshot.empty) {
          const ibanHistory = await this.getHistoryByIban(clubId, transaction.contrepartie_iban);

          for (const hist of ibanHistory) {
            const key = hist.code_comptable;
            const existing = scoredSuggestions.get(key);

            // Score de base: 60 pts pour match IBAN (augmenté)
            const ibanScore = 60;

            // Bonus: +25 pts si communication similaire (>80%)
            let communicationBonus = 0;
            if (transaction.communication && hist.communications.length > 0) {
              for (const prevComm of hist.communications) {
                const similarity = this.calculateTextSimilarity(transaction.communication, prevComm);
                if (similarity >= 80) {
                  communicationBonus = 25;
                  break;
                } else if (similarity >= 60) {
                  communicationBonus = Math.max(communicationBonus, 15);
                } else if (similarity >= 40) {
                  communicationBonus = Math.max(communicationBonus, 8);
                }
              }
            }

            // Bonus: use_count (jusqu'à 15 pts)
            const useCountBonus = Math.min(hist.count, 15);

            const totalScore = ibanScore + communicationBonus + useCountBonus;

            if (existing) {
              existing.score += totalScore;
              existing.useCount += hist.count;
              existing.matchReasons.push(`📧 IBAN (${hist.count}x)${communicationBonus > 0 ? ' + comm similaire' : ''}`);
            } else {
              scoredSuggestions.set(key, {
                accountCode: hist.code_comptable,
                category: hist.categorie || 'autre',
                score: totalScore,
                useCount: hist.count,
                matchReasons: [`📧 IBAN (${hist.count}x)${communicationBonus > 0 ? ' + comm similaire' : ''}`]
              });
            }
          }
        }
      }

      // === SIGNAL 1: Keyword patterns (AMÉLIORÉ - multi-keywords) ===
      // Chercher avec TOUS les mots-clés trouvés, pas juste le principal
      const keywordsToSearch = allKeywords.length > 0
        ? allKeywords.slice(0, 3).map(k => k.keyword) // Top 3 keywords
        : (primaryKeyword !== 'inconnu' ? [primaryKeyword] : []);

      for (const keyword of keywordsToSearch) {
        // Match exact keyword + montant (score: 55)
        const exactKwQuery = query(
          patternsRef,
          where('pattern_type', '==', 'keyword'),
          where('primary_keyword', '==', keyword),
          where('montant_arrondi', '==', parseFloat(roundedAmount)),
          limit(5)
        );

        const exactKwSnapshot = await getDocs(exactKwQuery);
        for (const docSnap of exactKwSnapshot.docs) {
          const data = docSnap.data();
          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min(data.use_count || 1, 10);
          // Bonus si c'est le keyword principal
          const primaryBonus = keyword === primaryKeyword ? 10 : 0;

          if (existing) {
            existing.score += 55 + useCountBonus + primaryBonus;
            existing.useCount += data.use_count || 1;
            if (!existing.matchReasons.some(r => r.includes(keyword))) {
              existing.matchReasons.push(`🎯 "${keyword}" + ${roundedAmount}€`);
            }
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 55 + useCountBonus + primaryBonus,
              useCount: data.use_count || 1,
              matchReasons: [`🎯 "${keyword}" + ${roundedAmount}€`]
            });
          }
        }

        // Match keyword seul (score: 35)
        const kwOnlyQuery = query(
          patternsRef,
          where('pattern_type', '==', 'keyword'),
          where('primary_keyword', '==', keyword),
          limit(10)
        );

        const kwOnlySnapshot = await getDocs(kwOnlyQuery);
        for (const docSnap of kwOnlySnapshot.docs) {
          const data = docSnap.data();
          if (data.montant_arrondi === parseFloat(roundedAmount)) continue;

          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min((data.use_count || 1) / 2, 5);
          const primaryBonus = keyword === primaryKeyword ? 5 : 0;

          if (existing) {
            existing.score += 35 + useCountBonus + primaryBonus;
            existing.useCount += data.use_count || 1;
            if (!existing.matchReasons.some(r => r.includes(keyword))) {
              existing.matchReasons.push(`🔑 "${keyword}"`);
            }
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 35 + useCountBonus + primaryBonus,
              useCount: data.use_count || 1,
              matchReasons: [`🔑 "${keyword}"`]
            });
          }
        }
      }

      // === SIGNAL 2: Counterparty patterns (AMÉLIORÉ - matching partiel) ===
      if (normalizedCounterparty.length >= 3) {
        // Match exact
        const cpQuery = query(
          patternsRef,
          where('pattern_type', '==', 'counterparty'),
          where('contrepartie_normalized', '==', normalizedCounterparty),
          limit(5)
        );

        const cpSnapshot = await getDocs(cpQuery);
        for (const docSnap of cpSnapshot.docs) {
          const data = docSnap.data();
          const key = data.code_comptable;
          const existing = scoredSuggestions.get(key);
          const useCountBonus = Math.min(data.use_count || 1, 10);

          if (existing) {
            existing.score += 40 + useCountBonus; // Augmenté de 30 à 40
            existing.useCount += data.use_count || 1;
            existing.matchReasons.push(`👤 "${transaction.contrepartie_nom}"`);
          } else {
            scoredSuggestions.set(key, {
              accountCode: data.code_comptable,
              category: data.categorie,
              score: 40 + useCountBonus,
              useCount: data.use_count || 1,
              matchReasons: [`👤 "${transaction.contrepartie_nom}"`]
            });
          }
        }

        // Si pas de match exact, chercher par sous-chaîne dans les patterns existants
        if (cpSnapshot.empty && normalizedCounterparty.length >= 4) {
          // Charger tous les patterns counterparty et filtrer côté client
          const allCpQuery = query(
            patternsRef,
            where('pattern_type', '==', 'counterparty'),
            orderBy('use_count', 'desc'),
            limit(50)
          );

          try {
            const allCpSnapshot = await getDocs(allCpQuery);
            for (const docSnap of allCpSnapshot.docs) {
              const data = docSnap.data();
              const patternNorm = data.contrepartie_normalized || '';

              // Vérifier si l'un contient l'autre
              if (patternNorm.includes(normalizedCounterparty) || normalizedCounterparty.includes(patternNorm)) {
                const key = data.code_comptable;
                const existing = scoredSuggestions.get(key);
                const useCountBonus = Math.min(data.use_count || 1, 8);

                if (existing) {
                  existing.score += 25 + useCountBonus; // Score plus bas pour match partiel
                  existing.useCount += data.use_count || 1;
                  if (!existing.matchReasons.some(r => r.includes('👤'))) {
                    existing.matchReasons.push(`👤 ~"${data.contrepartie_original || patternNorm}"`);
                  }
                } else {
                  scoredSuggestions.set(key, {
                    accountCode: data.code_comptable,
                    category: data.categorie,
                    score: 25 + useCountBonus,
                    useCount: data.use_count || 1,
                    matchReasons: [`👤 ~"${data.contrepartie_original || patternNorm}"`]
                  });
                }
              }
            }
          } catch {
            // Index might not exist, ignore
          }
        }
      }

      // === SIGNAL 3: Matching par similarité de communication (nouveau) ===
      if (normalizedCommunication.length >= 5 && scoredSuggestions.size < 3) {
        // Charger les patterns keyword récents et comparer les communications
        const recentKwQuery = query(
          patternsRef,
          where('pattern_type', '==', 'keyword'),
          orderBy('last_used', 'desc'),
          limit(30)
        );

        try {
          const recentKwSnapshot = await getDocs(recentKwQuery);
          for (const docSnap of recentKwSnapshot.docs) {
            const data = docSnap.data();
            const patternKeywords = data.all_keywords || [data.primary_keyword];

            // Calculer combien de keywords matchent
            let matchingKeywords = 0;
            for (const kw of patternKeywords) {
              if (normalizedCommunication.includes(kw)) {
                matchingKeywords++;
              }
            }

            if (matchingKeywords >= 1) {
              const key = data.code_comptable;
              const existing = scoredSuggestions.get(key);
              const matchScore = matchingKeywords * 12; // 12 pts par keyword matché
              const useCountBonus = Math.min((data.use_count || 1) / 2, 5);

              if (existing) {
                existing.score += matchScore + useCountBonus;
                existing.useCount += data.use_count || 1;
                if (!existing.matchReasons.some(r => r.includes('📝'))) {
                  existing.matchReasons.push(`📝 ${matchingKeywords} mot(s)-clé(s) en commun`);
                }
              } else {
                scoredSuggestions.set(key, {
                  accountCode: data.code_comptable,
                  category: data.categorie,
                  score: matchScore + useCountBonus,
                  useCount: data.use_count || 1,
                  matchReasons: [`📝 ${matchingKeywords} mot(s)-clé(s) en commun`]
                });
              }
            }
          }
        } catch {
          // Index might not exist, ignore
        }
      }

      // === Appliquer le boost saisonnier ===
      const transactionDate = transaction.date_comptable
        ? (transaction.date_comptable instanceof Date ? transaction.date_comptable : new Date(transaction.date_comptable))
        : undefined;

      for (const [_key, suggestion] of scoredSuggestions.entries()) {
        const { boost, reason } = this.calculateSeasonalBoost(
          suggestion.category,
          transactionDate,
          transaction.communication
        );

        if (boost > 0) {
          suggestion.score += boost;
          if (reason) {
            suggestion.matchReasons.push(reason);
          }
        }
      }

      // === Appliquer les pénalités anti-patterns ===
      for (const [_key, suggestion] of scoredSuggestions.entries()) {
        const { penalty, reason: penaltyReason } = await this.checkAntiPatterns(
          clubId,
          suggestion.accountCode,
          normalizedCounterparty,
          primaryKeyword !== 'inconnu' ? primaryKeyword : undefined,
          transaction.contrepartie_iban
        );

        if (penalty > 0) {
          suggestion.score -= penalty;
          if (penaltyReason) {
            suggestion.matchReasons.push(penaltyReason);
          }
        }
      }

      // === Trier et formater les résultats ===
      const sortedSuggestions = Array.from(scoredSuggestions.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (sortedSuggestions.length > 0) {
        logger.debug(`[CategorizationService] ✅ Found ${sortedSuggestions.length} suggestions (top score: ${sortedSuggestions[0].score}, reason: ${sortedSuggestions[0].matchReasons.join(', ')})`);
      } else {
        logger.debug(`[CategorizationService] ❌ No suggestions found for: ${transaction.contrepartie_nom} / ${transaction.communication?.substring(0, 30)}...`);
      }

      // Enrichir avec les labels
      return sortedSuggestions.map(s => {
        const categoryObj = this.getAllCategories().find(c => c.id === s.category);
        const codeObj = this.getAllAccountCodes().find(ac => ac.code === s.accountCode);

        return {
          category: s.category,
          accountCode: s.accountCode,
          count: s.useCount,
          score: s.score,
          categoryLabel: categoryObj?.nom,
          codeLabel: codeObj?.label,
          matchReason: s.matchReasons.join(' + ')
        };
      });
    } catch (error) {
      logger.error('[CategorizationService] Error getting suggestions with IBAN:', error);
      return [];
    }
  }

  /**
   * Auto-catégorise toutes les transactions non catégorisées avec règles + AI fallback
   */
  static async autoCategorizeAllWithAI(
    clubId: string,
    transactions: TransactionBancaire[],
    options: {
      onlyUncategorized?: boolean;
      useAiFallback?: boolean;
      rulesThreshold?: number;
      aiConfidenceThreshold?: number;
      dryRun?: boolean;
      batchId?: string; // Timestamp ISO pour identifier ce batch de traitement
      userId?: string; // Pour audit trail
      userName?: string; // Pour audit trail
    } = {}
  ): Promise<{
    total: number;
    byRules: number;
    byAi: number;
    needsReview: number;
    skipped: number;
    noMatch: number;
    batchId: string; // Retourne le batch_id utilisé
    details: Array<{
      transactionId: string;
      contrepartie: string;
      montant: number;
      code: string | null;
      source: 'rules' | 'ai' | null;
      confidence: number;
      needsReview: boolean;
      reason: string;
    }>;
  }> {
    const {
      onlyUncategorized = true,
      useAiFallback = true,
      rulesThreshold = 45, // Abaissé de 70 à 45 pour plus de matches
      aiConfidenceThreshold = 50, // Abaissé de 60 à 50
      dryRun = false,
      batchId = new Date().toISOString(), // Générer un batch_id si non fourni
      userId,
      userName
    } = options;

    const stats = {
      total: 0,
      byRules: 0,
      byAi: 0,
      needsReview: 0,
      skipped: 0,
      noMatch: 0,
      batchId,
      details: [] as Array<{
        transactionId: string;
        contrepartie: string;
        montant: number;
        code: string | null;
        source: 'rules' | 'ai' | null;
        confidence: number;
        needsReview: boolean;
        reason: string;
      }>
    };

    // Filtrer les transactions à traiter
    const toProcess = onlyUncategorized
      ? transactions.filter(t => !t.code_comptable && !t.is_parent)
      : transactions.filter(t => !t.is_parent);

    stats.total = toProcess.length;
    logger.debug(`[CategorizationService] 🚀 Auto-categorizing ${toProcess.length} transactions (dryRun: ${dryRun})`);

    // Collecter les transactions qui nécessitent l'AI
    const needsAi: TransactionBancaire[] = [];

    // Étape 1: Appliquer les règles classiques
    for (const transaction of toProcess) {
      const result = await this.autoCategorizeTransaction(clubId, transaction);

      if (result.accountCode && result.confidence >= rulesThreshold) {
        // Règles classiques suffisantes
        stats.byRules++;
        stats.details.push({
          transactionId: transaction.id,
          contrepartie: transaction.contrepartie_nom,
          montant: transaction.montant,
          code: result.accountCode,
          source: 'rules',
          confidence: result.confidence,
          needsReview: false,
          reason: result.reason
        });

        // Appliquer si pas en mode dry-run
        if (!dryRun) {
          await this.applyCategorizationToTransaction(clubId, transaction.id, {
            code_comptable: result.accountCode,
            categorie: result.category || undefined,
            categorization_source: 'rules',
            categorization_confidence: result.confidence,
            needs_review: false,
            categorization_batch_id: batchId
          }, userId, userName);
        }
      } else if (useAiFallback) {
        // Ajouter à la liste pour AI
        needsAi.push(transaction);
      } else if (result.accountCode) {
        // Pas de fallback AI, mais on a une suggestion faible
        stats.noMatch++;
        stats.details.push({
          transactionId: transaction.id,
          contrepartie: transaction.contrepartie_nom,
          montant: transaction.montant,
          code: result.accountCode,
          source: 'rules',
          confidence: result.confidence,
          needsReview: true,
          reason: `${result.reason} (confiance insuffisante: ${result.confidence}%)`
        });
      } else {
        stats.noMatch++;
        stats.details.push({
          transactionId: transaction.id,
          contrepartie: transaction.contrepartie_nom,
          montant: transaction.montant,
          code: null,
          source: null,
          confidence: 0,
          needsReview: false,
          reason: 'Aucune correspondance trouvée'
        });
      }
    }

    // Étape 2: Appeler l'AI pour les transactions restantes (si activé)
    if (useAiFallback && needsAi.length > 0) {
      logger.debug(`[CategorizationService] 🤖 ${needsAi.length} transactions need AI categorization`);

      try {
        const aiResults = await this.categorizeWithAI(clubId, needsAi);

        for (const aiResult of aiResults) {
          const transaction = needsAi.find(t => t.id === aiResult.transactionId);
          if (!transaction) continue;

          const needsReview = aiResult.confidence < aiConfidenceThreshold;

          if (aiResult.accountCode) {
            stats.byAi++;
            if (needsReview) stats.needsReview++;

            stats.details.push({
              transactionId: aiResult.transactionId,
              contrepartie: transaction.contrepartie_nom,
              montant: transaction.montant,
              code: aiResult.accountCode,
              source: 'ai',
              confidence: aiResult.confidence,
              needsReview,
              reason: aiResult.reason
            });

            if (!dryRun) {
              await this.applyCategorizationToTransaction(clubId, aiResult.transactionId, {
                code_comptable: aiResult.accountCode,
                categorization_source: 'ai',
                categorization_confidence: aiResult.confidence,
                needs_review: needsReview,
                categorization_batch_id: batchId
              }, userId, userName);
            }
          } else {
            stats.noMatch++;
            stats.details.push({
              transactionId: aiResult.transactionId,
              contrepartie: transaction.contrepartie_nom,
              montant: transaction.montant,
              code: null,
              source: 'ai',
              confidence: 0,
              needsReview: false,
              reason: aiResult.reason || 'AI n\'a pas pu catégoriser'
            });
          }
        }
      } catch (error) {
        logger.error('[CategorizationService] AI categorization failed:', error);
        // Marquer toutes les transactions AI comme échouées
        for (const transaction of needsAi) {
          stats.noMatch++;
          stats.details.push({
            transactionId: transaction.id,
            contrepartie: transaction.contrepartie_nom,
            montant: transaction.montant,
            code: null,
            source: null,
            confidence: 0,
            needsReview: false,
            reason: 'Erreur AI: ' + (error instanceof Error ? error.message : 'Erreur inconnue')
          });
        }
      }
    }

    logger.debug(`[CategorizationService] ✅ Auto-categorization complete:`, {
      total: stats.total,
      byRules: stats.byRules,
      byAi: stats.byAi,
      needsReview: stats.needsReview,
      noMatch: stats.noMatch
    });

    return stats;
  }

  /**
   * Appelle l'API AI pour catégoriser un lot de transactions
   */
  private static async categorizeWithAI(
    clubId: string,
    transactions: TransactionBancaire[]
  ): Promise<Array<{
    transactionId: string;
    accountCode: string | null;
    confidence: number;
    reason: string;
  }>> {
    // Préparer les données pour l'API
    const accountCodes = this.getAllAccountCodes();

    const transactionsData = transactions.map(t => ({
      id: t.id,
      contrepartie_nom: t.contrepartie_nom,
      contrepartie_iban: t.contrepartie_iban,
      communication: t.communication,
      montant: t.montant,
      date: t.date_execution instanceof Date ? t.date_execution.toISOString() : t.date_execution
    }));

    // Appeler l'API Vercel
    const response = await fetch('/api/categorize-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clubId,
        transactions: transactionsData,
        accountCodes: accountCodes.map(c => ({
          code: c.code,
          label: c.label,
          type: c.type
        }))
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.results || [];
  }

  /**
   * Applique une catégorisation à une transaction dans Firestore
   */
  private static async applyCategorizationToTransaction(
    clubId: string,
    transactionId: string,
    updates: {
      code_comptable?: string;
      categorie?: string;
      categorization_source?: 'manual' | 'rules' | 'ai' | 'learned';
      categorization_confidence?: number;
      needs_review?: boolean;
      categorization_batch_id?: string;
    },
    userId?: string,
    userName?: string
  ): Promise<void> {
    try {
      const transactionRef = doc(db, 'clubs', clubId, 'transactions_bancaires', transactionId);

      // Si un code comptable est assigné, créer une entrée d'audit trail
      if (updates.code_comptable) {
        // Récupérer la transaction actuelle pour le code précédent
        const transactionDoc = await import('firebase/firestore').then(m => m.getDoc(transactionRef));
        const currentTransaction = transactionDoc.exists() ? transactionDoc.data() as import('@/types').TransactionBancaire : null;

        // Créer l'entrée audit trail
        const auditEntry: import('@/types').CodeComptableAudit = {
          code_comptable: updates.code_comptable,
          categorie: updates.categorie || currentTransaction?.categorie,
          assigned_by: userId || 'system',
          assigned_by_name: userName || 'Système (Auto-catégorisation)',
          assigned_at: new Date(),
          previous_code: currentTransaction?.code_comptable,
          previous_categorie: currentTransaction?.categorie,
          source: updates.categorization_source === 'learned' ? 'learned' : 'auto'
        };

        // Nettoyer l'entry - verwijder undefined velden
        Object.keys(auditEntry).forEach(key => {
          if (auditEntry[key as keyof typeof auditEntry] === undefined) {
            delete auditEntry[key as keyof typeof auditEntry];
          }
        });

        // Ajouter à l'historique existant
        const updatedHistory = [
          ...(currentTransaction?.code_comptable_history || []),
          auditEntry
        ];

        await updateDoc(transactionRef, {
          ...updates,
          code_comptable_history: updatedHistory,
          updated_at: serverTimestamp()
        });
      } else {
        await updateDoc(transactionRef, {
          ...updates,
          updated_at: serverTimestamp()
        });
      }
    } catch (error) {
      logger.error(`[CategorizationService] Error updating transaction ${transactionId}:`, error);
      throw error;
    }
  }

  /**
   * Sauvegarde un pattern appris depuis une correction manuelle
   */
  static async learnPattern(
    clubId: string,
    pattern: {
      contrepartie_nom?: string;
      contrepartie_normalized?: string;
      keywords?: string[];
      code_comptable: string;
      categorie: string;
      confidence: number;
      created_by: string;
      source_transaction_id: string;
      comment?: string;
      original_wrong_code?: string;
    }
  ): Promise<string> {
    try {
      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');

      const patternData = {
        ...pattern,
        use_count: 0,
        created_at: serverTimestamp()
      };

      // Use doc() to create a new document reference with auto-generated ID
      const newDocRef = doc(patternsRef);
      await setDoc(newDocRef, patternData);

      logger.debug(`[CategorizationService] 📚 Pattern learned:`, {
        id: newDocRef.id,
        contrepartie: pattern.contrepartie_nom,
        keywords: pattern.keywords,
        code: pattern.code_comptable
      });

      return newDocRef.id;
    } catch (error) {
      logger.error('[CategorizationService] Error saving pattern:', error);
      throw error;
    }
  }

  /**
   * Récupère tous les patterns appris pour un club
   */
  static async getLearnedPatterns(clubId: string): Promise<Array<{
    id: string;
    contrepartie_nom?: string;
    contrepartie_normalized?: string;
    keywords?: string[];
    code_comptable: string;
    categorie: string;
    confidence: number;
    use_count: number;
    comment?: string;
  }>> {
    try {
      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
      const q = query(patternsRef, orderBy('use_count', 'desc'), limit(100));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any;
    } catch (error) {
      logger.error('[CategorizationService] Error loading patterns:', error);
      return [];
    }
  }

  /**
   * Incrémente le compteur d'utilisation d'un pattern
   */
  static async incrementPatternUsage(clubId: string, patternId: string): Promise<void> {
    try {
      const patternRef = doc(db, 'clubs', clubId, 'categorization_patterns', patternId);
      await updateDoc(patternRef, {
        use_count: increment(1),
        last_used: serverTimestamp()
      });
    } catch (error) {
      logger.error('[CategorizationService] Error incrementing pattern usage:', error);
    }
  }
}
