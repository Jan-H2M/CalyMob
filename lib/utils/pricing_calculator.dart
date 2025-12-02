import '../models/operation.dart';
import '../models/tariff.dart';

/// Utilitaire pour calculer les prix selon les tarifs flexibles CalyCompta
class PricingCalculator {
  /// Calcule le prix pour un membre selon sa fonction
  ///
  /// Logique:
  /// 1. Si event_tariffs existe, chercher le tarif correspondant à la fonction
  /// 2. Sinon, fallback sur l'ancien système (prix_membre/prix_non_membre)
  static double calculatePrice(Operation operation, String memberFunction) {
    // 1. PRIORITÉ : Nouveau système avec tarifs flexibles
    if (operation.eventTariffs != null && operation.eventTariffs!.isNotEmpty) {
      final tariff = _getTariffForFunction(operation.eventTariffs!, memberFunction);
      if (tariff != null) {
        return tariff.price;
      }

      // Si fonction non trouvée, prendre le tarif par défaut
      final defaultTariff = operation.eventTariffs!.firstWhere(
        (t) => t.isDefault,
        orElse: () => operation.eventTariffs!.first,
      );
      return defaultTariff.price;
    }

    // 2. FALLBACK : Ancien système
    // Tous les membres payent le même prix
    return operation.prixMembre ?? 0.0;
  }

  /// Trouve le tarif correspondant à une fonction
  /// Applique une normalisation pour gérer les variations (pluriel, casse, etc.)
  static Tariff? _getTariffForFunction(List<Tariff> tariffs, String fonction) {
    final normalizedFunction = _normalizeCategory(fonction);

    return tariffs.cast<Tariff?>().firstWhere(
      (t) => _normalizeCategory(t!.category) == normalizedFunction,
      orElse: () => null,
    );
  }

  /// Normalise une catégorie pour la comparaison
  ///
  /// Exemples:
  /// - "Encadrants" → "encadrant"
  /// - "MEMBRE" → "membre"
  /// - "ca" → "ca"
  static String _normalizeCategory(String category) {
    var normalized = category.toLowerCase().trim();

    // Supprimer le 's' final (pluriel)
    if (normalized.endsWith('s') && normalized != 'ca') {
      normalized = normalized.substring(0, normalized.length - 1);
    }

    return normalized;
  }

  /// Détermine la fonction d'un membre selon son clubStatuten
  ///
  /// Priorité (ordre décroissant):
  /// 1. "Encadrants" → fonction = "encadrant"
  /// 2. "CA" → fonction = "ca"
  /// 3. "Membre" → fonction = "membre"
  ///
  /// Si clubStatuten est vide/null → fonction = "membre"
  static String determineMemberFunction(List<String>? clubStatuten) {
    if (clubStatuten == null || clubStatuten.isEmpty) {
      return 'membre';
    }

    // Priorité 1: Encadrants
    if (clubStatuten.any((s) => _normalizeCategory(s) == 'encadrant')) {
      return 'encadrant';
    }

    // Priorité 2: CA
    if (clubStatuten.contains('CA') || clubStatuten.contains('ca')) {
      return 'ca';
    }

    // Priorité 3: Membre (défaut)
    return 'membre';
  }

  /// Retourne le label de la fonction pour l'affichage
  static String getFunctionLabel(String function) {
    switch (function.toLowerCase()) {
      case 'encadrant':
        return 'Encadrant';
      case 'ca':
        return 'CA';
      case 'tresorier':
        return 'Trésorier';
      case 'membre':
        return 'Membre';
      default:
        return function;
    }
  }

  /// Vérifie si un événement a des tarifs flexibles configurés
  static bool hasFlexiblePricing(Operation operation) {
    return operation.eventTariffs != null && operation.eventTariffs!.isNotEmpty;
  }

  /// Retourne tous les tarifs disponibles pour un événement
  static List<Tariff> getAvailableTariffs(Operation operation) {
    if (operation.eventTariffs != null && operation.eventTariffs!.isNotEmpty) {
      // Trier par display_order
      final sorted = List<Tariff>.from(operation.eventTariffs!);
      sorted.sort((a, b) => a.displayOrder.compareTo(b.displayOrder));
      return sorted;
    }

    // Fallback: créer des tarifs depuis l'ancien système
    return [
      Tariff(
        id: 'legacy_membre',
        label: 'Membre',
        category: 'membre',
        price: operation.prixMembre ?? 0.0,
        isDefault: true,
        displayOrder: 1,
      ),
      if (operation.prixNonMembre != null &&
          operation.prixNonMembre != operation.prixMembre)
        Tariff(
          id: 'legacy_non_membre',
          label: 'Non-membre',
          category: 'non_membre',
          price: operation.prixNonMembre!,
          isDefault: false,
          displayOrder: 2,
        ),
    ];
  }
}
