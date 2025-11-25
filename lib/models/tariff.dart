/// Modèle de tarif pour un événement
/// Permet des prix différents selon la fonction du membre
class Tariff {
  final String id;
  final String label; // "Membre", "Encadrant", "CA", etc.
  final String category; // "membre", "encadrant", "ca" (référence fonction)
  final double price;
  final bool isDefault;
  final int displayOrder;

  Tariff({
    required this.id,
    required this.label,
    required this.category,
    required this.price,
    this.isDefault = false,
    this.displayOrder = 0,
  });

  /// Convertir depuis Firestore
  factory Tariff.fromMap(Map<String, dynamic> data) {
    return Tariff(
      id: data['id'] ?? '',
      label: data['label'] ?? '',
      category: data['category'] ?? '',
      price: (data['price'] ?? 0).toDouble(),
      isDefault: data['is_default'] ?? false,
      displayOrder: data['display_order'] ?? 0,
    );
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
    };
  }

  @override
  String toString() {
    return 'Tariff(label: $label, category: $category, price: $price€)';
  }
}
