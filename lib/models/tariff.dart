/// Modèle de tarif pour un événement
/// Permet des prix différents selon la fonction du membre
class Tariff {
  final String id;
  final String label; // "Membre", "Encadrant", "CA", etc.
  final String category; // "membre", "encadrant", "ca" (référence fonction)
  final double price;
  final bool isDefault;
  final int displayOrder;

  /// True when this tariff applies to guests (non-members brought by a member).
  /// Members can pick it from CalyMob's "Add guest" dialog when the parent
  /// event has allowGuests=true. Default false.
  final bool isGuestTariff;
  final bool selfSelectable;
  final bool requiresAdminValidation;
  final Map<String, double> installmentAmounts;

  Tariff({
    required this.id,
    required this.label,
    required this.category,
    required this.price,
    this.isDefault = false,
    this.displayOrder = 0,
    this.isGuestTariff = false,
    this.selfSelectable = true,
    this.requiresAdminValidation = false,
    this.installmentAmounts = const {},
  });

  /// Convertir depuis Firestore
  factory Tariff.fromMap(Map<String, dynamic> data) {
    final label = data['label'] ?? '';
    // Use category if provided, otherwise derive from label (webapp compatibility)
    final category = data['category'] ?? _deriveCategoryFromLabel(label);

    return Tariff(
      id: data['id'] ?? '',
      label: label,
      category: category,
      price: (data['price'] ?? 0).toDouble(),
      isDefault: data['is_default'] ?? false,
      displayOrder: data['display_order'] ?? 0,
      isGuestTariff: data['is_guest_tariff'] ?? false,
      selfSelectable: data['self_selectable'] != false,
      requiresAdminValidation: data['requires_admin_validation'] == true,
      installmentAmounts: _parseInstallmentAmounts(data['installment_amounts']),
    );
  }

  static Map<String, double> _parseInstallmentAmounts(dynamic data) {
    if (data is! Map) return const {};
    return data.map((key, value) {
      final amount =
          value is num ? value.toDouble() : double.tryParse('$value') ?? 0.0;
      return MapEntry(key.toString(), amount);
    });
  }

  /// Derive category from label for webapp compatibility
  /// The webapp only stores label and price, not category
  static String _deriveCategoryFromLabel(String label) {
    final normalized = label.toLowerCase().trim();
    if (normalized.contains('encadrant')) return 'encadrant';
    if (normalized.contains('ca') || normalized.contains('comité')) return 'ca';
    if (normalized.contains('junior')) return 'junior';
    if (normalized.contains('étudiant') || normalized.contains('etudiant')) {
      return 'etudiant';
    }
    if (normalized.contains('non-membre') ||
        normalized.contains('non membre')) {
      return 'non_membre';
    }
    if (normalized.contains('membre')) return 'membre';
    // Default: use the label itself as category
    return normalized;
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'label': label,
      'category': category,
      'price': price,
      'is_default': isDefault,
      'display_order': displayOrder,
      'is_guest_tariff': isGuestTariff,
      'self_selectable': selfSelectable,
      'requires_admin_validation': requiresAdminValidation,
      'installment_amounts': installmentAmounts,
    };
  }

  @override
  String toString() {
    return 'Tariff(label: $label, category: $category, price: $price€, guest: $isGuestTariff)';
  }
}
