/// Model Supplement - Option supplémentaire pour les événements
/// Ex: Location de combinaison, location de palmes, etc.
class Supplement {
  final String id;
  final String name;
  final double price;
  final int displayOrder;

  Supplement({
    required this.id,
    required this.name,
    required this.price,
    this.displayOrder = 0,
  });

  factory Supplement.fromMap(Map<String, dynamic> data) {
    return Supplement(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      price: (data['price'] ?? 0).toDouble(),
      displayOrder: data['display_order'] ?? 0,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'price': price,
      'display_order': displayOrder,
    };
  }
}

/// Selected supplement stored in inscription
/// Snapshot of the supplement at registration time
class SelectedSupplement {
  final String id;
  final String name;
  final double price;

  SelectedSupplement({
    required this.id,
    required this.name,
    required this.price,
  });

  factory SelectedSupplement.fromMap(Map<String, dynamic> data) {
    return SelectedSupplement(
      id: data['id'] ?? '',
      name: data['name'] ?? '',
      price: (data['price'] ?? 0).toDouble(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'price': price,
    };
  }
}
