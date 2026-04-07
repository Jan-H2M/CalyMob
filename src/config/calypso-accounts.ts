import { AccountCode } from '@/types';

export const calypsoAccountCodes: AccountCode[] = [
  // Cotisations et affiliations - Revenue (V)
  { code: '730-00-711', label: 'Cotisation plongeur (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  { code: '730-00-712', label: 'Cotisation instructeur (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  { code: '730-00-713', label: 'Cotisation administrateur (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  { code: '730-00-714', label: 'Cotisation nageur (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  { code: '730-00-715', label: 'Cotisation autre (ex 2ème appartenance) (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  { code: '730-00-716', label: 'Cotisation autre (ex 2ème appartenance) (V)', type: 'revenue', categories: ['cotisations_revenu'] },
  // Cotisations et affiliations - Expense (A)
  { code: '730-00-610', label: 'Lifras - Cotisation club (A)', type: 'expense', categories: ['cotisations_depense'] },
  { code: '730-00-611', label: 'Lifras - Cotisation membres (A)', type: 'expense', categories: ['cotisations_depense'] },
  { code: '730-00-612', label: 'Cotisations des membres plongeurs (A)', type: 'expense', categories: ['cotisations_depense'] },
  { code: '730-00-613', label: 'Cotisations instructeurs (A)', type: 'expense', categories: ['cotisations_depense'] },
  { code: '730-00-614', label: 'Cotisations administrateurs (A)', type: 'expense', categories: ['cotisations_depense'] },
  { code: '730-00-615', label: 'Cotisation autres (A)', type: 'expense', categories: ['cotisations_depense'] },

  // Assurances
  { code: '611-00-616', label: 'Assurance sport', type: 'expense', categories: ['assurances'] },
  { code: '611-00-618', label: 'Assurance "administrateurs"', type: 'expense', categories: ['assurances'] },
  { code: '611-00-619', label: 'Assurance matériel', type: 'expense', categories: ['assurances'] },

  // Piscine et matériel
  { code: '610-00-621', label: 'Location piscine', type: 'expense', categories: ['piscine_depense'] },
  { code: '610-00-628', label: 'Salles de cours & frais', type: 'expense', categories: ['piscine_depense'] },
  { code: '610-00-629', label: 'Portes ouvertes', type: 'expense', categories: ['piscine_depense'] },
  { code: '612-00-622', label: 'Entretien & réparation matériel', type: 'expense', categories: ['materiel'] },
  { code: '612-00-623', label: 'Frais de compresseur', type: 'expense', categories: ['materiel'] },
  { code: '612-00-624', label: 'Achat de matériel', type: 'expense', categories: ['materiel'] },
  { code: '612-00-625', label: 'Divers dépenses bassin', type: 'expense', categories: ['piscine_depense'] },
  { code: '700-00-720', label: 'Entrées bassin (vacances scolaires)', type: 'revenue', categories: ['piscine_revenu'] },

  // Sorties et activités
  { code: '617-00-630', label: 'Sortie école de mer année courante (A)', type: 'expense', categories: ['sorties_depense'] },
  { code: '617-00-634', label: 'Sortie école de mer année precedente (A)', type: 'expense', categories: ['sorties_depense'] },
  { code: '617-00-730', label: 'Sortie école de mer année courante (V)', type: 'revenue', categories: ['sorties_revenu'] },
  { code: '617-00-734', label: 'Sortie école de mer année precedente (V)', type: 'revenue', categories: ['sorties_revenu'] },
  { code: '618-00-632', label: 'Sorties plongées (A)', type: 'expense', categories: ['sorties_depense'] },
  { code: '618-00-732', label: 'Sorties plongées (V)', type: 'revenue', categories: ['sorties_revenu'] },
  { code: '619-00-633', label: 'Sorties non plongées (A)', type: 'expense', categories: ['sorties_depense'] },
  { code: '619-00-733', label: 'Sorties non plongées (V)', type: 'revenue', categories: ['sorties_revenu'] },

  // Boutique et stock
  { code: '600-00-641', label: 'Stock Boutique (A)', type: 'expense', categories: ['boutique_depense'] },
  { code: '600-00-741', label: 'Stock boutique (V)', type: 'revenue', categories: ['boutique_revenu'] },
  { code: '604-00-640', label: 'Remboursement Boutique', type: 'expense', categories: ['boutique_depense'] },
  { code: '604-00-740', label: 'Vente Boutique', type: 'revenue', categories: ['boutique_revenu'] },
  { code: '713-00-642', label: 'Depreciation Stock Boutique', type: 'expense', categories: ['boutique_depense'] },
  { code: '713-00-742', label: 'Valorisation Stock Boutique', type: 'revenue', categories: ['boutique_revenu'] },

  // Site web et formation
  { code: '614-00-643', label: 'Site Web', type: 'expense', categories: ['administration'] },
  { code: '615-00-644', label: 'TSA', type: 'expense', categories: ['administration'] },
  { code: '615-00-646', label: 'Divers activités (A)', type: 'expense', categories: ['activites_depense'] },
  { code: '615-00-746', label: 'Divers activités (V)', type: 'revenue', categories: ['activites_revenu'] },
  { code: '616-00-645', label: 'Frais lié au passage de brevet de moniteur', type: 'expense', categories: ['formation'] },

  // Soirée annuelle
  { code: '664-00-650', label: 'Soirée annuelle - Dépenses (A)', type: 'expense', categories: ['evenements_depense'] },
  { code: '664-00-750', label: 'Soirée annuelle - Recettes (V)', type: 'revenue', categories: ['evenements_revenu'] },
  { code: '764-00-750', label: 'Soirée annuelle - Bénéfice exceptionnel (V)', type: 'revenue', categories: ['evenements_revenu'] },

  // Frais bancaires et divers
  { code: '657-00-660', label: 'Frais de banque', type: 'expense', categories: ['frais_bancaires_depense'] },
  { code: '750-00-760', label: 'Intérêts banque', type: 'revenue', categories: ['frais_bancaires_revenu'] },
  { code: '613-00-662', label: 'Réunions moniteurs-instructeurs', type: 'expense', categories: ['reunions'] },
  { code: '613-00-663', label: 'Réunions du CA', type: 'expense', categories: ['reunions'] },
  { code: '613-00-664', label: 'Assemblées générales', type: 'expense', categories: ['reunions'] },
  { code: '620-00-665', label: 'Cadeaux (mariages, départ,…)', type: 'expense', categories: ['divers_depense'] },
  { code: '620-00-666', label: 'Divers (A)', type: 'expense', categories: ['divers_depense'] },
  { code: '620-00-766', label: 'Divers (V)', type: 'revenue', categories: ['divers_revenu'] },

  // Subsides
  { code: '15-000-770', label: 'Subsides communaux', type: 'revenue', categories: ['subsides'] },
  { code: '15-000-771', label: 'Subsides Lifras', type: 'revenue', categories: ['subsides'] },
  { code: '15-000-772', label: 'Subsides ADEPS', type: 'revenue', categories: ['subsides'] },

  // Reports année suivante - Classe 4: comptes de bilan
  { code: '490-00-631', label: 'Sortie école de mer année suivante (A)', type: 'asset', categories: ['reports_depense'] },
  { code: '490-00-635', label: 'Frais engagés pour activités année suivante (A)', type: 'asset', categories: ['reports_depense'] },
  { code: '493-00-719', label: 'Cotisation plongeurs a reporter', type: 'liability', categories: ['reports_revenu'] },
  { code: '493-00-731', label: 'Sortie école de mer année suivante (V)', type: 'liability', categories: ['reports_revenu'] },
  { code: '493-00-735', label: 'Perception pour activités année suivante (V)', type: 'liability', categories: ['reports_revenu'] },

  // Comptes de bilan
  { code: '340-00-602', label: 'Report stock boutique', type: 'asset', categories: ['bilan'] },
  { code: '340-00-702', label: 'Report stock boutique', type: 'asset', categories: ['bilan'] },
  { code: '5500-0-700', label: 'Report Compte courant', type: 'asset', categories: ['bilan'] },
  { code: '5510-0-701', label: 'Report Compte epargne', type: 'asset', categories: ['bilan'] },
  { code: '570-00-703', label: 'Report caisse boutique', type: 'asset', categories: ['bilan'] },
  { code: '571-00-704', label: 'Report caisse piscine', type: 'asset', categories: ['bilan'] },

  // Immobilisations corporelles (Classe 2) - Matériel de plongée
  { code: '240-00-001', label: 'Matériel de plongée - Gilets', type: 'asset', categories: ['immobilisations'] },
  { code: '240-00-002', label: 'Matériel de plongée - Détendeurs', type: 'asset', categories: ['immobilisations'] },
  { code: '240-00-003', label: 'Matériel de plongée - Bouteilles', type: 'asset', categories: ['immobilisations'] },
  { code: '240-00-004', label: 'Matériel de plongée - Ordinateurs', type: 'asset', categories: ['immobilisations'] },
  { code: '240-00-005', label: 'Matériel de plongée - Divers', type: 'asset', categories: ['immobilisations'] },

  // Amortissements actés (Classe 26) - Contrepartie des immobilisations
  { code: '260-00-001', label: 'Amortissements matériel - Gilets', type: 'asset', categories: ['amortissements'] },
  { code: '260-00-002', label: 'Amortissements matériel - Détendeurs', type: 'asset', categories: ['amortissements'] },
  { code: '260-00-003', label: 'Amortissements matériel - Bouteilles', type: 'asset', categories: ['amortissements'] },
  { code: '260-00-004', label: 'Amortissements matériel - Ordinateurs', type: 'asset', categories: ['amortissements'] },
  { code: '260-00-005', label: 'Amortissements matériel - Divers', type: 'asset', categories: ['amortissements'] },

  // Dotations aux amortissements (Classe 63) - Charges annuelles
  { code: '630-00-001', label: 'Dotations aux amortissements - Gilets', type: 'expense', categories: ['amortissements'] },
  { code: '630-00-002', label: 'Dotations aux amortissements - Détendeurs', type: 'expense', categories: ['amortissements'] },
  { code: '630-00-003', label: 'Dotations aux amortissements - Bouteilles', type: 'expense', categories: ['amortissements'] },
  { code: '630-00-004', label: 'Dotations aux amortissements - Ordinateurs', type: 'expense', categories: ['amortissements'] },
  { code: '630-00-005', label: 'Dotations aux amortissements - Divers', type: 'expense', categories: ['amortissements'] },

  // Cautions et dépôts (Classe 4) - Prêts de matériel
  { code: '439-00-001', label: 'Cautions reçues - Prêts matériel', type: 'liability' },
  { code: '439-00-002', label: 'Cautions remboursées - Prêts matériel', type: 'liability' }
];

/**
 * @deprecated Use AccountCodeService instead. This cache is kept for backward compatibility only.
 * Cache pour les codes personnalisés
 * Chargé depuis Firebase via loadAccountCodesCache()
 */
let accountCodesCache: {
  customCodes: Record<string, any>;
  selectedCodes: string[];
} = {
  customCodes: {},
  selectedCodes: []
};

/**
 * @deprecated Use AccountCodeService.refresh(clubId) instead.
 * Charger le cache des codes comptables
 * À appeler au démarrage de l'application ou lors de changements
 */
export function loadAccountCodesCache(customCodes: Record<string, any>, selectedCodes: string[]): void {
  accountCodesCache = { customCodes, selectedCodes };
}

// Fonction pour obtenir tous les codes Calypso
export function getCalypsoAccountCodes(): AccountCode[] {
  return calypsoAccountCodes;
}

/**
 * @deprecated Use AccountCodeService.getByType(type) or CategorizationService.getAccountCodesByType(isExpense) instead.
 * Fonction pour obtenir les codes par type avec tri par fréquence
 */
export function getCalypsoAccountCodesByType(isExpense: boolean): AccountCode[] {
  const type = isExpense ? 'expense' : 'revenue';

  const selectedCodesSet = accountCodesCache.selectedCodes.length > 0
    ? new Set(accountCodesCache.selectedCodes)
    : null;

  // Appliquer les personnalisations et filtrer
  let codes = calypsoAccountCodes
    .map(code => {
      // Appliquer les personnalisations si elles existent
      if (accountCodesCache.customCodes[code.code]) {
        return { ...code, ...accountCodesCache.customCodes[code.code] };
      }
      return code;
    })
    .filter(code => {
      const matchesType = code.type === type;
      const isSelected = selectedCodesSet ? selectedCodesSet.has(code.code) : true;
      return matchesType && isSelected;
    });

  // Trier par code
  return codes.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * @deprecated Use AccountCodeService.getByCode(code) instead.
 * Fonction pour obtenir un code par son identifiant
 * Cherche dans les codes personnalisés ET les codes statiques
 */
export function getAccountCodeByCode(code: string): AccountCode | undefined {
  // D'abord chercher dans le cache (codes personnalisés)
  const customCode = accountCodesCache.customCodes[code];
  if (customCode?.label) {
    return customCode as AccountCode;
  }

  // Sinon chercher dans les codes statiques
  const staticCode = calypsoAccountCodes.find(ac => ac.code === code);

  // Fusionner si le code statique a des personnalisations
  if (staticCode && customCode) {
    return { ...staticCode, ...customCode };
  }

  return staticCode;
}

// Fonction pour obtenir les codes par catégorie
export function getAccountCodesByCategory(categoryId: string): AccountCode[] {
  return calypsoAccountCodes.filter(code => code.categories?.includes(categoryId));
}