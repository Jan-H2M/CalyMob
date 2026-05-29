import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

@immutable
class BoutiqueCartItem {
  final String key;
  final String productId;
  final String productName;
  final String? imageUrl;
  final String supplierId;
  final String variantId;
  final String variantLabel;
  final String deliveryMode;
  final String deliveryLabel;
  final int qty;
  final double unitPrice;
  final double deliverySurcharge;
  final Map<String, dynamic> personalization;

  const BoutiqueCartItem({
    required this.key,
    required this.productId,
    required this.productName,
    this.imageUrl,
    required this.supplierId,
    required this.variantId,
    required this.variantLabel,
    required this.deliveryMode,
    required this.deliveryLabel,
    required this.qty,
    required this.unitPrice,
    required this.deliverySurcharge,
    required this.personalization,
  });

  double get lineTotal => (unitPrice * qty) + deliverySurcharge;

  bool get hasPersonalization => personalization.isNotEmpty;

  BoutiqueCartItem copyWith({
    int? qty,
  }) {
    return BoutiqueCartItem(
      key: key,
      productId: productId,
      productName: productName,
      imageUrl: imageUrl,
      supplierId: supplierId,
      variantId: variantId,
      variantLabel: variantLabel,
      deliveryMode: deliveryMode,
      deliveryLabel: deliveryLabel,
      qty: qty ?? this.qty,
      unitPrice: unitPrice,
      deliverySurcharge: deliverySurcharge,
      personalization: personalization,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'key': key,
      'productId': productId,
      'productName': productName,
      'imageUrl': imageUrl,
      'supplierId': supplierId,
      'variantId': variantId,
      'variantLabel': variantLabel,
      'deliveryMode': deliveryMode,
      'deliveryLabel': deliveryLabel,
      'qty': qty,
      'unitPrice': unitPrice,
      'deliverySurcharge': deliverySurcharge,
      'personalization': personalization,
    };
  }

  Map<String, dynamic> toOrderPayload({
    Map<String, dynamic>? deliveryAddress,
  }) {
    return {
      'productId': productId,
      'variantId': variantId,
      'qty': qty,
      'deliveryMode': deliveryMode,
      if (deliveryMode == 'post' && deliveryAddress != null)
        'deliveryAddress': deliveryAddress,
      'unitPrice': unitPrice,
      'deliverySurcharge': deliverySurcharge,
      'lineTotal': lineTotal,
      'supplierId': supplierId,
      'productSnapshot': {
        'name': productName,
        'imageUrl': imageUrl,
        'variantLabel': variantLabel,
        'deliveryLabel': deliveryLabel,
        'personalization': personalization,
      },
      if (personalization.isNotEmpty) 'customizations': personalization,
    };
  }

  static BoutiqueCartItem? fromJson(dynamic value) {
    if (value is! Map) return null;
    final data = Map<String, dynamic>.from(value);
    final productId = data['productId']?.toString();
    final productName = data['productName']?.toString();
    final supplierId = data['supplierId']?.toString();
    final variantId = data['variantId']?.toString();
    final variantLabel = data['variantLabel']?.toString();
    final deliveryMode = data['deliveryMode']?.toString() ?? 'pool_pickup';
    final deliveryLabel =
        data['deliveryLabel']?.toString() ?? 'Retrait piscine';
    final key = data['key']?.toString();
    final qty = data['qty'];
    final unitPrice = data['unitPrice'];
    final deliverySurcharge = data['deliverySurcharge'];

    if (productId == null ||
        productName == null ||
        supplierId == null ||
        variantId == null ||
        variantLabel == null ||
        key == null ||
        qty is! num ||
        unitPrice is! num) {
      return null;
    }

    return BoutiqueCartItem(
      key: key,
      productId: productId,
      productName: productName,
      imageUrl: data['imageUrl']?.toString(),
      supplierId: supplierId,
      variantId: variantId,
      variantLabel: variantLabel,
      deliveryMode: deliveryMode,
      deliveryLabel: deliveryLabel,
      qty: qty.toInt(),
      unitPrice: unitPrice.toDouble(),
      deliverySurcharge: deliverySurcharge is num
          ? deliverySurcharge.toDouble()
          : double.tryParse(deliverySurcharge?.toString() ?? '') ?? 0,
      personalization: data['personalization'] is Map
          ? Map<String, dynamic>.from(data['personalization'])
          : const {},
    );
  }
}

class BoutiqueCartProvider extends ChangeNotifier {
  static const String _storageKey = 'boutique_cart_items_v1';

  final List<BoutiqueCartItem> _items = [];
  bool _loaded = false;

  BoutiqueCartProvider() {
    _load();
  }

  bool get loaded => _loaded;

  List<BoutiqueCartItem> get items => List.unmodifiable(_items);

  bool get isEmpty => _items.isEmpty;

  int get itemCount => _items.fold(0, (sum, item) => sum + item.qty);

  double get itemsSubtotal {
    return _items.fold(0, (sum, item) => sum + (item.unitPrice * item.qty));
  }

  double get deliverySurcharges {
    return _items.fold(0, (sum, item) => sum + item.deliverySurcharge);
  }

  double get total => _items.fold(0, (sum, item) => sum + item.lineTotal);

  bool get requiresPostalAddress {
    return _items.any((item) => item.deliveryMode == 'post');
  }

  Future<void> addItem(BoutiqueCartItem item) async {
    final index = _items.indexWhere((existing) => existing.key == item.key);
    if (index >= 0) {
      final existing = _items[index];
      _items[index] = existing.copyWith(qty: existing.qty + item.qty);
    } else {
      _items.add(item);
    }
    await _persist();
    notifyListeners();
  }

  Future<void> updateQty(String key, int qty) async {
    final index = _items.indexWhere((item) => item.key == key);
    if (index < 0) return;
    if (qty <= 0) {
      _items.removeAt(index);
    } else {
      _items[index] = _items[index].copyWith(qty: qty);
    }
    await _persist();
    notifyListeners();
  }

  Future<void> removeItem(String key) async {
    _items.removeWhere((item) => item.key == key);
    await _persist();
    notifyListeners();
  }

  Future<void> clear() async {
    _items.clear();
    await _persist();
    notifyListeners();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw != null && raw.trim().isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) {
          for (final entry in decoded) {
            final item = BoutiqueCartItem.fromJson(entry);
            if (item != null) _items.add(item);
          }
        }
      } catch (_) {
        await prefs.remove(_storageKey);
      }
    }
    _loaded = true;
    notifyListeners();
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode(_items.map((item) => item.toJson()).toList());
    await prefs.setString(_storageKey, encoded);
  }
}
