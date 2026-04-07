import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ReportGroup } from '@/types';
import { validateAccountCodes } from './bilanCodeService';
import { logger } from '@/utils/logger';

/**
 * Groupes de rapport par défaut basés sur le Compte de Résultats CDC
 */
export const DEFAULT_REPORT_GROUPS: ReportGroup[] = [
  {
    id: 'activites_generales',
    name: 'Activités plongées en général',
    order: 1,
    accountCodes: [
      // Volgorde exact zoals officieel bestand van de comptable
      '730-00-610', // Lifras - Cotisation club (A)
      '730-00-611', // Lifras - Cotisation membres (A)
      '730-00-712', // Cotisation plongeur (V)
      '730-00-713', // Cotisation instructeur (V)
      '730-00-714', // Cotisation administrateur (V)
      '730-00-715', // Cotisation nageur (V)
      '730-00-716', // Cotisation autre (ex 2ème appartenance) (V)
      '611-00-616', // Assurance sport
      '611-00-618', // Assurance "administrateurs"
      '611-00-619', // Assurance matériel
    ]
  },
  {
    id: 'piscine',
    name: 'Activités plongées "Piscine"',
    order: 2,
    accountCodes: [
      // Volgorde exact zoals officieel bestand
      '610-00-621', // Location piscine
      '610-00-622', // Location piscine année précédente (A)
      // Na piscine-codes: provisie-regels worden automatisch ingevoegd
      '612-00-622', // Entretien & réparation matériel
      '612-00-623', // Frais de compresseur
      '601-00-624', // Achat de matériel (officieel: 601, niet 612!)
      // Na achat matériel: provisie-regels worden automatisch ingevoegd
      '612-00-625', // Divers dépenses bassin
    ]
  },
  {
    id: 'formation',
    name: 'Formation',
    order: 3,
    accountCodes: [
      '610-00-628', // Salles de cours & frais
      '610-00-629', // Portes ouvertes
    ]
  },
  {
    id: 'sorties_club',
    name: 'Activités "Sorties club"',
    order: 4,
    accountCodes: [
      // Volgorde exact zoals officieel bestand
      '617-00-630', // Sortie école de mer année courante (A)
      '617-00-730', // Sortie école de mer année courante (V)
      '618-00-632', // Sorties plongées (A)
      '618-00-732', // Sorties plongées (V)
      '439-00-001', // Cautions reçues - Prêts matériel
      '439-00-002', // Cautions remboursées - Prêts matériel
      '490-00-631', // Sortie école de mer année suivante (A)
      '493-00-731', // Sortie école de mer année suivante (V)
      '490-00-635', // Frais engagés pour activités année suivante (A)
      '493-00-719', // Cotisation plongeurs a reporter
      '493-00-735', // Perception pour activités année suivante (V)
      // Na régularisation codes: provisie-regels worden automatisch ingevoegd
      '619-00-633', // Sorties non plongées (A)
      '619-00-733', // Sorties non plongées (V)
      '617-00-634', // Sortie école de mer année precedente (A)
    ]
  },
  {
    id: 'activites_connexes',
    name: 'Activités connexes',
    order: 5,
    accountCodes: [
      // Volgorde exact zoals officieel bestand
      '604-00-640', // Stock Divers (A)
      '604-00-740', // Stock Divers (V)
      '604-00-641', // Boutique (A)
      '604-00-741', // Boutique (V)
      '604-00-642', // Boutique LIFRAS (A)
      '604-00-742', // Boutique LIFRAS (V)
      '604-00-743', // Calybar
      '713-00-742', // Valorisation Stock Boutique
      '614-00-643', // Site Web
      '615-00-644', // TSA
      '616-00-645', // Frais lié au passage de brevet de moniteur
      '615-00-646', // Divers activités (A)
      '615-00-746', // Divers activités (V)
    ]
  },
  {
    id: 'soiree_annuelle',
    name: 'Soirée annuelle',
    order: 6,
    accountCodes: [
      // Volgorde: recettes vóór dépenses (zoals officieel)
      '664-00-750', // Soirée annuelle - Recettes (V)
      '664-00-650', // Soirée annuelle - Dépenses (A)
    ]
  },
  {
    id: 'administration',
    name: 'Administration',
    order: 7,
    accountCodes: [
      '657-00-660', // Frais de banque
      '657-00-760', // Intérêt des comptes
      '613-00-662', // Réunions moniteurs-instructeurs
      '613-00-663', // Réunions du CA
      '613-00-664', // Assemblées générales
      '620-00-665', // Cadeaux (mariages, départ,…)
      '620-00-666', // Divers (A)
      '620-00-766', // Divers (V)
    ]
  },
  {
    id: 'subsides',
    name: 'Subsides',
    order: 8,
    accountCodes: [
      '15-000-770', // Subsides communaux
      '15-000-771', // Subsides Lifras
      '15-000-772', // Subsides ADEPS
    ]
  }
];

/**
 * Récupérer les groupes de rapport d'un club
 * Retourne les groupes par défaut si aucune config n'existe
 */
export async function getReportGroups(clubId: string): Promise<ReportGroup[]> {
  try {
    const docRef = doc(db, 'clubs', clubId, 'settings', 'report_groups');
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().groups) {
      return docSnap.data().groups as ReportGroup[];
    }

    // Retourner les groupes par défaut
    return DEFAULT_REPORT_GROUPS;
  } catch (error) {
    logger.error('Erreur lors de la récupération des groupes de rapport:', error);
    return DEFAULT_REPORT_GROUPS;
  }
}

/**
 * Sauvegarder les groupes de rapport d'un club
 * Valide les accountCodes avant sauvegarde et log les codes invalides
 */
export async function saveReportGroups(clubId: string, groups: ReportGroup[]): Promise<void> {
  try {
    // Validation des accountCodes
    for (const group of groups) {
      if (group.accountCodes && group.accountCodes.length > 0) {
        const { invalid } = validateAccountCodes(group.accountCodes);
        if (invalid.length > 0) {
          logger.warn(`[ReportGroups] Group "${group.name}" has invalid accountCodes: ${invalid.join(', ')}`);
        }
      }
    }

    const docRef = doc(db, 'clubs', clubId, 'settings', 'report_groups');
    await setDoc(docRef, {
      groups,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erreur lors de la sauvegarde des groupes de rapport:', error);
    throw error;
  }
}

/**
 * Réinitialiser les groupes de rapport aux valeurs par défaut
 */
export async function resetReportGroupsToDefault(clubId: string): Promise<ReportGroup[]> {
  await saveReportGroups(clubId, DEFAULT_REPORT_GROUPS);
  return DEFAULT_REPORT_GROUPS;
}

/**
 * Obtenir les groupes par défaut (sans accès Firestore)
 */
export function getDefaultReportGroups(): ReportGroup[] {
  return DEFAULT_REPORT_GROUPS;
}
