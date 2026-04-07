import { logger } from '@/utils/logger';
/**
 * Service pour l'extraction automatique des fournisseurs depuis les transactions bancaires
 *
 * Ce service permet de:
 * 1. Extraire tous les bénéficiaires uniques des dépenses (montant < 0)
 * 2. Filtrer les membres de l'organisation
 * 3. Détecter les fournisseurs déjà existants
 * 4. Créer automatiquement les nouveaux fournisseurs
 */

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TransactionBancaire, Fournisseur, Membre } from '@/types';
import { getFournisseurs, createFournisseur, CreateFournisseurDTO } from './fournisseurService';
import { getMembres } from './membreService';

// ============================================================
// TYPES
// ============================================================

export interface BeneficiaryCandidate {
  /** Nom du bénéficiaire (depuis contrepartie_nom) */
  nom: string;
  /** IBAN du bénéficiaire (depuis contrepartie_iban) */
  iban: string;
  /** Années où des transactions ont été trouvées */
  source_annees: number[];
  /** Nombre total de transactions */
  nombre_transactions: number;
  /** Montant total des transactions (négatif = dépenses) */
  montant_total: number;
  /** Date de la première transaction */
  premiere_transaction: Date;
  /** Date de la dernière transaction */
  derniere_transaction: Date;
  /** Raison d'exclusion si applicable */
  exclusion_reason?: 'member' | 'existing_supplier' | 'no_iban' | 'no_name';
  /** Nom du membre correspondant si exclu */
  matched_member_name?: string;
  /** ID du fournisseur existant si doublon */
  existing_supplier_id?: string;
}

export interface ExtractionResult {
  /** Tous les bénéficiaires trouvés (avant filtrage) */
  all_beneficiaries: BeneficiaryCandidate[];
  /** Candidats valides pour création */
  valid_candidates: BeneficiaryCandidate[];
  /** Bénéficiaires exclus (membres) */
  excluded_members: BeneficiaryCandidate[];
  /** Bénéficiaires déjà fournisseurs */
  existing_suppliers: BeneficiaryCandidate[];
  /** Bénéficiaires sans IBAN valide */
  no_iban: BeneficiaryCandidate[];
  /** Bénéficiaires sans nom */
  no_name: BeneficiaryCandidate[];
  /** Statistiques */
  stats: {
    total_transactions_analyzed: number;
    total_expense_transactions: number;
    unique_beneficiaries: number;
    valid_candidates: number;
    excluded_members: number;
    existing_suppliers: number;
    invalid_data: number;
  };
}

export interface CreationResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: Array<{
    nom: string;
    iban: string;
    reason: string;
  }>;
  created_suppliers: Array<{
    id: string;
    nom: string;
    iban: string;
  }>;
}

// ============================================================
// UTILITAIRES
// ============================================================

/**
 * Normalise un nom pour comparaison
 */
function normalizeNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer accents
    .replace(/[^a-z0-9]/g, ' ')       // Garder alphanum
    .replace(/\s+/g, ' ')             // Espaces multiples
    .trim();
}

/**
 * Normalise un IBAN pour comparaison
 */
function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase();
}

/**
 * Calcule la similarité entre deux chaînes (Levenshtein normalisé)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  if (str1 === str2) return 1;

  const len1 = str1.length;
  const len2 = str2.length;
  const maxLen = Math.max(len1, len2);

  if (maxLen === 0) return 1;

  // Matrice de distance de Levenshtein
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // Suppression
        matrix[i][j - 1] + 1,      // Insertion
        matrix[i - 1][j - 1] + cost // Substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  return 1 - distance / maxLen;
}

/**
 * Vérifie si deux noms correspondent
 */
function isNameMatch(name1: string, name2: string): boolean {
  const n1 = normalizeNom(name1);
  const n2 = normalizeNom(name2);

  if (!n1 || !n2) return false;

  // Match exact
  if (n1 === n2) return true;

  // Un nom contient l'autre (pour les noms composés)
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Similarité > 80%
  return calculateSimilarity(n1, n2) > 0.8;
}

/**
 * Vérifie si un IBAN est valide (basique)
 */
function isValidIban(iban: string): boolean {
  if (!iban) return false;
  const clean = normalizeIban(iban);
  return clean.length >= 15 && clean.length <= 34;
}

// ============================================================
// EXTRACTION
// ============================================================

/**
 * Extrait tous les bénéficiaires uniques des transactions de dépenses
 */
export async function extractBeneficiaries(clubId: string): Promise<Map<string, BeneficiaryCandidate>> {
  const transactionsRef = collection(db, 'clubs', clubId, 'transactions_bancaires');

  // Récupérer toutes les transactions (on filtrera côté client pour montant < 0)
  const snapshot = await getDocs(transactionsRef);

  const beneficiariesMap = new Map<string, BeneficiaryCandidate>();

  snapshot.forEach((doc) => {
    const data = doc.data() as TransactionBancaire;

    // Filtrer: uniquement les dépenses
    if (data.montant >= 0) return;

    // Ignorer les transactions enfants (ventilations)
    if (data.is_child) return;

    const iban = normalizeIban(data.contrepartie_iban || '');
    const nom = (data.contrepartie_nom || '').trim();

    // Clé unique: IBAN si disponible, sinon nom normalisé
    const key = iban || normalizeNom(nom);
    if (!key) return;

    const dateExecution = data.date_execution instanceof Date
      ? data.date_execution
      : new Date(data.date_execution);

    const year = dateExecution.getFullYear();

    if (beneficiariesMap.has(key)) {
      // Mettre à jour le candidat existant
      const existing = beneficiariesMap.get(key)!;
      existing.nombre_transactions++;
      existing.montant_total += data.montant;

      if (!existing.source_annees.includes(year)) {
        existing.source_annees.push(year);
      }

      if (dateExecution < existing.premiere_transaction) {
        existing.premiere_transaction = dateExecution;
      }
      if (dateExecution > existing.derniere_transaction) {
        existing.derniere_transaction = dateExecution;
      }

      // Mettre à jour le nom si meilleur (plus long, plus complet)
      if (nom && nom.length > existing.nom.length) {
        existing.nom = nom;
      }
      // Mettre à jour l'IBAN s'il était manquant
      if (iban && !existing.iban) {
        existing.iban = iban;
      }
    } else {
      // Nouveau candidat
      beneficiariesMap.set(key, {
        nom: nom,
        iban: iban,
        source_annees: [year],
        nombre_transactions: 1,
        montant_total: data.montant,
        premiere_transaction: dateExecution,
        derniere_transaction: dateExecution,
      });
    }
  });

  // Trier les années
  beneficiariesMap.forEach((candidate) => {
    candidate.source_annees.sort((a, b) => a - b);
  });

  return beneficiariesMap;
}

/**
 * Filtre les bénéficiaires qui sont des membres de l'organisation
 */
export async function filterMembers(
  candidates: BeneficiaryCandidate[],
  clubId: string
): Promise<{ filtered: BeneficiaryCandidate[]; excluded: BeneficiaryCandidate[] }> {
  const membres = await getMembres(clubId);

  // Créer des maps pour recherche rapide
  const memberIbans = new Set<string>();
  const memberNames: Array<{ normalized: string; display: string }> = [];

  membres.forEach((membre: Membre) => {
    // IBANs des membres
    if (membre.iban) {
      memberIbans.add(normalizeIban(membre.iban));
    }
    if (membre.ibans) {
      membre.ibans.forEach((iban: string) => {
        if (iban) memberIbans.add(normalizeIban(iban));
      });
    }

    // Noms des membres
    const fullName = `${membre.prenom || ''} ${membre.nom || ''}`.trim();
    if (fullName) {
      memberNames.push({
        normalized: normalizeNom(fullName),
        display: fullName,
      });
    }
    // Aussi vérifier nom seul (pour les noms de famille courants)
    if (membre.nom) {
      memberNames.push({
        normalized: normalizeNom(membre.nom),
        display: membre.nom,
      });
    }
  });

  const filtered: BeneficiaryCandidate[] = [];
  const excluded: BeneficiaryCandidate[] = [];

  for (const candidate of candidates) {
    let isMember = false;
    let matchedName = '';

    // Vérifier par IBAN
    if (candidate.iban && memberIbans.has(normalizeIban(candidate.iban))) {
      isMember = true;
      matchedName = 'IBAN correspondant';
    }

    // Vérifier par nom
    if (!isMember && candidate.nom) {
      const candidateNormalized = normalizeNom(candidate.nom);
      for (const memberName of memberNames) {
        if (isNameMatch(candidateNormalized, memberName.normalized)) {
          isMember = true;
          matchedName = memberName.display;
          break;
        }
      }
    }

    if (isMember) {
      excluded.push({
        ...candidate,
        exclusion_reason: 'member',
        matched_member_name: matchedName,
      });
    } else {
      filtered.push(candidate);
    }
  }

  return { filtered, excluded };
}

/**
 * Filtre les bénéficiaires qui sont déjà des fournisseurs
 */
export async function filterExistingSuppliers(
  candidates: BeneficiaryCandidate[],
  clubId: string
): Promise<{ filtered: BeneficiaryCandidate[]; existing: BeneficiaryCandidate[] }> {
  const fournisseurs = await getFournisseurs(clubId);

  // Créer des maps pour recherche rapide
  const supplierIbans = new Map<string, Fournisseur>();
  const supplierNames = new Map<string, Fournisseur>();

  fournisseurs.forEach((fournisseur: Fournisseur) => {
    if (fournisseur.iban) {
      supplierIbans.set(normalizeIban(fournisseur.iban), fournisseur);
    }
    if (fournisseur.nom) {
      supplierNames.set(normalizeNom(fournisseur.nom), fournisseur);
    }
  });

  const filtered: BeneficiaryCandidate[] = [];
  const existing: BeneficiaryCandidate[] = [];

  for (const candidate of candidates) {
    let existingSupplier: Fournisseur | undefined;

    // Vérifier par IBAN (prioritaire)
    if (candidate.iban) {
      existingSupplier = supplierIbans.get(normalizeIban(candidate.iban));
    }

    // Vérifier par nom
    if (!existingSupplier && candidate.nom) {
      const candidateNormalized = normalizeNom(candidate.nom);
      // Match exact d'abord
      existingSupplier = supplierNames.get(candidateNormalized);

      // Sinon, chercher un match partiel
      if (!existingSupplier) {
        for (const [normalizedName, fournisseur] of supplierNames) {
          if (isNameMatch(candidateNormalized, normalizedName)) {
            existingSupplier = fournisseur;
            break;
          }
        }
      }
    }

    if (existingSupplier) {
      existing.push({
        ...candidate,
        exclusion_reason: 'existing_supplier',
        existing_supplier_id: existingSupplier.id,
      });
    } else {
      filtered.push(candidate);
    }
  }

  return { filtered, existing };
}

// ============================================================
// ORCHESTRATION
// ============================================================

/**
 * Exécute l'extraction complète et retourne les résultats
 */
export async function runExtraction(clubId: string): Promise<ExtractionResult> {
  logger.debug('🔍 Démarrage de l\'extraction des fournisseurs...');

  // 1. Extraire tous les bénéficiaires des dépenses
  const beneficiariesMap = await extractBeneficiaries(clubId);
  const allBeneficiaries = Array.from(beneficiariesMap.values());
  logger.debug(`📊 ${allBeneficiaries.length} bénéficiaires uniques trouvés`);

  // 2. Séparer ceux sans IBAN ou sans nom
  const noIban: BeneficiaryCandidate[] = [];
  const noName: BeneficiaryCandidate[] = [];
  const withValidData: BeneficiaryCandidate[] = [];

  for (const candidate of allBeneficiaries) {
    if (!candidate.nom || candidate.nom.trim() === '') {
      noName.push({ ...candidate, exclusion_reason: 'no_name' });
    } else if (!isValidIban(candidate.iban)) {
      noIban.push({ ...candidate, exclusion_reason: 'no_iban' });
    } else {
      withValidData.push(candidate);
    }
  }

  logger.debug(`⚠️ ${noIban.length} sans IBAN valide, ${noName.length} sans nom`);

  // 3. Filtrer les membres
  const { filtered: afterMemberFilter, excluded: excludedMembers } = await filterMembers(withValidData, clubId);
  logger.debug(`👥 ${excludedMembers.length} membres exclus`);

  // 4. Filtrer les fournisseurs existants
  const { filtered: validCandidates, existing: existingSuppliers } = await filterExistingSuppliers(afterMemberFilter, clubId);
  logger.debug(`🏢 ${existingSuppliers.length} fournisseurs déjà existants`);

  logger.debug(`✅ ${validCandidates.length} candidats valides pour création`);

  // Calculer les stats
  const totalTransactions = allBeneficiaries.reduce((sum, b) => sum + b.nombre_transactions, 0);

  return {
    all_beneficiaries: allBeneficiaries,
    valid_candidates: validCandidates,
    excluded_members: excludedMembers,
    existing_suppliers: existingSuppliers,
    no_iban: noIban,
    no_name: noName,
    stats: {
      total_transactions_analyzed: totalTransactions,
      total_expense_transactions: totalTransactions,
      unique_beneficiaries: allBeneficiaries.length,
      valid_candidates: validCandidates.length,
      excluded_members: excludedMembers.length,
      existing_suppliers: existingSuppliers.length,
      invalid_data: noIban.length + noName.length,
    },
  };
}

// ============================================================
// CREATION
// ============================================================

/**
 * Crée les fournisseurs sélectionnés
 */
export async function createSuppliers(
  candidates: BeneficiaryCandidate[],
  clubId: string,
  createdBy: string
): Promise<CreationResult> {
  const result: CreationResult = {
    success: true,
    created: 0,
    skipped: 0,
    errors: [],
    created_suppliers: [],
  };

  for (const candidate of candidates) {
    // Validation finale
    if (!candidate.nom || candidate.nom.trim() === '') {
      result.errors.push({
        nom: candidate.nom || '(vide)',
        iban: candidate.iban,
        reason: 'Nom manquant',
      });
      result.skipped++;
      continue;
    }

    if (!isValidIban(candidate.iban)) {
      result.errors.push({
        nom: candidate.nom,
        iban: candidate.iban || '(vide)',
        reason: 'IBAN invalide ou manquant',
      });
      result.skipped++;
      continue;
    }

    try {
      const fournisseurData: CreateFournisseurDTO = {
        nom: candidate.nom.trim(),
        iban: normalizeIban(candidate.iban),
        pays: 'Belgique',
      };

      const newId = await createFournisseur(clubId, fournisseurData, createdBy);

      result.created_suppliers.push({
        id: newId,
        nom: candidate.nom,
        iban: candidate.iban,
      });
      result.created++;

      logger.debug(`✅ Fournisseur créé: ${candidate.nom} (${newId})`);
    } catch (error: any) {
      result.errors.push({
        nom: candidate.nom,
        iban: candidate.iban,
        reason: error.message || 'Erreur inconnue',
      });
      result.skipped++;
      logger.error(`❌ Erreur création ${candidate.nom}:`, error);
    }
  }

  result.success = result.errors.length === 0;

  logger.debug(`📊 Résultat: ${result.created} créés, ${result.skipped} ignorés, ${result.errors.length} erreurs`);

  return result;
}
