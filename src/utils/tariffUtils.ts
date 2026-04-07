import { logger } from '@/utils/logger';
/**
 * Utilitaires pour calcul des tarifs d'événements
 * Fonctions pures pour déterminer le prix selon la fonction du membre
 */

import type { Tariff } from '@/types/tariff.types';
import type { Operation, Membre } from '@/types';

/**
 * Récupère le tarif pour une fonction donnée depuis une liste de tarifs.
 *
 * @param tariffs - Liste des tarifs de l'événement
 * @param fonction - Fonction recherchée (ex: "membre", "encadrant", "ca")
 * @returns Le prix trouvé, ou null si aucun tarif ne correspond
 *
 * @example
 * ```ts
 * const tariffs = [
 *   { id: '1', label: 'Membre', category: 'membre', price: 8, is_default: true, display_order: 1 },
 *   { id: '2', label: 'Encadrant', category: 'encadrant', price: 4, is_default: false, display_order: 2 }
 * ];
 * getTariffForFunction(tariffs, 'encadrant'); // 4
 * getTariffForFunction(tariffs, 'unknown'); // null
 * ```
 */
export function getTariffForFunction(
  tariffs: Tariff[],
  fonction: string
): number | null {
  // Normaliser la fonction pour la comparaison (minuscule, sans 's' final)
  const normalizedFonction = fonction.toLowerCase().replace(/s$/, '');

  const tariff = tariffs.find(t => {
    // Normaliser la catégorie du tarif pour la comparaison
    const normalizedCategory = t.category.toLowerCase().replace(/s$/, '');
    return normalizedCategory === normalizedFonction;
  });

  return tariff?.price ?? null;
}

/**
 * Calcule le prix d'inscription pour un membre à un événement.
 *
 * Logique :
 * 1. Cherche le tarif correspondant à la fonction dans event_tariffs
 * 2. Si aucun tarif trouvé, retourne 0 avec un warning console
 *
 * @param operation - L'événement concerné
 * @param fonction - La fonction du participant pour cet événement
 * @returns Le prix calculé (0 si aucun tarif trouvé)
 *
 * @example
 * ```ts
 * const event = {
 *   id: 'evt1',
 *   event_tariffs: [
 *     { id: '1', label: 'Membre', category: 'membre', price: 8, is_default: true, display_order: 1 },
 *     { id: '2', label: 'Encadrant', category: 'encadrant', price: 4, is_default: false, display_order: 2 }
 *   ]
 * };
 * computeRegistrationPrice(event, 'membre'); // 8
 * computeRegistrationPrice(event, 'encadrant'); // 4
 * computeRegistrationPrice(event, 'unknown'); // 0 (avec warning)
 * ```
 */
export function computeRegistrationPrice(
  operation: Operation,
  fonction: string
): number {
  // Si event_tariffs est défini, on l'utilise (nouveau système)
  if (operation.event_tariffs && operation.event_tariffs.length > 0) {
    const price = getTariffForFunction(operation.event_tariffs, fonction);

    if (price === null) {
      logger.warn(
        `[tariffUtils] Aucun tarif trouvé pour la fonction "${fonction}" dans l'événement ${operation.id}. ` +
        `Prix par défaut : 0€`
      );
      return 0;
    }

    return price;
  }

  // Fallback : ancien système (prix_membre / prix_non_membre)
  // On considère "membre" et "encadrant" comme membres, le reste comme non-membres
  if (fonction === 'membre' || fonction === 'encadrant' || fonction === 'ca' || fonction === 'accueil') {
    return operation.prix_membre ?? 0;
  }

  return operation.prix_non_membre ?? operation.prix_membre ?? 0;
}

/**
 * Copie les tarifs d'un lieu de plongée (DiveLocation) pour créer un événement.
 *
 * Cette fonction crée une copie indépendante des tarifs du lieu.
 * Raison : les tarifs de l'événement peuvent être modifiés sans impacter le lieu template.
 *
 * @param locationTariffs - Tarifs du lieu de plongée
 * @returns Nouvelle copie des tarifs pour l'événement
 *
 * @example
 * ```ts
 * const location = {
 *   tariffs: [
 *     { id: '1', label: 'Membre', category: 'membre', price: 8, is_default: true, display_order: 1 }
 *   ]
 * };
 * const eventTariffs = copyTariffsFromLocation(location.tariffs);
 * // eventTariffs est une copie indépendante
 * ```
 */
export function copyTariffsFromLocation(locationTariffs: Tariff[]): Tariff[] {
  // Deep copy des tarifs pour indépendance totale
  return locationTariffs.map(tariff => ({
    ...tariff,
    id: `tariff_${Date.now()}_${Math.random().toString(36).substring(7)}`, // Nouveau ID unique
  }));
}

/**
 * Détermine la fonction par défaut d'un membre.
 *
 * @param membre - Le membre concerné
 * @returns La fonction par défaut, ou "membre" si non définie
 *
 * @example
 * ```ts
 * const membre1 = { fonction_defaut: 'encadrant' };
 * getDefaultFonction(membre1); // 'encadrant'
 *
 * const membre2 = { fonction_defaut: undefined };
 * getDefaultFonction(membre2); // 'membre'
 * ```
 */
export function getDefaultFonction(membre: Membre): string {
  return membre.fonction_defaut || 'membre';
}

/**
 * Valide qu'un événement a tous les tarifs nécessaires.
 * Utile avant de publier un événement.
 *
 * @param operation - L'événement à valider
 * @param requiredFonctions - Fonctions à vérifier (par défaut : membre + encadrant)
 * @returns Objet avec isValid et liste des fonctions manquantes
 *
 * @example
 * ```ts
 * const event = {
 *   event_tariffs: [
 *     { category: 'membre', price: 8 }
 *   ]
 * };
 * validateEventTariffs(event); // { isValid: false, missingFonctions: ['encadrant'] }
 * ```
 */
export function validateEventTariffs(
  operation: Operation,
  requiredFonctions: string[] = ['membre', 'encadrant']
): { isValid: boolean; missingFonctions: string[] } {
  if (!operation.event_tariffs || operation.event_tariffs.length === 0) {
    return {
      isValid: false,
      missingFonctions: requiredFonctions,
    };
  }

  const missingFonctions = requiredFonctions.filter(
    fonction => getTariffForFunction(operation.event_tariffs!, fonction) === null
  );

  return {
    isValid: missingFonctions.length === 0,
    missingFonctions,
  };
}

/**
 * Calcule le budget prévisionnel total basé sur les tarifs et capacité.
 *
 * @param tariffs - Liste des tarifs
 * @param capaciteMax - Capacité maximale de participants
 * @returns Budget prévisionnel estimé (prix moyen × capacité)
 *
 * @example
 * ```ts
 * const tariffs = [
 *   { category: 'membre', price: 8 },
 *   { category: 'encadrant', price: 4 }
 * ];
 * computeBudgetPrevu(tariffs, 20); // 120 (prix moyen 6€ × 20 participants)
 * ```
 */
export function computeBudgetPrevu(
  tariffs: Tariff[],
  capaciteMax?: number
): number {
  if (!tariffs || tariffs.length === 0 || !capaciteMax) {
    return 0;
  }

  // Prix moyen de tous les tarifs
  const totalPrices = tariffs.reduce((sum, t) => sum + t.price, 0);
  const avgPrice = totalPrices / tariffs.length;

  return Math.round(avgPrice * capaciteMax * 100) / 100; // Arrondi à 2 décimales
}
