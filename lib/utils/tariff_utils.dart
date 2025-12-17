import '../models/operation.dart';
import '../models/member_profile.dart';
import '../models/tariff.dart';

/// Utilitaires pour le calcul des tarifs
class TariffUtils {
  /// Obtient le tarif pour une fonction spécifique
  /// Retourne null si aucun tarif trouvé
  static Tariff? getTariffForFunction(List<Tariff> tariffs, String fonction) {
    // Normaliser la fonction pour la comparaison (lowercase, sans 's' final)
    final normalizedFonction = fonction.toLowerCase().replaceAll(RegExp(r's$'), '');

    return tariffs.cast<Tariff?>().firstWhere(
      (t) {
        final normalizedCategory = t!.category.toLowerCase().replaceAll(RegExp(r's$'), '');
        return normalizedCategory == normalizedFonction;
      },
      orElse: () => null,
    );
  }

  /// Calcule le prix d'inscription pour un membre à un événement
  ///
  /// Logique:
  /// 1. Si le membre a une fonction (encadrant, ca, etc.), chercher le tarif correspondant
  /// 2. Sinon, chercher le tarif "membre" par défaut
  /// 3. Fallback: utiliser le système legacy prixMembre/prixNonMembre
  static double computeRegistrationPrice({
    required Operation operation,
    required MemberProfile profile,
  }) {
    // Déterminer la fonction du membre
    final fonction = _getBestFunction(profile);

    // Si event_tariffs existe et n'est pas vide, utiliser le nouveau système
    if (operation.eventTariffs.isNotEmpty) {
      // Chercher d'abord un tarif pour la fonction spécifique du membre
      final tariff = getTariffForFunction(operation.eventTariffs, fonction);

      if (tariff != null) {
        return tariff.price;
      }

      // Si pas de tarif trouvé pour cette fonction, essayer "membre" par défaut
      if (fonction != 'membre') {
        final membreTariff = getTariffForFunction(operation.eventTariffs, 'membre');
        if (membreTariff != null) {
          return membreTariff.price;
        }
      }

      // Si toujours pas trouvé, utiliser le premier tarif disponible (pour sorties avec tarif simple)
      if (operation.eventTariffs.isNotEmpty) {
        return operation.eventTariffs.first.price;
      }

      // Aucun tarif trouvé
      return 0.0;
    }

    // FALLBACK: Système legacy (prix_membre / prix_non_membre)
    // Tous les membres du club (membre, encadrant, ca) obtiennent le prix membre
    return operation.prixMembre ?? 0.0;
  }

  /// Détermine la meilleure fonction à utiliser pour le calcul du tarif
  /// Priorité: encadrant > ca > membre (car encadrant/ca ont souvent des réductions)
  static String _getBestFunction(MemberProfile profile) {
    // Si clubStatuten contient des fonctions, les utiliser
    if (profile.clubStatuten.isNotEmpty) {
      // Chercher dans l'ordre de priorité (tarif le plus avantageux généralement)
      if (_hasFunction(profile.clubStatuten, 'encadrant')) {
        return 'encadrant';
      }
      if (_hasFunction(profile.clubStatuten, 'ca')) {
        return 'ca';
      }
      if (_hasFunction(profile.clubStatuten, 'membre')) {
        return 'membre';
      }
      // Retourner la première fonction trouvée
      return profile.clubStatuten.first.toLowerCase();
    }

    // Utiliser fonction_defaut si disponible
    if (profile.fonctionDefaut != null && profile.fonctionDefaut!.isNotEmpty) {
      return profile.fonctionDefaut!.toLowerCase();
    }

    // Par défaut: membre
    return 'membre';
  }

  /// Vérifie si une liste contient une fonction (insensible à la casse)
  static bool _hasFunction(List<String> functions, String target) {
    final normalizedTarget = target.toLowerCase();
    return functions.any((f) => f.toLowerCase().contains(normalizedTarget));
  }

  /// Affiche le libellé de la fonction d'un membre
  static String getFunctionLabel(MemberProfile profile) {
    final fonction = _getBestFunction(profile);
    switch (fonction) {
      case 'encadrant':
      case 'encadrants':
        return 'Encadrant';
      case 'ca':
        return 'CA';
      case 'membre':
      default:
        return 'Membre';
    }
  }
}
