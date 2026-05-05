import 'package:flutter/foundation.dart';

enum DeliveryMode { digital, poolPickup, post, inPerson }

extension DeliveryModeLabel on DeliveryMode {
  String get label {
    switch (this) {
      case DeliveryMode.digital:
        return 'Digital';
      case DeliveryMode.poolPickup:
        return 'Retrait piscine';
      case DeliveryMode.post:
        return 'Envoi postal';
      case DeliveryMode.inPerson:
        return 'Remise en main propre';
    }
  }
}

@immutable
class CartItem {
  final String productId;
  final String variantId;
  final int qty;
  final DeliveryMode deliveryMode;
  final String name;
  final String variantLabel;
  final double unitPrice;
  final String? imageUrl;

  const CartItem({
    required this.productId,
    required this.variantId,
    required this.qty,
    required this.deliveryMode,
    required this.name,
    required this.variantLabel,
    required this.unitPrice,
    this.imageUrl,
  });

  double get lineTotal => unitPrice * qty;

  CartItem copyWith({
    int? qty,
    DeliveryMode? deliveryMode,
    String? name,
    String? variantLabel,
    double? unitPrice,
    Object? imageUrl = _sentinel,
  }) {
    return CartItem(
      productId: productId,
      variantId: variantId,
      qty: qty ?? this.qty,
      deliveryMode: deliveryMode ?? this.deliveryMode,
      name: name ?? this.name,
      variantLabel: variantLabel ?? this.variantLabel,
      unitPrice: unitPrice ?? this.unitPrice,
      imageUrl: imageUrl == _sentinel ? this.imageUrl : imageUrl as String?,
    );
  }
}

const Object _sentinel = Object();

class CartProvider extends ChangeNotifier {
  final List<CartItem> _items = [];

  List<CartItem> get items => List.unmodifiable(_items);

  double get total {
    return _items.fold<double>(0, (sum, item) => sum + item.lineTotal);
  }

  bool get isEmpty => _items.isEmpty;

  bool get requiresPostalAddress {
    return _items.any((item) => item.deliveryMode == DeliveryMode.post);
  }

  void addItem(
    String productId,
    String variantId,
    int qty,
    DeliveryMode deliveryMode, {
    String name = 'Produit Boutique',
    String variantLabel = 'Standard',
    double unitPrice = 0,
    String? imageUrl,
  }) {
    if (qty <= 0) return;

    final index = _items.indexWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          item.deliveryMode == deliveryMode,
    );

    if (index >= 0) {
      final existing = _items[index];
      _items[index] = existing.copyWith(
        qty: existing.qty + qty,
        name: name,
        variantLabel: variantLabel,
        unitPrice: unitPrice,
        imageUrl: imageUrl,
      );
    } else {
      _items.add(
        CartItem(
          productId: productId,
          variantId: variantId,
          qty: qty,
          deliveryMode: deliveryMode,
          name: name,
          variantLabel: variantLabel,
          unitPrice: unitPrice,
          imageUrl: imageUrl,
        ),
      );
    }

    notifyListeners();
  }

  void removeItem(
    String productId,
    String variantId,
    DeliveryMode deliveryMode,
  ) {
    _items.removeWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          item.deliveryMode == deliveryMode,
    );
    notifyListeners();
  }

  void updateQty(
    String productId,
    String variantId,
    DeliveryMode deliveryMode,
    int qty,
  ) {
    final index = _items.indexWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          item.deliveryMode == deliveryMode,
    );
    if (index < 0) return;

    if (qty <= 0) {
      _items.removeAt(index);
    } else {
      _items[index] = _items[index].copyWith(qty: qty);
    }
    notifyListeners();
  }

  void clear() {
    _items.clear();
    notifyListeners();
  }
}
