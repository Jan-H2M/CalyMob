import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

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

extension DeliveryModeCodec on DeliveryMode {
  String get wireValue {
    switch (this) {
      case DeliveryMode.digital:
        return 'digital';
      case DeliveryMode.poolPickup:
        return 'pool_pickup';
      case DeliveryMode.post:
        return 'post';
      case DeliveryMode.inPerson:
        return 'in_person';
    }
  }

  static DeliveryMode? fromWireValue(String? value) {
    switch (value) {
      case 'digital':
        return DeliveryMode.digital;
      case 'pool_pickup':
        return DeliveryMode.poolPickup;
      case 'post':
        return DeliveryMode.post;
      case 'in_person':
        return DeliveryMode.inPerson;
      default:
        return null;
    }
  }
}

@immutable
class CartItem {
  final String productId;
  final String variantId;
  final int qty;
  final DeliveryMode deliveryMode;
  final Map<String, dynamic> productSnapshot;

  const CartItem({
    required this.productId,
    required this.variantId,
    required this.qty,
    required this.deliveryMode,
    required this.productSnapshot,
  });

  String get name =>
      productSnapshot['name']?.toString() ?? 'Produit Boutique';

  String get variantLabel =>
      productSnapshot['variantLabel']?.toString() ?? 'Standard';

  double get unitPrice => _asDouble(productSnapshot['unitPrice']);

  String? get imageUrl => productSnapshot['imageUrl']?.toString();

  double get lineTotal => unitPrice * qty;

  CartItem copyWith({
    int? qty,
    DeliveryMode? deliveryMode,
    Map<String, dynamic>? productSnapshot,
  }) {
    return CartItem(
      productId: productId,
      variantId: variantId,
      qty: qty ?? this.qty,
      deliveryMode: deliveryMode ?? this.deliveryMode,
      productSnapshot: productSnapshot ?? this.productSnapshot,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'productId': productId,
      'variantId': variantId,
      'qty': qty,
      'deliveryMode': deliveryMode.wireValue,
      'productSnapshot': productSnapshot,
    };
  }

  Map<String, dynamic> toCallablePayload() {
    return {
      'productId': productId,
      'variantId': variantId,
      'qty': qty,
      'deliveryMode': deliveryMode.wireValue,
      'productSnapshot': productSnapshot,
    };
  }

  static CartItem? fromJson(Map<String, dynamic> json) {
    final productId = json['productId']?.toString();
    final variantId = json['variantId']?.toString();
    final qty = json['qty'];
    final deliveryMode = DeliveryModeCodec.fromWireValue(
      json['deliveryMode']?.toString(),
    );
    final productSnapshot = json['productSnapshot'];

    if (productId == null ||
        variantId == null ||
        qty is! num ||
        deliveryMode == null ||
        productSnapshot is! Map) {
      return null;
    }

    return CartItem(
      productId: productId,
      variantId: variantId,
      qty: qty.toInt(),
      deliveryMode: deliveryMode,
      productSnapshot: Map<String, dynamic>.from(productSnapshot),
    );
  }
}

double _asDouble(Object? value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

class CartProvider extends ChangeNotifier {
  static const String _storageKey = 'cart_items_v1';

  final SharedPreferences _prefs;
  final List<CartItem> _items;

  CartProvider._(this._prefs, this._items);

  static Future<CartProvider> load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null || raw.trim().isEmpty) {
      return CartProvider._(prefs, <CartItem>[]);
    }

    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) {
        await prefs.remove(_storageKey);
        return CartProvider._(prefs, <CartItem>[]);
      }

      final items = <CartItem>[];
      for (final entry in decoded) {
        if (entry is! Map) {
          await prefs.remove(_storageKey);
          return CartProvider._(prefs, <CartItem>[]);
        }

        final item = CartItem.fromJson(Map<String, dynamic>.from(entry));
        if (item == null) {
          await prefs.remove(_storageKey);
          return CartProvider._(prefs, <CartItem>[]);
        }
        items.add(item);
      }

      return CartProvider._(prefs, items);
    } catch (_) {
      await prefs.remove(_storageKey);
      return CartProvider._(prefs, <CartItem>[]);
    }
  }

  List<CartItem> get items => List.unmodifiable(_items);

  double get total {
    return _items.fold<double>(0, (sum, item) => sum + item.lineTotal);
  }

  bool get isEmpty => _items.isEmpty;

  bool get requiresPostalAddress {
    return _items.any((item) => item.deliveryMode == DeliveryMode.post);
  }

  Future<void> addItem(
    String productId,
    String variantId,
    int qty,
    DeliveryMode deliveryMode,
    Map<String, dynamic> productSnapshot,
  ) async {
    if (qty <= 0) return;

    final snapshot = Map<String, dynamic>.from(productSnapshot);
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
        productSnapshot: snapshot,
      );
    } else {
      _items.add(
        CartItem(
          productId: productId,
          variantId: variantId,
          qty: qty,
          deliveryMode: deliveryMode,
          productSnapshot: snapshot,
        ),
      );
    }

    await _persistAndNotify();
  }

  Future<void> removeItem(
    String productId,
    String variantId,
    DeliveryMode deliveryMode,
  ) async {
    _items.removeWhere(
      (item) =>
          item.productId == productId &&
          item.variantId == variantId &&
          item.deliveryMode == deliveryMode,
    );
    await _persistAndNotify();
  }

  Future<void> updateQty(
    String productId,
    String variantId,
    DeliveryMode deliveryMode,
    int qty,
  ) async {
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
    await _persistAndNotify();
  }

  Future<void> clear() async {
    _items.clear();
    await _persistAndNotify();
  }

  Future<void> _persistAndNotify() async {
    await _prefs.setString(
      _storageKey,
      jsonEncode(_items.map((item) => item.toJson()).toList()),
    );
    notifyListeners();
  }
}
