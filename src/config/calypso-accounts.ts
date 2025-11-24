import { AccountCode } from '@/types';

export const calypsoAccountCodes: AccountCode[] = [
  // Cotisations et affiliations
  { code: '730-00-712', label: 'Cotisations des membres plongeurs (V)', type: 'revenue', category: 'cotisations' },
  { code: '730-00-713', label: 'Cotisations instructeurs (V)', type: 'revenue', category: 'cotisations' },
  { code: '730-00-714', label: 'Cotisations administrateurs (V)', type: 'revenue', category: 'cotisations' },
  { code: '730-00-715', label: 'Cotisation autres (V)', type: 'revenue', category: 'cotisations' },
  { code: '730-00-610', label: 'Lifras - Cotisation club (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-611', label: 'Lifras - Cotisation membres (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-612', label: 'Cotisations des membres plongeurs (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-613', label: 'Cotisations instructeurs (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-614', label: 'Cotisations administrateurs (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-615', label: 'Cotisation autres (A)', type: 'expense', category: 'cotisations' },
  { code: '730-00-711', label: 'Lifras - Cotisation membres (V)', type: 'revenue', category: 'cotisations' },

  // Assurances
  { code: '611-00-616', label: 'Assurance sport', type: 'expense', category: 'assurances' },
  { code: '611-00-618', label: 'Assurance "administrateurs"', type: 'expense', category: 'assurances' },
  { code: '611-00-619', label: 'Assurance matériel', type: 'expense', category: 'assurances' },

  // Piscine et matériel
  { code: '610-00-621', label: 'Location piscine', type: 'expense', category: 'piscine' },
  { code: '610-00-628', label: 'Salles de cours & frais', type: 'expense', category: 'piscine' },
  { code: '610-00-629', label: 'Portes ouvertes', type: 'expense', category: 'piscine' },
  { code: '612-00-622', label: 'Entretien & réparation matériel', type: 'expense', category: 'materiel' },
  { code: '612-00-623', label: 'Frais de compresseur', type: 'expense', category: 'materiel' },
  { code: '612-00-624', label: 'Achat de matériel', type: 'expense', category: 'materiel' },
  { code: '612-00-625', label: 'Divers dépenses bassin', type: 'expense', category: 'piscine' },
  { code: '700-00-720', label: 'Entrées bassin (vacances scolaires)', type: 'revenue', category: 'piscine' },

  // Sorties et activités
  { code: '617-00-630', label: 'Sortie école de mer année courante (A)', type: 'expense', category: 'sorties' },
  { code: '617-00-634', label: 'Sortie école de mer année precedente (A)', type: 'expense', category: 'sorties' },
  { code: '617-00-730', label: 'Sortie école de mer année courante (V)', type: 'revenue', category: 'sorties' },
  { code: '617-00-734', label: 'Sortie école de mer année precedente (V)', type: 'revenue', category: 'sorties' },
  { code: '618-00-632', label: 'Sorties plongées (A)', type: 'expense', category: 'sorties' },
  { code: '618-00-732', label: 'Sorties plongées (V)', type: 'revenue', category: 'sorties' },
  { code: '619-00-633', label: 'Sorties non plongées (A)', type: 'expense', category: 'sorties' },
  { code: '619-00-733', label: 'Sorties non plongées (V)', type: 'revenue', category: 'sorties' },

  // Boutique et stock
  { code: '600-00-641', label: 'Stock Boutique (A)', type: 'expense', category: 'boutique' },
  { code: '600-00-741', label: 'Stock boutique (V)', type: 'revenue', category: 'boutique' },
  { code: '604-00-640', label: 'Remboursement Boutique', type: 'expense', category: 'boutique' },
  { code: '604-00-740', label: 'Vente Boutique', type: 'revenue', category: 'boutique' },
  { code: '713-00-642', label: 'Depreciation Stock Boutique', type: 'expense', category: 'boutique' },
  { code: '713-00-742', label: 'Valorisation Stock Boutique', type: 'revenue', category: 'boutique' },

  // Site web et formation
  { code: '614-00-643', label: 'Site Web', type: 'expense', category: 'administration' },
  { code: '614-00-629', label: 'Portes ouvertes', type: 'expense', category: 'administration' },
  { code: '615-00-644', label: 'TSA', type: 'expense', category: 'administration' },
  { code: '615-00-646', label: 'Divers activités (A)', type: 'expense', category: 'activites' },
  { code: '615-00-746', label: 'Divers activités (V)', type: 'revenue', category: 'activites' },
  { code: '616-00-645', label: 'Frais lié au passage de brevet de moniteur', type: 'expense', category: 'formation' },

  // Soirée annuelle
  { code: '664-00-650', label: 'Soirée annuelle - Dépenses (A)', type: 'expense', category: 'evenements' },
  { code: '664-00-750', label: 'Soirée annuelle - Recettes (V)', type: 'revenue', category: 'evenements' },
  { code: '764-00-750', label: 'Soirée annuelle - Bénéfice exceptionnel (V)', type: 'revenue', category: 'evenements' },

  // Frais bancaires et divers
  { code: '657-00-660', label: 'Frais de banque', type: 'expense', category: 'frais_bancaires' },
  { code: '657-00-760', label: 'Intérêts banque', type: 'revenue', category: 'frais_bancaires' },
  { code: '750-00-760', label: 'Intérêts banque', type: 'revenue', category: 'frais_bancaires' },
  { code: '613-00-662', label: 'Réunions moniteurs-instructeurs', type: 'expense', category: 'reunions' },
  { code: '613-00-663', label: 'Réunions du CA', type: 'expense', category: 'reunions' },
  { code: '613-00-664', label: 'Assemblées générales', type: 'expense', category: 'reunions' },
  { code: '620-00-665', label: 'Cadeaux (mariages, départ,…)', type: 'expense', category: 'divers' },
  { code: '620-00-666', label: 'Divers (A)', type: 'expense', category: 'divers' },
  { code: '620-00-766', label: 'Divers (V)', type: 'revenue', category: 'divers' },

  // Subsides
  { code: '15-000-770', label: 'Subsides communaux', type: 'revenue', category: 'subsides' },
  { code: '15-000-771', label: 'Subsides Lifras', type: 'revenue', category: 'subsides' },
  { code: '15-000-772', label: 'Subsides ADEPS', type: 'revenue', category: 'subsides' },

  // Reports année suivante
  { code: '490-00-631', label: 'Sortie école de mer année suivante (A)', type: 'expense', category: 'reports' },
  { code: '490-00-635', label: 'Frais engagés pour activités année suivante (A)', type: 'expense', category: 'reports' },
  { code: '493-00-719', label: 'Cotisation plongeurs a reporter', type: 'revenue', category: 'reports' },
  { code: '493-00-731', label: 'Sortie école de mer année suivante (V)', type: 'revenue', category: 'reports' },
  { code: '493-00-735', label: 'Perception pour activités année suivante (V)', type: 'revenue', category: 'reports' },

  // Comptes de bilan
  { code: '340-00-602', label: 'Report stock boutique', type: 'asset', category: 'bilan' },
  { code: '340-00-702', label: 'Report stock boutique', type: 'asset', category: 'bilan' },
  { code: '5500-0-700', label: 'Report Compte courant', type: 'asset', category: 'bilan' },
  { code: '5510-0-701', label: 'Report Compte epargne', type: 'asset', category: 'bilan' },
  { code: '570-00-703', label: 'Report caisse boutique', type: 'asset', category: 'bilan' },
  { code: '571-00-704', label: 'Report caisse piscine', type: 'asset', category: 'bilan' }
];

/**
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

// Fonction pour obtenir les codes par type avec tri par fréquence
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

  // Trier par fréquence (fréquents en premier) puis par code
  return codes.sort((a, b) => {
    if (a.isFrequent && !b.isFrequent) return -1;
    if (!a.isFrequent && b.isFrequent) return 1;
    return a.code.localeCompare(b.code);
  });
}

// Fonction pour obtenir un code par son identifiant
export function getAccountCodeByCode(code: string): AccountCode | undefined {
  return calypsoAccountCodes.find(ac => ac.code === code);
}

// Fonction pour obtenir les codes par catégorie
export function getAccountCodesByCategory(category: string): AccountCode[] {
  return calypsoAccountCodes.filter(code => code.category === category);
}

// Fonction pour obtenir uniquement les codes fréquents
export function getFrequentAccountCodes(isExpense?: boolean): AccountCode[] {
  // Appliquer les personnalisations et filtrer les fréquents
  let codes = calypsoAccountCodes
    .map(code => {
      if (accountCodesCache.customCodes[code.code]) {
        return { ...code, ...accountCodesCache.customCodes[code.code] };
      }
      return code;
    })
    .filter(code => code.isFrequent === true);

  // Si un type est spécifié, filtrer par type
  if (isExpense !== undefined) {
    const type = isExpense ? 'expense' : 'revenue';
    codes = codes.filter(code => code.type === type);
  }

  return codes.sort((a, b) => a.code.localeCompare(b.code));
}