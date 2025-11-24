import { TransactionBancaire, AccountCode, Categorie } from '@/types';
import accountMappings from '@/config/account-mappings.json';
import { getCalypsoAccountCodes, getCalypsoAccountCodesByType } from '@/config/calypso-accounts';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, increment, serverTimestamp, orderBy, limit } from 'firebase/firestore';

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

const DEFAULT_CATEGORIES: Categorie[] = [
  // Prefixes for filtering account codes
  // isFrequent: true = affiché en haut de la liste avec séparateur
  // compte_comptable peut être:
  //   - Code complet: '618-00-732' → filtre exactement ce code
  //   - Préfixe: '618-00' → filtre tous les codes commençant par '618-00-'
  //   - Préfixe court: '613' → filtre tous les codes commençant par '613'

  // REVENUS (fréquents en premier)
  { id: 'cotisation', nom: 'Cotisations', type: 'revenu', couleur: '#10b981', compte_comptable: '730-00', isFrequent: true },
  { id: 'sorties_revenu', nom: 'Sorties plongées', type: 'revenu', couleur: '#06b6d4', compte_comptable: '618-00-732', isFrequent: true },
  { id: 'evenement', nom: 'Événements', type: 'revenu', couleur: '#3b82f6', compte_comptable: '664-00', isFrequent: false },
  { id: 'subside', nom: 'Subsides', type: 'revenu', couleur: '#14b8a6', compte_comptable: '15-000', isFrequent: false },

  // DÉPENSES (fréquents en premier)
  { id: 'piscine', nom: 'Piscine', type: 'depense', couleur: '#f59e0b', compte_comptable: '610-00', isFrequent: true },
  { id: 'materiel', nom: 'Matériel', type: 'depense', couleur: '#ef4444', compte_comptable: '612-00', isFrequent: true },
  { id: 'sorties_depense', nom: 'Sorties plongées', type: 'depense', couleur: '#0891b2', compte_comptable: '618-00', isFrequent: true },
  { id: 'reunions', nom: 'Réunions', type: 'depense', couleur: '#8b5cf6', compte_comptable: '613', isFrequent: false },
  { id: 'formation', nom: 'Formation', type: 'depense', couleur: '#a855f7', compte_comptable: '616-00', isFrequent: false },
  { id: 'administration', nom: 'Administration', type: 'depense', couleur: '#6366f1', compte_comptable: '614-00', isFrequent: false },
  { id: 'assurance', nom: 'Assurances', type: 'depense', couleur: '#ec4899', compte_comptable: '611-00', isFrequent: false },
  { id: 'frais_bancaires', nom: 'Frais bancaires', type: 'depense', couleur: '#64748b', compte_comptable: '657-00', isFrequent: false }
];

export class CategorizationService {
  private static rules: CategorizationRule[] = [
    // Cotisations et affiliations
    {
      keywords: ['cotisation membre', 'cotisation annuelle', 'adhesion'],
      category: 'cotisation',
      accountCode: '730-00-712',
      confidence: 95
    },
    {
      keywords: ['lifras cotisation', 'lifras club'],
      category: 'cotisation',
      accountCode: '730-00-610',
      confidence: 98
    },
    {
      keywords: ['lifras membre', 'licence lifras', 'febras'],
      category: 'cotisation',
      accountCode: '730-00-611',
      confidence: 95
    },
    
    // Piscine et matériel
    {
      keywords: ['piscine', 'location piscine', 'woluwe sport', 'poseidon'],
      category: 'piscine',
      accountCode: '610-00-621',
      confidence: 95
    },
    {
      keywords: ['compresseur', 'gonflage', 'air comprime'],
      category: 'materiel',
      accountCode: '612-00-623',
      confidence: 90
    },
    {
      keywords: ['materiel plongee', 'detendeur', 'palmes', 'masque', 'combinaison'],
      category: 'materiel',
      accountCode: '612-00-624',
      confidence: 85
    },
    
    // Événements
    {
      keywords: ['calyfiesta', 'soiree annuelle', 'fete du club'],
      category: 'evenement',
      accountCode: '',  // Dépend si c'est une entrée ou sortie
      confidence: 95
    },
    {
      keywords: ['sortie mer', 'ecole de mer', 'zeeland', 'zelande'],
      category: 'evenement',
      accountCode: '',  // Dépend si c'est une entrée ou sortie
      confidence: 90
    },
    {
      keywords: ['sortie plongee', 'week-end plongee', 'voyage plongee'],
      category: 'evenement',
      accountCode: '',  // Dépend si c'est une entrée ou sortie
      confidence: 85
    },
    
    // Formation
    {
      keywords: ['formation', 'brevet', 'cours', 'n1', 'n2', 'n3', 'p1', 'p2', 'p3', 'moniteur'],
      category: 'formation',
      accountCode: '616-00-645',
      confidence: 90
    },
    
    // Administration
    {
      keywords: ['ovh', 'site web', 'hebergement', 'domaine', 'hosting'],
      category: 'administration',
      accountCode: '614-00-643',
      confidence: 98
    },
    {
      keywords: ['banque', 'frais bancaire', 'commission', 'frais de compte'],
      category: 'frais_bancaires',
      accountCode: '657-00-660',
      confidence: 95
    },
    {
      keywords: ['assurance', 'ethias', 'rc', 'responsabilite civile'],
      category: 'assurance',
      accountCode: '611-00-616',
      confidence: 95
    },
    
    // Subsides
    {
      keywords: ['subside', 'subsidie', 'commune', 'communal', 'adeps', 'sport'],
      category: 'subside',
      accountCode: '15-000-770',
      confidence: 95
    }
  ];

  /**
   * Obtient tous les codes comptables disponibles
   */
  static getAllAccountCodes(): AccountCode[] {
    // Utiliser directement les codes Calypso depuis le nouveau fichier
    return getCalypsoAccountCodes();
  }

  /**
   * Filtre les codes comptables par type (revenu/dépense)
   */
  static getAccountCodesByType(isExpense: boolean): AccountCode[] {
    // Utiliser directement la fonction du fichier calypso-accounts
    return getCalypsoAccountCodesByType(isExpense);
  }

  /**
   * Filtre les codes comptables selon la catégorie sélectionnée
   * Gère 3 types de filtres (compte_comptable de la catégorie):
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
      if (code.category === categoryId) {
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
   * Trie les codes comptables: fréquents d'abord, puis par code
   */
  private static sortAccountCodes(codes: AccountCode[]): AccountCode[] {
    return codes.sort((a, b) => {
      // Les fréquents avant les non-fréquents
      if (a.isFrequent && !b.isFrequent) return -1;
      if (!a.isFrequent && b.isFrequent) return 1;

      // Sinon, tri par code
      return a.code.localeCompare(b.code);
    });
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
        console.error('Erreur lors du chargement du cache des catégories:', e);
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
        console.error('Erreur lors du chargement des catégories:', e);
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
   * Extrait le mot-clé principal de la communication
   * Priorise les mots importants comme "Inscription", "Cotisation", "Sortie", etc.
   */
  private static extractPrimaryKeyword(communication: string): string {
    if (!communication) return 'inconnu';

    const normalized = this.normalizeText(communication);

    // Liste de mots-clés prioritaires (types de transactions courants)
    const priorityKeywords = [
      'inscription', 'cotisation', 'sortie', 'formation', 'piscine',
      'materiel', 'calyfiesta', 'croisette', 'zeeland', 'zelande',
      'lifras', 'febras', 'subside', 'assurance', 'ovh'
    ];

    // Chercher si un mot prioritaire est présent
    for (const keyword of priorityKeywords) {
      if (normalized.includes(keyword)) {
        return keyword;
      }
    }

    // Sinon, prendre le premier mot significatif (> 3 caractères)
    const words = normalized.split(/\s+/).filter(word => word.length > 3);
    return words.length > 0 ? words[0] : 'inconnu';
  }

  /**
   * Arrondit un montant pour créer des groupes de montants similaires
   * Ex: 199.00, 199.50, 198.00 → tous deviennent "199"
   */
  private static roundAmount(amount: number): string {
    const absAmount = Math.abs(amount);

    // Pour les montants < 50€, arrondir au plus proche
    if (absAmount < 50) {
      return Math.round(absAmount).toString();
    }

    // Pour les montants 50-200€, arrondir à la dizaine
    if (absAmount < 200) {
      return (Math.round(absAmount / 10) * 10).toString();
    }

    // Pour les montants > 200€, arrondir à la cinquantaine
    return (Math.round(absAmount / 50) * 50).toString();
  }

  /**
   * Apprend d'une catégorisation manuelle et stocke dans Firestore
   * NOUVEAU: Utilise le mot-clé principal + montant arrondi au lieu de la contrepartie
   */
  static async learnFromUserInput(
    clubId: string,
    transaction: TransactionBancaire,
    category: string,
    accountCode: string
  ): Promise<void> {
    if (!category || !accountCode) {
      console.warn('[CategorizationService] Missing required fields for learning');
      return;
    }

    try {
      // Extraire le mot-clé principal de la communication
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const keywords = this.extractKeywords(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);

      // Créer un ID unique basé sur: keyword + montant arrondi + code comptable
      // Ex: "inscription_199_730_00_712" ou "cotisation_70_730_00_712"
      const patternId = `${primaryKeyword}_${roundedAmount}_${accountCode.replace(/[^a-z0-9]/gi, '_')}`;

      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');
      const patternDocRef = doc(patternsRef, patternId);

      // Vérifier si le pattern existe déjà
      const existingDoc = await getDocs(query(patternsRef, where('__name__', '==', patternId)));

      if (existingDoc.empty) {
        // Créer un nouveau pattern
        await setDoc(patternDocRef, {
          primary_keyword: primaryKeyword,
          keywords,
          montant_arrondi: parseFloat(roundedAmount),
          categorie: category,
          code_comptable: accountCode,
          use_count: 1,
          last_used: serverTimestamp(),
          created_at: serverTimestamp(),
          // Garder l'ancien champ pour compatibilité
          contrepartie_normalized: this.normalizeText(transaction.contrepartie_nom || '')
        });
        console.log('[CategorizationService] ✨ Created new keyword-based pattern:', patternId);
      } else {
        // Mettre à jour le pattern existant
        await updateDoc(patternDocRef, {
          use_count: increment(1),
          last_used: serverTimestamp(),
          // Mettre à jour les keywords si nouveaux
          keywords: keywords.length > 0 ? keywords : existingDoc.docs[0].data().keywords
        });
        console.log('[CategorizationService] ✨ Updated keyword-based pattern:', patternId);
      }
    } catch (error) {
      console.error('[CategorizationService] Error learning from user input:', error);
    }
  }

  /**
   * Obtient les catégories suggérées basées sur l'historique Firestore
   * NOUVEAU: Match sur keyword + montant au lieu de contrepartie
   */
  static async getSuggestionsFromHistory(
    clubId: string,
    transaction: TransactionBancaire
  ): Promise<{ category: string; accountCode: string; count: number; categoryLabel?: string; codeLabel?: string; matchReason?: string }[]> {
    if (!transaction.communication && !transaction.montant) return [];

    try {
      const primaryKeyword = this.extractPrimaryKeyword(transaction.communication || '');
      const roundedAmount = this.roundAmount(transaction.montant);
      const patternsRef = collection(db, 'clubs', clubId, 'categorization_patterns');

      // Stratégie 1: Match exact sur keyword + montant
      const exactQuery = query(
        patternsRef,
        where('primary_keyword', '==', primaryKeyword),
        where('montant_arrondi', '==', parseFloat(roundedAmount)),
        orderBy('use_count', 'desc'),
        limit(3)
      );

      const exactSnapshot = await getDocs(exactQuery);

      if (!exactSnapshot.empty) {
        console.log(`[CategorizationService] 🎯 Found ${exactSnapshot.size} exact matches for "${primaryKeyword}" + ${roundedAmount}€`);

        const suggestions = exactSnapshot.docs.map(doc => {
          const data = doc.data();
          const category = this.getAllCategories().find(c => c.id === data.categorie);
          const accountCode = this.getAllAccountCodes().find(ac => ac.code === data.code_comptable);

          return {
            category: data.categorie,
            accountCode: data.code_comptable,
            count: data.use_count || 1,
            categoryLabel: category?.nom,
            codeLabel: accountCode?.label,
            matchReason: `Mot-clé "${primaryKeyword}" + montant ${roundedAmount}€`
          };
        });

        return suggestions;
      }

      // Stratégie 2: Match sur keyword seul (si montant ne matche pas)
      const keywordQuery = query(
        patternsRef,
        where('primary_keyword', '==', primaryKeyword),
        orderBy('use_count', 'desc'),
        limit(3)
      );

      const keywordSnapshot = await getDocs(keywordQuery);

      if (!keywordSnapshot.empty) {
        console.log(`[CategorizationService] 🔍 Found ${keywordSnapshot.size} keyword-only matches for "${primaryKeyword}"`);

        const suggestions = keywordSnapshot.docs.map(doc => {
          const data = doc.data();
          const category = this.getAllCategories().find(c => c.id === data.categorie);
          const accountCode = this.getAllAccountCodes().find(ac => ac.code === data.code_comptable);

          return {
            category: data.categorie,
            accountCode: data.code_comptable,
            count: data.use_count || 1,
            categoryLabel: category?.nom,
            codeLabel: accountCode?.label,
            matchReason: `Mot-clé "${primaryKeyword}"`
          };
        });

        return suggestions;
      }

      // Stratégie 3: Fallback sur l'ancien système (contrepartie) pour compatibilité
      if (transaction.contrepartie_nom) {
        const contrepartieNormalized = this.normalizeText(transaction.contrepartie_nom);
        const fallbackQuery = query(
          patternsRef,
          where('contrepartie_normalized', '==', contrepartieNormalized),
          orderBy('use_count', 'desc'),
          limit(2)
        );

        const fallbackSnapshot = await getDocs(fallbackQuery);

        if (!fallbackSnapshot.empty) {
          console.log(`[CategorizationService] 📋 Found ${fallbackSnapshot.size} legacy matches for "${transaction.contrepartie_nom}"`);

          const suggestions = fallbackSnapshot.docs.map(doc => {
            const data = doc.data();
            const category = this.getAllCategories().find(c => c.id === data.categorie);
            const accountCode = this.getAllAccountCodes().find(ac => ac.code === data.code_comptable);

            return {
              category: data.categorie,
              accountCode: data.code_comptable,
              count: data.use_count || 1,
              categoryLabel: category?.nom,
              codeLabel: accountCode?.label,
              matchReason: `Nom "${transaction.contrepartie_nom}" (ancien système)`
            };
          });

          return suggestions;
        }
      }

      console.log(`[CategorizationService] ❌ No suggestions found for "${primaryKeyword}" (${roundedAmount}€)`);
      return [];
    } catch (error) {
      console.error('[CategorizationService] Error getting suggestions:', error);
      return [];
    }
  }

  /**
   * Importer les patterns depuis les transactions existantes
   * Utilise pour initialiser le système de learning avec l'historique
   */
  static async importPatternsFromTransactions(
    clubId: string,
    transactions: TransactionBancaire[]
  ): Promise<{ imported: number; skipped: number; errors: number }> {
    const stats = { imported: 0, skipped: 0, errors: 0 };

    console.log(`[CategorizationService] 🔄 Importing patterns from ${transactions.length} transactions...`);

    for (const transaction of transactions) {
      // Ignorer les transactions sans code comptable ou sans contrepartie
      if (!transaction.code_comptable || !transaction.contrepartie_nom) {
        stats.skipped++;
        continue;
      }

      // Ignorer les transactions parent (ventilées)
      if (transaction.is_parent) {
        stats.skipped++;
        continue;
      }

      try {
        // Utiliser la fonction learnFromUserInput existante
        await this.learnFromUserInput(
          clubId,
          transaction,
          transaction.categorie || 'autre',
          transaction.code_comptable
        );
        stats.imported++;

        // Log progress every 50 transactions
        if (stats.imported % 50 === 0) {
          console.log(`[CategorizationService] 📊 Progress: ${stats.imported} patterns imported...`);
        }
      } catch (error) {
        console.error('[CategorizationService] ❌ Error importing pattern:', error);
        stats.errors++;
      }
    }

    console.log('[CategorizationService] ✅ Import complete:', stats);
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
}