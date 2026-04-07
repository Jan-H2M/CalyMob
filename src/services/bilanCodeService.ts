import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { BilanCode } from '@/types';
import { AccountCodeService } from '@/services/accountCodeService';
import { calypsoAccountCodes } from '@/config/calypso-accounts';
import { logger } from '@/utils/logger';

/**
 * Codes de Bilan par défaut basés sur la structure Calypso DC
 * Structure hiérarchique: 01 > 01.01 > 01.01.01
 */
export const DEFAULT_BILAN_CODES: BilanCode[] = [
  // === ACTIF ===
  // 01 - Actifs immobilisés
  {
    id: '01',
    code: '01',
    name: 'Actifs immobilisés',
    section: 'actif',
    order: 1,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '01.01',
    code: '01.01',
    name: 'Stock matériel (pour mémoire)',
    section: 'actif',
    order: 2,
    parentId: '01',
    calculationType: 'inventory_value',  // Calculé depuis inventaire matériel
    openingSource: 'previous_closing',
    closingSource: 'calculated'
  },

  // 02 - Actifs circulants
  {
    id: '02',
    code: '02',
    name: 'Actifs circulants',
    section: 'actif',
    order: 10,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '02.01',
    code: '02.01',
    name: 'Stock C.D.C.',
    section: 'actif',
    order: 11,
    parentId: '02',
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '02.01.01',
    code: '02.01.01',
    name: 'Boutique',
    section: 'actif',
    order: 12,
    parentId: '02.01',
    calculationType: 'boutique_stock',
    boutiqueType: 'boutique',
    openingSource: 'previous_closing',
    closingSource: 'calculated'
  },
  {
    id: '02.01.02',
    code: '02.01.02',
    name: 'Boutique LIFRAS',
    section: 'actif',
    order: 13,
    parentId: '02.01',
    calculationType: 'boutique_stock',
    boutiqueType: 'boutique_lifras',
    openingSource: 'previous_closing',
    closingSource: 'calculated'
  },
  {
    id: '02.02',
    code: '02.02',
    name: 'Compte épargne',
    section: 'actif',
    order: 20,
    parentId: '02',
    calculationType: 'sum_transactions',
    accountCodes: ['5510-0-701'],
    openingSource: 'previous_closing',  // Auto depuis année précédente
    closingSource: 'opening_plus_movements'
  },
  {
    id: '02.03',
    code: '02.03',
    name: 'Compte à vue',
    section: 'actif',
    order: 21,
    parentId: '02',
    calculationType: 'bank_total',      // Somme de TOUTES les transactions (= P&L result)
    accountCodes: ['5500-0-700'],       // Gardé pour référence, pas utilisé par bank_total
    openingSource: 'previous_closing',  // Auto depuis année précédente
    closingSource: 'opening_plus_movements'
  },
  {
    id: '02.04',
    code: '02.04',
    name: 'Obligations Dette Belge',
    section: 'actif',
    order: 22,
    parentId: '02',
    calculationType: 'manual',
    openingSource: 'manual',
    closingSource: 'manual'
  },

  // 03 - Comptes de régularisation (Actif)
  {
    id: '03',
    code: '03',
    name: 'Comptes de régularisation',
    section: 'actif',
    order: 30,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '03.01',
    code: '03.01',
    name: 'Charges à reporter sortie année suivante',
    section: 'actif',
    order: 31,
    parentId: '03',
    calculationType: 'sum_transactions',
    accountCodes: ['490-00-631', '490-00-635'],
    openingSource: 'manual',
    closingSource: 'opening_plus_movements'  // Auto-calculé: opening + mouvements de l'année
  },
  {
    id: '03.02',
    code: '03.02',
    name: 'Assurance matériel année suivante',
    section: 'actif',
    order: 32,
    parentId: '03',
    calculationType: 'sum_transactions',
    accountCodes: ['611-00-619'],
    openingSource: 'manual',
    closingSource: 'opening_plus_movements'  // Auto-calculé: opening + mouvements de l'année
  },

  // === PASSIF ===
  // 04 - Fonds Social
  {
    id: '04',
    code: '04',
    name: 'Fonds Social',
    section: 'passif',
    order: 40,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '04.01',
    code: '04.01',
    name: 'Résultat reporté',
    section: 'passif',
    order: 41,
    parentId: '04',
    calculationType: 'result_carryforward',  // Accumule: opening + résultat année précédente (04.03)
    openingSource: 'previous_closing',       // Report automatique de l'année précédente
    closingSource: 'calculated'
  },
  {
    id: '04.02',
    code: '04.02',
    name: 'Fonds affectés',
    section: 'passif',
    order: 42,
    parentId: '04',
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '04.02.01',
    code: '04.02.01',
    name: 'Fonds affectés 2021',
    section: 'passif',
    order: 43,
    parentId: '04.02',
    calculationType: 'manual',
    openingSource: 'manual',
    closingSource: 'manual'
  },
  {
    id: '04.03',
    code: '04.03',
    name: "Résultat de l'exercice",
    section: 'passif',
    order: 44,
    parentId: '04',
    calculationType: 'pl_result',  // Calculé depuis le Compte de Résultats (P&L)
    openingSource: 'zero',         // Opening = 0 (vorig resultaat gaat naar 04.01 Résultat reporté)
    closingSource: 'calculated'
  },

  // 05 - Provisions pour charges et risques divers
  {
    id: '05',
    code: '05',
    name: 'Provision pour charges et risques divers',
    section: 'passif',
    order: 50,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '05.01',
    code: '05.01',
    name: 'Provision pr entretien/achat matériel',
    section: 'passif',
    order: 51,
    parentId: '05',
    calculationType: 'manual',
    openingSource: 'manual',
    closingSource: 'manual'
  },
  {
    id: '05.02',
    code: '05.02',
    name: 'Provision Location Piscine',
    section: 'passif',
    order: 52,
    parentId: '05',
    calculationType: 'manual',
    openingSource: 'manual',
    closingSource: 'manual'
  },

  // 06 - Comptes de Régularisation (Passif)
  {
    id: '06',
    code: '06',
    name: 'Comptes de régularisation',
    section: 'passif',
    order: 60,
    calculationType: 'sum_children',
    openingSource: 'calculated',
    closingSource: 'calculated'
  },
  {
    id: '06.01',
    code: '06.01',
    name: 'Cotisations plongeurs année suivante',
    section: 'passif',
    order: 61,
    parentId: '06',
    calculationType: 'sum_transactions',
    accountCodes: ['493-00-719'],
    openingSource: 'manual',
    closingSource: 'opening_plus_movements'  // Auto-calculé: opening + mouvements de l'année
  },
  {
    id: '06.02',
    code: '06.02',
    name: 'Sorties Club année suivante',
    section: 'passif',
    order: 62,
    parentId: '06',
    calculationType: 'sum_transactions',
    accountCodes: ['493-00-731', '493-00-735'],
    openingSource: 'manual',
    closingSource: 'opening_plus_movements'  // Auto-calculé: opening + mouvements de l'année
  },
  {
    id: '06.03',
    code: '06.03',
    name: 'Paiement année courante afférant à suivante',
    section: 'passif',
    order: 63,
    parentId: '06',
    calculationType: 'manual',
    openingSource: 'manual',
    closingSource: 'manual'
  }
];

/**
 * Récupérer les codes de bilan d'un club
 * Retourne les codes par défaut si aucune config n'existe
 */
export async function getBilanCodes(clubId: string): Promise<BilanCode[]> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'settings', 'bilan_codes');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().codes) {
      return docSnap.data().codes as BilanCode[];
    }

    // Retourner les codes par défaut
    return DEFAULT_BILAN_CODES;
  } catch (error) {
    logger.error('Erreur lors de la récupération des codes de bilan:', error);
    return DEFAULT_BILAN_CODES;
  }
}

/**
 * Valide les codes comptables contre le plan comptable Calypso
 * Retourne les codes valides et invalides
 */
export function validateAccountCodes(codes: string[]): {
  valid: string[];
  invalid: string[];
} {
  const allCodes = AccountCodeService.isReady()
    ? AccountCodeService.getAllCodes()
    : calypsoAccountCodes;
  const validAccountCodes = allCodes.map(c => c.code);
  const valid: string[] = [];
  const invalid: string[] = [];

  codes.forEach(code => {
    if (validAccountCodes.includes(code)) {
      valid.push(code);
    } else {
      invalid.push(code);
    }
  });

  return { valid, invalid };
}

/**
 * Sauvegarder les codes de bilan d'un club
 * Valide les accountCodes avant sauvegarde et log les codes invalides
 */
export async function saveBilanCodes(clubId: string, codes: BilanCode[]): Promise<void> {
  try {
    // Validation des accountCodes
    for (const code of codes) {
      if (code.accountCodes && code.accountCodes.length > 0) {
        const { invalid } = validateAccountCodes(code.accountCodes);
        if (invalid.length > 0) {
          logger.warn(`[BilanCodes] Code ${code.id} (${code.name}) has invalid accountCodes: ${invalid.join(', ')}`);
        }
      }
    }

    const docRef = doc(db, 'clubs', clubId, 'settings', 'bilan_codes');
    await setDoc(docRef, {
      codes,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erreur lors de la sauvegarde des codes de bilan:', error);
    throw error;
  }
}

/**
 * Réinitialiser les codes de bilan aux valeurs par défaut
 */
export async function resetBilanCodesToDefault(clubId: string): Promise<BilanCode[]> {
  await saveBilanCodes(clubId, DEFAULT_BILAN_CODES);
  return DEFAULT_BILAN_CODES;
}

/**
 * Obtenir les codes par défaut (sans accès Firestore)
 */
export function getDefaultBilanCodes(): BilanCode[] {
  return DEFAULT_BILAN_CODES;
}

/**
 * Construire l'arbre hiérarchique des codes de bilan
 */
export function buildBilanTree(codes: BilanCode[]): {
  actif: BilanCode[];
  passif: BilanCode[];
} {
  const sortedCodes = [...codes].sort((a, b) => a.order - b.order);

  return {
    actif: sortedCodes.filter(c => c.section === 'actif'),
    passif: sortedCodes.filter(c => c.section === 'passif')
  };
}

/**
 * Obtenir les enfants directs d'un code
 */
export function getChildCodes(codes: BilanCode[], parentId: string): BilanCode[] {
  return codes.filter(c => c.parentId === parentId).sort((a, b) => a.order - b.order);
}

/**
 * Obtenir le niveau de profondeur d'un code (0 = racine, 1 = premier niveau, etc.)
 */
export function getCodeDepth(code: string): number {
  return code.split('.').length - 1;
}

/**
 * Vérifier si un code est une feuille (n'a pas d'enfants)
 */
export function isLeafCode(codes: BilanCode[], codeId: string): boolean {
  return !codes.some(c => c.parentId === codeId);
}
