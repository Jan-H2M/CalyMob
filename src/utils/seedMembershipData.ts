/**
 * Seed Membership Data
 * Creates the initial Sept 2025 tariffs for the club
 * Can be called from the admin UI or as a migration script
 */

import { MembershipSeasonService } from '@/services/membershipSeasonService';
import { MembershipSeason } from '@/types/cotisations.types';

/**
 * Seed the Sept 2025 membership tariffs
 * Only creates if no seasons exist yet
 */
export async function seedSept2025Tariffs(clubId: string, userId: string): Promise<string | null> {
  // Check if 2025 already exists
  const existing = await MembershipSeasonService.getAllSeasons(clubId);
  if (existing.some(s => s.start_year === 2025)) {
    return null;
  }

  const seasonData: Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'> = {
    label: '2025',
    start_year: 2025,
    is_active: true,
    tariffs: [
      {
        id: 'tar_membre_1ere',
        label: 'Membre en 1ère appartenance',
        code: 'membre_1ere',
        price_jan_dec: 199,
        price_sept_dec: 265,
        footnote_ref: '*1',
        display_order: 0,
      },
      {
        id: 'tar_membre_2e',
        label: 'Membre en 2ème appartenance',
        code: 'membre_2e',
        price_jan_dec: 105,
        price_sept_dec: 140,
        footnote_ref: '*2',
        display_order: 1,
      },
      {
        id: 'tar_instructeur_oa',
        label: 'Instructeurs & membre de l\'O.A.',
        code: 'instructeur_oa',
        price_jan_dec: 165,
        price_sept_dec: null,
        footnote_ref: '*3',
        display_order: 2,
      },
      {
        id: 'tar_instructeur_2e',
        label: 'Instructeurs en 2ème appartenance',
        code: 'instructeur_2e',
        price_jan_dec: 71,
        price_sept_dec: 95,
        display_order: 3,
      },
      {
        id: 'tar_ancien_instructeur',
        label: 'Ancien instructeur',
        code: 'ancien_instructeur',
        price_jan_dec: 182,
        price_sept_dec: null,
        display_order: 4,
      },
      {
        id: 'tar_nageur',
        label: 'Nageur',
        code: 'nageur',
        price_jan_dec: 70,
        price_sept_dec: 93,
        footnote_ref: '*4',
        display_order: 5,
      },
    ],
    footnotes: [
      {
        ref: '*1',
        text: 'Pour les plongeurs jamais inscrits à la LIFRAS, la cotisation de sept → déc est offerte (voir montant dans la colonne à gauche).',
      },
      {
        ref: '*2',
        text: 'Membres déjà affiliés pour l\'année courante dans un autre club LIFRAS.',
      },
      {
        ref: '*3',
        text: 'Les instructeurs sont nommés annuellement (en automne) par le CA.',
      },
      {
        ref: '*4',
        text: 'Seuls sont admis les nageurs membres de la famille d\'un plongeur en règle de cotisation et sous réserve d\'approbation du CA.',
      },
    ],
  };

  const seasonId = await MembershipSeasonService.createSeason(clubId, userId, seasonData);
  return seasonId;
}

/**
 * Seed the 2024 membership tariffs (same prices as 2025 for reference)
 */
export async function seed2024Tariffs(clubId: string, userId: string): Promise<string | null> {
  // Check if 2024 already exists
  const existing = await MembershipSeasonService.getAllSeasons(clubId);
  if (existing.some(s => s.start_year === 2024)) {
    return null;
  }

  const seasonData: Omit<MembershipSeason, 'id' | 'created_at' | 'updated_at' | 'created_by'> = {
    label: '2024',
    start_year: 2024,
    is_active: false,
    tariffs: [
      {
        id: 'tar_membre_1ere_2024',
        label: 'Membre en 1ère appartenance',
        code: 'membre_1ere',
        price_jan_dec: 199,
        price_sept_dec: 265,
        footnote_ref: '*1',
        display_order: 0,
      },
      {
        id: 'tar_membre_2e_2024',
        label: 'Membre en 2ème appartenance',
        code: 'membre_2e',
        price_jan_dec: 105,
        price_sept_dec: 140,
        footnote_ref: '*2',
        display_order: 1,
      },
      {
        id: 'tar_instructeur_oa_2024',
        label: 'Instructeurs & membre de l\'O.A.',
        code: 'instructeur_oa',
        price_jan_dec: 165,
        price_sept_dec: null,
        footnote_ref: '*3',
        display_order: 2,
      },
      {
        id: 'tar_instructeur_2e_2024',
        label: 'Instructeurs en 2ème appartenance',
        code: 'instructeur_2e',
        price_jan_dec: 71,
        price_sept_dec: 95,
        display_order: 3,
      },
      {
        id: 'tar_ancien_instructeur_2024',
        label: 'Ancien instructeur',
        code: 'ancien_instructeur',
        price_jan_dec: 182,
        price_sept_dec: null,
        display_order: 4,
      },
      {
        id: 'tar_nageur_2024',
        label: 'Nageur',
        code: 'nageur',
        price_jan_dec: 70,
        price_sept_dec: 93,
        footnote_ref: '*4',
        display_order: 5,
      },
    ],
    footnotes: [
      {
        ref: '*1',
        text: 'Pour les plongeurs jamais inscrits à la LIFRAS, la cotisation de sept → déc est offerte (voir montant dans la colonne à gauche).',
      },
      {
        ref: '*2',
        text: 'Membres déjà affiliés pour l\'année courante dans un autre club LIFRAS.',
      },
      {
        ref: '*3',
        text: 'Les instructeurs sont nommés annuellement (en automne) par le CA.',
      },
      {
        ref: '*4',
        text: 'Seuls sont admis les nageurs membres de la famille d\'un plongeur en règle de cotisation et sous réserve d\'approbation du CA.',
      },
    ],
  };

  const seasonId = await MembershipSeasonService.createSeason(clubId, userId, seasonData);
  return seasonId;
}
